import test from "node:test";
import assert from "node:assert/strict";
import {
  correctionSkill,
  emptyLearningMemory,
  recordLearningTurn,
  rememberLesson,
  dueReviews,
  learnerContext,
  exposeModel,
  forgetMemory,
  reviewQuestion,
  learningMemorySchema,
  type LearningMemory,
  type LearningTurn,
} from "../shared/learning-memory";
import { progressSchema, initialProgress } from "../src/lib/progress";
import { tutorReplySchema, turnRequestSchema } from "../shared/contracts";
import { learnerGuidance } from "../shared/learner-guidance";

const DAY = 86_400_000,
  D0 = "2026-10-27T12:00:00.000Z";
const at = (days: number) =>
  new Date(Date.parse(D0) + days * DAY).toISOString();
const origin = {
  original: "私はフランスを来ました。",
  corrected: "私はフランスから来ました。",
  romaji: "Watashi wa Furansu kara kimashita.",
  french: "Je viens de France.",
  explanation: "Utilise kara pour dire d’où tu viens.",
};
const tutor = {
  reply: { japanese: "はい。", romaji: "Hai.", french: "Oui." },
  correction: origin,
  vocabulary: [],
};
const event = (id: string, days = 0): LearningTurn => ({
  id,
  sessionId: id,
  at: at(days),
  scenario: "meet",
  tutor,
  independent: true,
});
const seed = () => recordLearningTurn(emptyLearningMemory(), event("initial"));
const review = (
  id: string,
  days: number,
  outcome: "correct" | "error" | "helped" | "not_shown" = "correct",
  independent = true,
  sessionId = id,
): LearningTurn => ({
  ...event(id, days),
  sessionId,
  reviewId: "skill:origin",
  independent,
  tutor: {
    ...tutor,
    correction: outcome === "error" ? origin : null,
    review: { id: "skill:origin", outcome },
  },
});

