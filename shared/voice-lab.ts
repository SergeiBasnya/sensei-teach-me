import { z } from "zod";
import { tutorReplySchema } from "./contracts";

// Experimental, opt-in protocol. It never records a pedagogical learning event.
export const VOICE_LAB = {
  path: "/api/voice-lab/socket",
  sampleRate: 16_000,
  channels: 1,
  frameHeaderBytes: 8,
  maxChunkBytes: 6_400,
  maxTurnMs: 45_000,
  maxBufferedBytes: 2_000_000,
} as const;
export const voiceLabLanguageSchema = z.enum(["auto", "ja"]);
export const voiceLabScenarioSchema = z.enum([
  "meet",
  "cafe",
  "station",
  "free",
]);
const turnSchema = z.number().int().min(1).max(0xffff_ffff);
const metricsSchema = z
  .record(
    z.string().regex(/^[a-z_]{1,40}$/),
    z.number().finite().nonnegative().max(3_600_000),
  )
  .refine((value) => Object.keys(value).length <= 30);
export const voiceLabClientSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("start"),
      turn: turnSchema,
      language: voiceLabLanguageSchema,
      scenario: voiceLabScenarioSchema.default("meet"),
      respond: z.boolean().default(false),
      keepSample: z.boolean().default(false),
    })
    .strict(),
  z.object({ type: z.literal("finish"), turn: turnSchema }).strict(),
  z.object({ type: z.literal("pause"), turn: turnSchema }).strict(),
  z.object({ type: z.literal("close") }).strict(),
]);
export const voiceLabReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tutor"), tutor: tutorReplySchema }).strict(),
  z
    .object({
      type: z.literal("details"),
      japanese: z.string().min(1).max(300),
      french: z.string().trim().min(1).max(500),
      coaching: z.string().trim().min(1).max(500).nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("audio"),
      index: z.number().int().min(0).max(4),
      audio: z.string().min(44).max(1_500_000),
      format: z.literal("wav"),
    })
    .strict(),
  z.object({ type: z.literal("metrics"), metrics: metricsSchema }).strict(),
  z.object({ type: z.literal("response_done") }).strict(),
]);
export const voiceLabServerSchema = z.union([
  z.object({ type: z.literal("ready"), sampleRate: z.literal(16_000) }),
  z.object({
    type: z.literal("state"),
    turn: turnSchema,
    state: z.enum(["listening", "paused", "recognizing", "complete"]),
  }),
  z.object({
    type: z.literal("partial"),
    turn: turnSchema,
    text: z.string().max(1_000),
    uncertain: z.boolean(),
    provisional: z.literal(true),
    metrics: metricsSchema,
  }),
  z.object({
    type: z.literal("final"),
    turn: turnSchema,
    text: z.string().max(1_000),
    uncertain: z.boolean(),
    metrics: metricsSchema,
  }),
  z.object({
    type: z.literal("sample_saved"),
    turn: turnSchema,
    id: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/),
  }),
  z.object({
    type: z.literal("error"),
    turn: turnSchema.optional(),
    code: z.enum([
      "invalid_message",
      "invalid_audio",
      "sequence_gap",
      "limit",
      "busy",
      "unavailable",
    ]),
    message: z.string().max(180),
  }),
  ...voiceLabReplySchema.options.map((schema) =>
    schema.extend({ turn: turnSchema }),
  ),
]);
export const voiceLabTicketSchema = z.object({
  ticket: z.string().regex(/^[a-f0-9]{64}$/),
  expiresInMs: z.literal(30_000),
  path: z.literal(VOICE_LAB.path),
});
export type VoiceLabLanguage = z.infer<typeof voiceLabLanguageSchema>;
export type VoiceLabScenario = z.infer<typeof voiceLabScenarioSchema>;
export type VoiceLabClientEvent = z.infer<typeof voiceLabClientSchema>;
export type VoiceLabReplyEvent = z.infer<typeof voiceLabReplySchema>;
export type VoiceLabServerEvent = z.infer<typeof voiceLabServerSchema>;
