import { z } from "zod";
import {
  lessonIdSchema,
  scenarioIdSchema,
  type LessonId,
  type Phrase,
  type ScenarioId,
} from "./language";
import type { TutorReply } from "./contracts";

export const skillSchema = z.enum([
  "identity",
  "origin",
  "likes",
  "past",
  "topic",
  "object",
  "order",
  "choice",
  "destination",
  "ticket",
  "thanks",
  "sentence",
]);
export type Skill = z.infer<typeof skillSchema>;
export const skills: Record<
  Skill,
  { title: string; question: Phrase; rubric: string }
> = {
  identity: {
    title: "Te présenter",
    question: {
      japanese: "お名前は？",
      romaji: "Onamae wa?",
      french: "Présente-toi en japonais avec une phrase.",
    },
    rubric:
      "Introduce yourself with a name and a natural polite ending. Any real name is valid.",
  },
  origin: {
    title: "Dire d’où tu viens",
    question: {
      japanese: "どこから来ましたか？",
      romaji: "Doko kara kimashita ka?",
      french: "Dis d’où tu viens avec une phrase complète.",
    },
    rubric:
      "Express where you come from using kara. Any country or city is valid. A place alone does not demonstrate the target particle; mark not_shown, not error.",
  },
  likes: {
    title: "Parler de tes goûts",
    question: {
      japanese: "何が好きですか？",
      romaji: "Nani ga suki desu ka?",
      french: "Dis une chose que tu aimes, avec une phrase complète.",
    },
    rubric:
      "Express liking something with ga suki. Any thing is valid. A natural fragment omitting ga is not_shown, not an invented grammar error.",
  },
  past: {
    title: "Parler d’hier",
    question: {
      japanese: "昨日、何をしましたか？",
      romaji: "Kinō, nani o shimashita ka?",
      french: "Raconte une chose que tu as faite hier, à la forme polie.",
    },
    rubric:
      "Describe any completed past action in natural polite past Japanese. The reference is an example, not a required personal fact.",
  },
  topic: {
    title: "Construire une phrase avec un sujet",
    question: {
      japanese: "自分のことを話してください。",
      romaji: "Jibun no koto o hanashite kudasai.",
      french:
        "Dis quelque chose sur toi avec un sujet exprimé et une phrase complète.",
    },
    rubric:
      "Use a natural explicit topic with wa, then a predicate. Subject omission is acceptable conversation but not_shown for this recall target.",
  },
  object: {
    title: "Exprimer une action",
    question: {
      japanese: "何をしますか？",
      romaji: "Nani o shimasu ka?",
      french:
        "Dis ce que tu fais à quelque chose : manger, boire ou regarder, par exemple.",
    },
    rubric:
      "Use a transitive action with an explicit object marked by wo. Any sensible object and action are valid.",
  },
  order: {
    title: "Demander poliment",
    question: {
      japanese: "何にしますか？",
      romaji: "Nani ni shimasu ka?",
      french: "Commande une chose poliment.",
    },
    rubric:
      "Make a natural polite request for any item, with kudasai or onegaishimasu or another valid polite request.",
  },
  choice: {
    title: "Faire un choix poliment",
    question: {
      japanese: "ホットですか、アイスですか？",
      romaji: "Hotto desu ka, aisu desu ka?",
      french: "Choisis chaud ou glacé en le demandant poliment.",
    },
    rubric:
      "Choose hot or iced with a natural polite request or polite full answer. Both choices are valid.",
  },
  destination: {
    title: "Indiquer ta destination",
    question: {
      japanese: "どちらまでですか？",
      romaji: "Dochira made desu ka?",
      french: "Indique une destination avec une phrase polie.",
    },
    rubric:
      "Express any destination using made or another natural explicit destination construction. A place alone is not_shown.",
  },
  ticket: {
    title: "Demander un billet",
    question: {
      japanese: "どんな切符がほしいですか？",
      romaji: "Donna kippu ga hoshii desu ka?",
      french: "Demande un aller simple pour une personne.",
    },
    rubric:
      "Politely request one one-way ticket. Katamichi and an appropriate ticket counter or explicit one-person meaning must be demonstrated.",
  },
  thanks: {
    title: "Remercier poliment",
    question: {
      japanese: "はい、どうぞ。",
      romaji: "Hai, dōzo.",
      french: "Remercie poliment la personne qui vient de t’aider.",
    },
    rubric:
      "Give a natural polite thanks, such as arigatou gozaimasu or gozaimashita. Other equally polite variants are valid.",
  },
  sentence: {
    title: "Reformuler une phrase",
    question: {
      japanese: "日本語で言ってみましょう。",
      romaji: "Nihongo de itte mimashō.",
      french: "Essayons de le dire en japonais.",
    },
    rubric:
      "Express the reference meaning in natural Japanese. Accept equivalent wording, kana, omitted subjects and appropriate casual forms. Do not invent a style error.",
  },
};
export const lessonSkills: Record<LessonId, Skill> = {
  "meet-name": "identity",
  "meet-origin": "origin",
  "meet-likes": "likes",
  "cafe-order": "order",
  "cafe-choice": "choice",
  "cafe-finish": "thanks",
  "station-destination": "destination",
  "station-ticket": "ticket",
  "station-thanks": "thanks",
};
export const skillHints: Record<Skill, string> = {
  identity: "Pour te présenter, donne ton prénom suivi de desu.",
  origin:
    "Pour dire d’où tu viens, donne ton pays ou ta ville, puis ajoute kara kimashita.",
  likes:
    "Pour dire ce que tu aimes, nomme cette chose puis ajoute ga suki desu.",
  past: "Pour une action passée, utilise la forme polie du verbe en mashita.",
  topic:
    "Annonce le sujet de ta phrase avec wa, puis dis quelque chose à son propos.",
  object:
    "Place la particule o après ce sur quoi porte ton action, avant le verbe.",
  order:
    "Nomme ce que tu demandes et termine par kudasai ou onegaishimasu pour demander poliment.",
  choice:
    "Donne ton choix, puis ajoute de onegaishimasu pour le demander poliment.",
  destination: "Nomme la destination, puis ajoute made onegaishimasu.",
  ticket:
    "Katamichi désigne un aller simple. Pour un billet, ajoute o ichimai kudasai.",
  thanks:
    "Pour remercier poliment, utilise arigatō gozaimasu ou arigatō gozaimashita.",
  sentence: "Écoute la phrase modèle, puis essaie de la reformuler.",
};
const referenceSchema = z.object({
  japanese: z.string().trim().min(1).max(300),
  romaji: z.string().trim().min(1).max(600),
  french: z.string().trim().min(1).max(500),
});
export const reviewTargetSchema = z.object({
  id: z.string().min(1).max(100),
  skill: skillSchema,
  reference: referenceSchema,
  explanation: z.string().min(1).max(400),
});
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;
export const reviewContextSchema = z.object({
  target: reviewTargetSchema,
  assisted: z.boolean(),
});
export type ReviewContext = z.infer<typeof reviewContextSchema>;
export const learnerContextSchema = z.object({
  support: z.enum(["supported", "guided", "light"]),
  weak: z.array(skillSchema).max(3),
  stable: z.array(skillSchema).max(12),
});
export type LearnerContext = z.infer<typeof learnerContextSchema>;
export const reviewOutcomeSchema = z.enum([
  "correct",
  "error",
  "not_shown",
  "helped",
]);
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;
export const reviewAssessmentSchema = z.object({
  outcome: z.enum(["correct", "error", "not_shown"]),
  feedback: z.string().trim().min(1).max(350),
});
export type ReviewAssessment = z.infer<typeof reviewAssessmentSchema>;
const iso = z.string().datetime();
export const memoryItemSchema = reviewTargetSchema.extend({
  source: z.enum(["mistake", "lesson"]),
  original: z.string().max(1500),
  scenario: scenarioIdSchema,
  lessonId: lessonIdSchema.optional(),
  occurrences: z.number().int().nonnegative(),
  firstSeen: iso,
  lastSeen: iso,
  dueAt: iso,
  box: z.number().int().min(0).max(4),
  successes: z.number().int().nonnegative(),
  practices: z.number().int().nonnegative(),
  lastAttemptSession: z.string().optional(),
  lastCreditDay: z.string().optional(),
  lastModelAt: iso.optional(),
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;
export const learningMemorySchema = z.object({
  version: z.literal(1),
  items: z.array(memoryItemSchema),
  seenEvents: z.array(z.string()).max(300),
  attempts: z
    .array(
      z.object({
        itemId: z.string(),
        at: iso,
        outcome: reviewOutcomeSchema,
        independent: z.boolean(),
        credited: z.boolean(),
      }),
    )
    .max(100),
});
export type LearningMemory = z.infer<typeof learningMemorySchema>;
export const emptyLearningMemory = (): LearningMemory => ({
  version: 1,
  items: [],
  seenEvents: [],
  attempts: [],
});
const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 14, 30] as const;
const normalize = (text: string) => text.replace(/[\s。、！？.!?]/gu, "");
function keyFor(skill: Skill, phrase: Phrase) {
  if (skill !== "sentence") return `skill:${skill}`;
  let hash = 2166136261;
  for (const char of normalize(phrase.japanese))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `sentence:${(hash >>> 0).toString(36)}`;
}
export function correctionSkill(
  correction: NonNullable<TutorReply["correction"]>,
): Skill {
  const canonical = (text: string) =>
    normalize(text)
      .replaceAll("すき", "好き")
      .replaceAll("きました", "来ました")
      .replaceAll("わたし", "私");
  const original = canonical(correction.original),
    corrected = canonical(correction.corrected);
  if (
    original.replace("を好き", "が好き") === corrected &&
    original !== corrected
  )
    return "likes";
  if (
    (original.replace(/(?:を|に|で)(?=来ました)/, "から") === corrected ||
      original.replace("来ました", "から来ました") === corrected) &&
    original !== corrected
  )
    return "origin";
  if (original.replace("が", "を") === corrected) return "object";
  if (/^私は/.test(corrected) && original.replace(/^私/, "私は") === corrected)
    return "topic";
  if (
    (original.replace("ますでした", "ました") === corrected ||
      original.replace(/ます$/, "ました") === corrected) &&
    original !== corrected
  )
    return "past";
  return "sentence";
}
export type LearningTurn = {
  id: string;
  sessionId: string;
  at: string;
  scenario: ScenarioId;
  lessonId?: LessonId;
  tutor: TutorReply;
  reviewId?: string;
  independent: boolean;
  inputSource?: "voice" | "text";
};
export function recordLearningTurn(
  memory: LearningMemory,
  event: LearningTurn,
): LearningMemory {
  // Even confident ASR can change a particle or negate a choice. Keep oral
  // feedback in the session, but do not persist an unverified spoken mistake.
  if (
    event.inputSource === "voice" &&
    (event.tutor.correction || event.tutor.review?.outcome === "error")
  )
    return memory;
  if (memory.seenEvents.includes(event.id)) return memory;
  let items = [...memory.items],
    attempts = [...memory.attempts];
  const correction = event.tutor.correction;
  const review = event.tutor.review;
  const independent = event.independent && !event.tutor.assisted;
  if (event.reviewId && review?.id === event.reviewId) {
    items = items.map((item) => {
      if (item.id !== event.reviewId) return item;
      if (item.lastAttemptSession === event.sessionId)
        return { ...item, practices: item.practices + 1 };
      const now = new Date(event.at),
        day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const eligible =
        now.getTime() >= Date.parse(item.dueAt) &&
        item.lastCreditDay !== day &&
        (!item.lastModelAt ||
          now.getTime() - Date.parse(item.lastModelAt) >= DAY);
      const recalled = review.outcome === "correct" && independent && eligible;
      if (review.outcome === "correct" && !recalled)
        return {
          ...item,
          practices: item.practices + 1,
          lastAttemptSession: event.sessionId,
          dueAt: new Date(
            Math.max(Date.parse(item.dueAt), now.getTime() + DAY),
          ).toISOString(),
        };
      const outcome: ReviewOutcome =
        review.outcome === "correct" && independent
          ? "correct"
          : review.outcome === "error"
            ? "error"
            : review.outcome === "not_shown"
              ? "not_shown"
              : "helped";
      attempts = [
        ...attempts,
        {
          itemId: item.id,
          at: event.at,
          outcome,
          independent,
          credited: recalled,
        },
      ].slice(-100);
      const needsHelp = outcome !== "correct";
      const box = recalled
        ? Math.min(4, item.box + 1)
        : needsHelp
          ? 0
          : item.box;
      return {
        ...item,
        box,
        successes: item.successes + Number(recalled),
        practices: item.practices + 1,
        lastSeen: event.at,
        dueAt:
          eligible || needsHelp
            ? new Date(now.getTime() + INTERVALS[box]! * DAY).toISOString()
            : item.dueAt,
        lastAttemptSession: event.sessionId,
        ...(recalled ? { lastCreditDay: day } : {}),
        ...(review.outcome !== "correct" ? { lastModelAt: event.at } : {}),
      };
    });
  }
  if (correction) {
    const skill = correctionSkill(correction);
    const reference = {
      japanese: correction.corrected,
      romaji: correction.romaji,
      french: correction.french,
    };
    const id = keyFor(skill, reference),
      existing = items.find((item) => item.id === id);
    const base = {
      id,
      skill,
      reference,
      explanation: correction.explanation,
      source: "mistake" as const,
      original: correction.original,
      scenario: event.scenario,
      ...(event.lessonId ? { lessonId: event.lessonId } : {}),
      lastSeen: event.at,
      dueAt: new Date(Date.parse(event.at) + DAY).toISOString(),
      box: 0,
      occurrences: (existing?.occurrences || 0) + 1,
    };
    const item: MemoryItem = existing
      ? { ...existing, ...base, lastModelAt: event.at }
      : {
          ...base,
          lastModelAt: event.at,
          firstSeen: event.at,
          successes: 0,
          practices: 0,
        };
    items = existing
      ? items.map((old) => (old.id === id ? item : old))
      : [...items, item];
  }
  return {
    ...memory,
    items,
    attempts,
    seenEvents: [...memory.seenEvents, event.id].slice(-300),
  };
}
export function rememberLesson(
  memory: LearningMemory,
  lessonId: LessonId,
  reference: Phrase,
  scenario: ScenarioId,
  at: string,
): LearningMemory {
  const skill = lessonSkills[lessonId],
    id = keyFor(skill, reference);
  if (memory.items.some((item) => item.id === id)) return memory;
  return {
    ...memory,
    items: [
      ...memory.items,
      {
        id,
        skill,
        reference,
        explanation: skillHints[skill],
        source: "lesson",
        original: "",
        scenario,
        lessonId,
        firstSeen: at,
        lastSeen: at,
        lastModelAt: at,
        dueAt: new Date(Date.parse(at) + DAY).toISOString(),
        box: 0,
        successes: 0,
        practices: 0,
        occurrences: 0,
      },
    ],
  };
}
export function exposeModel(
  memory: LearningMemory,
  id: string,
  at: string,
): LearningMemory {
  return {
    ...memory,
    items: memory.items.map((item) =>
      item.id === id
        ? {
            ...item,
            lastModelAt: at,
            dueAt: new Date(
              Math.max(Date.parse(item.dueAt), Date.parse(at) + DAY),
            ).toISOString(),
          }
        : item,
    ),
  };
}
export function dueReviews(
  memory: LearningMemory,
  now = new Date(),
): MemoryItem[] {
  return memory.items
    .filter((item) => Date.parse(item.dueAt) <= now.getTime())
    .sort(
      (a, b) =>
        Number(b.occurrences > 0) - Number(a.occurrences > 0) ||
        a.box - b.box ||
        Date.parse(a.dueAt) - Date.parse(b.dueAt),
    );
}
export function learnerContext(memory: LearningMemory): LearnerContext {
  const recent = memory.attempts.slice(-3),
    struggling = recent.filter((a) => a.outcome !== "correct").length >= 2;
  const stable = [
    ...new Set(
      memory.items
        .filter(
          (item) =>
            item.box >= 2 && item.successes >= 2 && item.skill !== "sentence",
        )
        .map((item) => item.skill),
    ),
  ];
  const successes = memory.attempts.filter(
    (a) => a.outcome === "correct" && a.credited,
  );
  const days = new Set(successes.map((a) => a.at.slice(0, 10)));
  const support: LearnerContext["support"] = struggling
    ? "supported"
    : stable.length >= 3 && days.size >= 2
      ? "light"
      : successes.length >= 3 && days.size >= 2
        ? "guided"
        : "supported";
  const weak = [
    ...new Set(
      [...memory.items]
        .filter((item) => item.box < 2)
        .sort(
          (a, b) =>
            b.occurrences - a.occurrences ||
            Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
        )
        .map((item) => item.skill),
    ),
  ].slice(0, 3);
  return { support, weak, stable };
}
export const supportLabels = {
  supported: "Accompagné",
  guided: "Guidé",
  light: "Plus autonome",
} as const;
export function reviewQuestion(): Phrase {
  return { ...skills.sentence.question };
}
export function reviewCoaching(target: ReviewTarget, assisted = false): string {
  const goal =
    target.skill === "sentence"
      ? `Exprime cette idée en japonais : ${target.reference.french}`
      : skills[target.skill].question.french;
  const intro = assisted
    ? "On s’entraîne après le modèle."
    : "Petite révision, sans modèle pour commencer.";
  return [`${intro} ${goal}`, goal, target.reference.french].find(
    (text) => text.length <= 500,
  )!;
}

export function forgetMemory(
  memory: LearningMemory,
  id: string,
): LearningMemory {
  return {
    ...memory,
    items: memory.items.filter((item) => item.id !== id),
    attempts: memory.attempts.filter((item) => item.itemId !== id),
  };
}
