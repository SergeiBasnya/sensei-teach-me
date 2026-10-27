import { z } from "zod";

export const scenarioIdSchema = z.enum(["meet", "cafe", "station", "free"]);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;
export const lessonIdSchema = z.enum([
  "meet-name",
  "meet-origin",
  "meet-likes",
  "cafe-order",
  "cafe-choice",
  "cafe-finish",
  "station-destination",
  "station-ticket",
  "station-thanks",
]);
export type LessonId = z.infer<typeof lessonIdSchema>;
export const phraseSchema = z.object({
  japanese: z.string(),
  romaji: z.string(),
  french: z.string(),
});
export type Phrase = z.infer<typeof phraseSchema>;
export const tutorReplySchema = z.object({
  reply: phraseSchema,
  correction: z
    .object({
      original: z.string().trim().min(1).max(1500),
      corrected: z.string().trim().min(1).max(300),
      romaji: z.string().trim().min(1).max(600),
      french: z.string().trim().min(1).max(500),
      explanation: z.string().trim().min(1).max(400),
    })
    .nullable(),
  vocabulary: z.array(phraseSchema),
});
export type TutorReply = z.infer<typeof tutorReplySchema>;
export const turnRequestSchema = z.object({
  scenario: scenarioIdSchema,
  lessonId: lessonIdSchema.optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(16),
  text: z.string().trim().min(1).max(1500),
});
export const helpRequestSchema = z.object({
  scenario: scenarioIdSchema,
  history: turnRequestSchema.shape.history,
  question: z.string().trim().min(1).max(500),
  meaning: z.string().trim().max(500).default(""),
});
export const helpResponseSchema = z.object({
  explanation: z.string().trim().min(1).max(500),
  answer: z.object({
    japanese: z.string().trim().min(1).max(300),
    romaji: z.string().trim().min(1).max(600),
    french: z.string().trim().min(1).max(500),
  }),
});
export type ConversationHelp = z.infer<typeof helpResponseSchema>;
export const audioRequestSchema = z.object({
  audio: z
    .string()
    .min(100)
    .max(12_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  format: z.enum(["webm", "m4a", "wav", "mp4"]),
});
export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
});
export const oralRequestSchema = audioRequestSchema.extend({
  scenario: scenarioIdSchema,
  lessonId: lessonIdSchema.optional(),
  history: turnRequestSchema.shape.history,
});
export const healthSchema = z.object({
  ready: z.boolean(),
  mode: z.enum(["local", "openai", "unavailable"]),
  oral: z.boolean(),
  warming: z.boolean(),
});
export const oralResponseSchema = z.discriminatedUnion("heard", [
  z.object({ heard: z.literal(false) }),
  z.object({
    heard: z.literal(true),
    transcript: z.string().min(1).max(1500),
    tutor: tutorReplySchema,
    audio: z.string().min(60).max(4_000_000),
    format: z.literal("wav"),
  }),
]);
