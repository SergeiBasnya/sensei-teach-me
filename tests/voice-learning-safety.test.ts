import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyLearningMemory,
  recordLearningTurn,
  type LearningTurn,
} from "../shared/learning-memory";

const correction = {
  original: "私はフランスを来ました。",
  corrected: "私はフランスから来ました。",
  romaji: "Watashi wa Furansu kara kimashita.",
  french: "Je viens de France.",
  explanation: "Pour dire d’où tu viens, utilise kara après le pays.",
};
const event = (id: string, inputSource?: "voice" | "text"): LearningTurn => ({
  id,
  sessionId: id,
  at: "2026-10-29T12:00:00.000Z",
  scenario: "meet",
  inputSource,
  independent: true,
  tutor: {
    reply: {
      japanese: correction.corrected,
      romaji: correction.romaji,
      french: correction.french,
    },
    correction,
    vocabulary: [],
  },
});

test("une correction issue de la voix ne devient pas une erreur mémorisée, même sans signal ASR incertain", () => {
  const memory = emptyLearningMemory();
  const fromVoice = recordLearningTurn(memory, event("spoken", "voice"));
  assert.equal(fromVoice, memory);
  assert.deepEqual(fromVoice, emptyLearningMemory());
  const fromText = recordLearningTurn(memory, event("typed", "text"));
  assert.equal(fromText.items.length, 1);
  assert.equal(fromText.items[0]!.original, correction.original);
  assert.equal(fromText.items[0]!.occurrences, 1);
});

test("une correction vocale ne renforce ni ne remplace une erreur déjà gardée", () => {
  const existing = recordLearningTurn(
    emptyLearningMemory(),
    event("verified", "text"),
  );
  const snapshot = structuredClone(existing);
  const fromVoice = recordLearningTurn(
    existing,
    event("spoken-again", "voice"),
  );
  assert.equal(fromVoice, existing);
  assert.deepEqual(existing, snapshot);
  const fromText = recordLearningTurn(existing, event("typed-again", "text"));
  assert.equal(fromText.items[0]!.occurrences, 2);
  assert.deepEqual(existing, snapshot);
});

test("un échec de révision venant de la voix ne rétrograde pas la mémoire existante", () => {
  const seeded = recordLearningTurn(
    emptyLearningMemory(),
    event("verified", "text"),
  );
  const memory = {
    ...seeded,
    items: seeded.items.map((item) => ({ ...item, box: 2, successes: 2 })),
  };
  const review: LearningTurn = {
    ...event("spoken-review", "voice"),
    at: "2026-11-01T12:00:00.000Z",
    reviewId: "skill:origin",
    tutor: {
      ...event("unused").tutor,
      correction: null,
      review: { id: "skill:origin", outcome: "error" },
    },
  };
  assert.equal(recordLearningTurn(memory, review), memory);
  const textReview = recordLearningTurn(memory, {
    ...review,
    inputSource: "text",
  });
  assert.equal(textReview.items[0]!.box, 0);
  assert.equal(textReview.attempts[0]!.outcome, "error");
  assert.equal(memory.items[0]!.box, 2);
});

test("les anciens événements textuels et les rappels vocaux sans erreur gardent leurs règles", () => {
  const legacy = recordLearningTurn(emptyLearningMemory(), event("legacy"));
  const explicitText = recordLearningTurn(
    emptyLearningMemory(),
    event("legacy", "text"),
  );
  assert.deepEqual(legacy, explicitText);
  const correctReview: LearningTurn = {
    ...event("recall", "voice"),
    at: "2026-11-01T12:00:00.000Z",
    reviewId: "skill:origin",
    tutor: {
      ...event("unused").tutor,
      correction: null,
      review: { id: "skill:origin", outcome: "correct" },
    },
  };
  const next = recordLearningTurn(legacy, correctReview);
  assert.equal(next.items[0]!.occurrences, 1);
  assert.equal(next.items[0]!.successes, 1);
  assert.equal(next.attempts[0]!.credited, true);
});
