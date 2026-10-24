import { z } from "zod";

export const scenarioIdSchema = z.enum(["meet", "cafe", "station", "free"]);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;
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
      original: z.string(),
      corrected: z.string(),
      explanation: z.string(),
    })
    .nullable(),
  vocabulary: z.array(phraseSchema),
});
export type TutorReply = z.infer<typeof tutorReplySchema>;
export const turnRequestSchema = z.object({
  scenario: scenarioIdSchema,
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
export const audioRequestSchema = z.object({
  audio: z
    .string()
    .min(100)
    .max(12_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  format: z.enum(["webm", "m4a", "wav", "mp4"]),
});
