import { z } from "zod";

export * from "./language";
import { scenarioIdSchema, lessonIdSchema, phraseSchema } from "./language";
import {
  learnerContextSchema,
  reviewContextSchema,
  reviewOutcomeSchema,
} from "./learning-memory";

export const tutorReplySchema = z.object({
  reply: phraseSchema,
  coaching: z.string().trim().min(1).max(500).nullable().optional(),
  practice: z.boolean().optional(),
  review: z
    .object({ id: z.string().min(1).max(100), outcome: reviewOutcomeSchema })
    .optional(),
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
  guidedStepDone: z.boolean().optional(),
  learner: learnerContextSchema.optional(),
  review: reviewContextSchema.optional(),
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
  language: z.enum(["ja", "fr"]).optional(),
});
export const oralRequestSchema = audioRequestSchema.extend({
  scenario: scenarioIdSchema,
  lessonId: lessonIdSchema.optional(),
  guidedStepDone: z.boolean().optional(),
  learner: learnerContextSchema.optional(),
  review: reviewContextSchema.optional(),
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
    coachingAudio: z.string().min(60).max(4_000_000).optional(),
    format: z.literal("wav"),
  }),
]);