test("les anciennes données migrent sans inventer d’erreurs ni perdre séances et réglages", () => {
  const { learning: _learning, ...legacy } = initialProgress;
  const old = {
    ...legacy,
    sessions: [
      {
        id: "old",
        date: "2026-10-25",
        scenario: "meet",
        turns: 1,
        seconds: 30,
      },
    ],
    goal: 10 as const,
    romaji: false,
  };
  const migrated = progressSchema.parse(old);
  assert.deepEqual(migrated.sessions, old.sessions);
  assert.equal(migrated.goal, 10);
  assert.equal(migrated.romaji, false);
  assert.deepEqual(migrated.learning, emptyLearningMemory());
  assert.equal(
    progressSchema.safeParse({
      ...old,
      learning: { version: 1, items: "corrupt" },
    }).success,
    false,
  );
});
test("les erreurs sont gardées immédiatement, regroupées par construction et dédupliquées par événement", () => {
  const first = seed();
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]!.original, origin.original);
  assert.equal(first.items[0]!.occurrences, 1);
  assert.equal(recordLearningTurn(first, event("initial")), first);
  const again = recordLearningTurn(first, {
    ...event("another"),
    tutor: {
      ...tutor,
      correction: {
        ...origin,
        original: "スペインを来ました。",
        corrected: "スペインから来ました。",
      },
    },
  });
  assert.equal(again.items.length, 1);
  assert.equal(again.items[0]!.occurrences, 2);
  assert.equal(first.items[0]!.occurrences, 1);
  assert.deepEqual(
    learningMemorySchema.parse(JSON.parse(JSON.stringify(again))),
    again,
  );
});
test("une répétition immédiate ne remplace pas un rappel espacé ; les intervalles avancent à 1, 3 puis 7 jours", () => {
  let memory = seed();
  assert.equal(memory.items[0]!.dueAt, at(1));
  assert.equal(dueReviews(memory, new Date(at(0.9))).length, 0);
  memory = recordLearningTurn(memory, review("repeat", 0, "correct", false));
  assert.equal(memory.items[0]!.successes, 0);
  memory = recordLearningTurn(memory, review("recall1", 1));
  assert.equal(memory.items[0]!.box, 1);
  assert.equal(memory.items[0]!.dueAt, at(4));
  memory = recordLearningTurn(memory, review("too-early", 2));
  assert.equal(memory.items[0]!.successes, 1);
  assert.equal(memory.items[0]!.dueAt, at(4));
  memory = recordLearningTurn(memory, review("recall2", 4));
  assert.equal(memory.items[0]!.box, 2);
  assert.equal(memory.items[0]!.dueAt, at(11));
  memory = recordLearningTurn(
    memory,
    review("same-session", 11, "correct", true, "recall2"),
  );
  assert.equal(memory.items[0]!.successes, 2);
});
test("une erreur suivie de sa correction reste un entraînement, avec une seule évaluation de séance", () => {
  let memory = recordLearningTurn(
    seed(),
    review("wrong", 1, "error", true, "one-session"),
  );
  assert.equal(memory.items[0]!.occurrences, 2);
  assert.equal(memory.items[0]!.dueAt, at(2));
  assert.equal(memory.attempts.length, 1);
  memory = recordLearningTurn(
    memory,
    review("fixed", 1, "correct", false, "one-session"),
  );
  assert.equal(memory.items[0]!.box, 0);
  assert.equal(memory.items[0]!.successes, 0);
  assert.equal(memory.attempts.length, 1);
  assert.equal(memory.items[0]!.dueAt, at(2));
});
test("consulter un modèle, puis recharger l’app, empêche de créditer un rappel artificiel", () => {
  let memory = exposeModel(seed(), "skill:origin", at(1));
  memory = learningMemorySchema.parse(JSON.parse(JSON.stringify(memory)));
  assert.equal(memory.items[0]!.dueAt, at(2));
  memory = recordLearningTurn(memory, review("after-model", 1.1));
  assert.equal(memory.items[0]!.successes, 0);
  assert.equal(memory.attempts.length, 0);
  const forgedDue = {
    ...memory,
    items: memory.items.map((item) => ({ ...item, dueAt: at(0) })),
  };
  assert.equal(
    recordLearningTurn(forgedDue, review("still-not-independent", 1.2))
      .items[0]!.successes,
    0,
  );
});
test("les demandes d’aide et les constructions non démontrées ne sont pas prises pour des acquis", () => {
  for (const outcome of ["helped", "not_shown"] as const) {
    const memory = recordLearningTurn(seed(), review(outcome, 1, outcome));
    assert.equal(memory.items[0]!.box, 0);
    assert.equal(memory.items[0]!.occurrences, 1);
    assert.equal(memory.items[0]!.dueAt, at(2));
    assert.equal(memory.items[0]!.successes, 0);
  }
});
test("les objectifs sans faute reçoivent un contrôle différé et ne sont pas déclarés acquis", () => {
  const phrase = {
    japanese: "フランスから来ました。",
    romaji: "Furansu kara kimashita.",
    french: "Je viens de France.",
  };
  const memory = rememberLesson(
    emptyLearningMemory(),
    "meet-origin",
    phrase,
    "meet",
    D0,
  );
  assert.equal(memory.items[0]!.occurrences, 0);
  assert.equal(memory.items[0]!.source, "lesson");
  assert.equal(memory.items[0]!.successes, 0);
  assert.equal(
    rememberLesson(memory, "meet-origin", phrase, "meet", at(10)),
    memory,
  );
  assert.equal(
    rememberLesson(seed(), "meet-origin", phrase, "meet", at(10)).items[0]!
      .occurrences,
    1,
  );
});
test("l’adaptation exige des rappels indépendants sur plusieurs jours et redonne de l’aide après difficulté", () => {
  let memory: LearningMemory = emptyLearningMemory();
  for (const [lesson, reference] of [
    [
      "meet-origin",
      {
        japanese: "フランスから来ました。",
        romaji: "Furansu kara kimashita.",
        french: "Je viens de France.",
      },
    ],
    [
      "meet-likes",
      {
        japanese: "日本語が好きです。",
        romaji: "Nihongo ga suki desu.",
        french: "J’aime le japonais.",
      },
    ],
    [
      "meet-name",
      {
        japanese: "アレックスです。",
        romaji: "Arekkusu desu.",
        french: "Je m’appelle Alex.",
      },
    ],
  ] as const) {
    memory = rememberLesson(memory, lesson, reference, "meet", D0);
  }
  assert.equal(learnerContext(memory).support, "supported");
  for (const item of memory.items) {
    for (const day of [1, 4])
      memory = recordLearningTurn(memory, {
        ...review(`${item.id}:${day}`, day),
        reviewId: item.id,
        tutor: {
          ...tutor,
          correction: null,
          review: { id: item.id, outcome: "correct" },
        },
      });
  }
  assert.equal(learnerContext(memory).support, "light");
  assert.ok(learnerGuidance(learnerContext(memory)).includes("Stay within N5"));
  memory = recordLearningTurn(memory, review("help1", 11, "helped"));
  memory = recordLearningTurn(memory, {
    ...review("help2", 11, "helped"),
    reviewId: "skill:likes",
    tutor: {
      ...tutor,
      correction: null,
      review: { id: "skill:likes", outcome: "helped" },
    },
  });
  assert.equal(learnerContext(memory).support, "supported");
  const removed = forgetMemory(memory, "skill:likes");
  assert.ok(!removed.items.some((item) => item.id === "skill:likes"));
  assert.ok(!removed.attempts.some((item) => item.itemId === "skill:likes"));
});
test("la consigne de révision ne donne pas la construction attendue ; les contrats refusent les cibles arbitraires", () => {
  const target = seed().items[0]!;
  const question = reviewQuestion();
  assert.ok(!question.japanese.includes("から"));
  assert.ok(!question.romaji.includes("kara"));
  assert.ok(!question.french.includes("kara"));
  assert.ok(
    tutorReplySchema.safeParse({
      ...tutor,
      review: { id: target.id, outcome: "correct" },
    }).success,
  );
  assert.equal(
    turnRequestSchema.safeParse({
      scenario: "meet",
      history: [],
      text: "はい",
      review: { target: { ...target, skill: "invented" }, assisted: false },
    }).success,
    false,
  );
});

test("la famille d’erreur vient du changement grammatical, pas d’un mot simplement présent", () => {
  assert.equal(correctionSkill(origin), "origin");
  assert.equal(
    correctionSkill({
      ...origin,
      original: "フランスから来ますでした。",
      corrected: "フランスから来ました。",
    }),
    "past",
  );
  assert.notEqual(
    correctionSkill({
      ...origin,
      original: "昨日、日本語が好きますでした。",
      corrected: "昨日、日本語が好きでした。",
    }),
    "likes",
  );
});

test("un entraînement juste avant l’échéance ne permet pas de créditer un faux rappel espacé quelques minutes après", () => {
  let memory = recordLearningTurn(seed(), review("almost-due", 0.999));
  assert.equal(memory.items[0]!.successes, 0);
  assert.equal(memory.items[0]!.dueAt, at(1.999));
  memory = recordLearningTurn(memory, review("a-minute-later", 1.001));
  assert.equal(memory.items[0]!.successes, 0);
  assert.equal(memory.attempts.length, 0);
});
