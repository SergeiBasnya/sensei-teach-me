import { z } from "zod";
import {
  lessonIdSchema,
  phraseSchema,
  type Phrase,
} from "../../shared/contracts";
import {
  learningMemorySchema,
  emptyLearningMemory,
} from "../../shared/learning-memory";

export const progressSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      scenario: z.string(),
      lessonId: lessonIdSchema.optional(),
      reviewId: z.string().optional(),
      reviewTitle: z.string().optional(),
      date: z.string(),
      seconds: z.number().nonnegative(),
      turns: z.number().int().nonnegative(),
    }),
  ),
  words: z.array(phraseSchema.extend({ id: z.string(), learned: z.boolean() })),
  goal: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  romaji: z.boolean(),
  translation: z.boolean(),
  autoSpeak: z.boolean(),
  learning: learningMemorySchema.default(emptyLearningMemory),
});
export type Progress = z.infer<typeof progressSchema>;
export const initialProgress: Progress = {
  sessions: [],
  words: [],
  goal: 5,
  romaji: true,
  translation: true,
  autoSpeak: true,
  learning: emptyLearningMemory(),
};
export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function getStats(progress: Progress, now = new Date()) {
  const today = dayKey(now);
  const secondsToday = progress.sessions
    .filter((s) => s.date === today)
    .reduce((n, s) => n + s.seconds, 0);
  const days = new Set(
    progress.sessions.filter((s) => s.turns > 0).map((s) => s.date),
  );
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    secondsToday,
    streak,
    totalMinutes: Math.floor(
      progress.sessions.reduce((n, s) => n + s.seconds, 0) / 60,
    ),
    completed: new Set(progress.sessions.map((s) => s.scenario)),
  };
}
export function addWords(progress: Progress, phrases: Phrase[]): Progress {
  const existing = new Set(progress.words.map((w) => w.japanese));
  const fresh = phrases.filter((p) => {
    if (existing.has(p.japanese)) return false;
    existing.add(p.japanese);
    return true;
  });
  return {
    ...progress,
    words: [
      ...progress.words,
      ...fresh.map((p) => ({ ...p, id: p.japanese, learned: false })),
    ],
  };
}
