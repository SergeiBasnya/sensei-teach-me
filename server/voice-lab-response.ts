import { tutorReplySchema } from "../shared/contracts";
import { scenes, freeScene } from "../src/data/lessons";
import { teachTurn, type TutorProvider } from "./app";
import type { SpeechProvider } from "./local-speech";
import type { VoiceLabRespond } from "./voice-lab";
import { timingContext } from "./timing";
import { voiceLabReplySchema } from "../shared/voice-lab";
import { z } from "zod";
import { wavDurationMs } from "./voice-lab-audio";

const detailsResultSchema = z
  .object({
    french: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !value.includes("\ufffd")),
    coaching: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !value.includes("\ufffd"))
      .nullable()
      .optional(),
  })
  .strict();

export type VoiceLabDetailsProvider = (input: {
  japanese: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
}) => Promise<{ french: string; coaching?: string | null }>;

/** Only complete, validated Japanese is eligible for sentence-by-sentence TTS. */
export function japaneseSegments(text: string) {
  if (!text.trim() || text.length > 300 || text.includes("\ufffd"))
    throw new Error("Invalid validated Japanese");
  const pieces = text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) || [];
  if (pieces.length > 5) return [text];
  return pieces.map((value) => value.trim()).filter(Boolean);
}
export function createVoiceLabResponse(
  provider: TutorProvider,
  speech: SpeechProvider,
  { details }: { details?: VoiceLabDetailsProvider } = {},
): VoiceLabRespond {
  return async ({ text, scenario, history, signal, emit }) => {
    if (signal.aborted) return;
    const started = performance.now();
    const metrics: Record<string, number> = {};
    const firstQuestion = (
      scenario === "free"
        ? freeScene
        : scenes.find((scene) => scene.id === scenario)
    )!.turns[0]!.tutor.japanese;
    const effectiveHistory = history.length
      ? history
      : [{ role: "assistant" as const, content: firstQuestion }];
    const tutor = await timingContext.run(metrics, async () =>
      tutorReplySchema.parse(
        await teachTurn(provider, {
          scenario,
          history: effectiveHistory,
          text,
        }),
      ),
    );
    metrics.teaching = performance.now() - started;
    const postprocess = performance.now();
    if (signal.aborted) return;
    if (provider.romanize) {
      const phrases = [
        tutor.reply.japanese,
        ...(tutor.correction ? [tutor.correction.corrected] : []),
      ];
      try {
        const values = await provider.romanize(phrases);
        tutor.reply.romaji = values[0] || "…";
        if (tutor.correction) tutor.correction.romaji = values[1] || "…";
      } catch {
        tutor.reply.romaji = "…";
        if (tutor.correction) tutor.correction.romaji = "…";
      }
    }
    metrics.postprocess = performance.now() - postprocess;
    if (signal.aborted) return;
    // French remains available as text; the experiment never waits for Vivienne.
    emit({ type: "tutor", tutor });
    const segments = japaneseSegments(tutor.reply.japanese);
    const tts = performance.now();
    let secondary: Promise<void> | undefined;
    let secondarySettled = false;
    let playbackEstimateMs = 0;
    let firstAudioAt = 0;
    let secondaryTimer: ReturnType<typeof setTimeout> | undefined;
    const secondaryController = new AbortController();
    const stopSecondary = () => secondaryController.abort();
    const armBudget = (finalAudio = false) => {
      clearTimeout(secondaryTimer);
      if (!secondary || secondarySettled) return;
      // Until the last synthesis, WAV 1 is not the total playback duration.
      // Keep the hard ceiling, then refine with the complete WAV estimate.
      const remaining = Math.max(
        0,
        firstAudioAt +
          (finalAudio ? Math.min(playbackEstimateMs, 2500) : 2500) -
          performance.now(),
      );
      secondaryTimer = setTimeout(stopSecondary, remaining);
      secondaryTimer.unref();
    };
    try {
      for (const [index, segment] of segments.entries()) {
        if (signal.aborted) return;
        const audio = await speech.speak(segment, "ja");
        if (signal.aborted) return;
        playbackEstimateMs += wavDurationMs(audio) ?? 0;
        if (index === 0) {
          firstAudioAt = performance.now();
          metrics.tts_first = performance.now() - tts;
          metrics.first_audio_emit = performance.now() - started;
        }
        emit({
          type: "audio",
          index,
          audio: audio.toString("base64"),
          format: "wav",
        });
        if (
          index === 0 &&
          details &&
          !tutor.reply.french.trim() &&
          !tutor.correction &&
          !tutor.assisted &&
          !tutor.practice &&
          !signal.aborted
        ) {
          const secondaryStarted = performance.now();
          const secondaryMetrics: Record<string, number> = {};
          // This request begins only after the first validated WAV was emitted.
          // Its complete contract cannot alter the already validated Japanese.
          signal.addEventListener("abort", stopSecondary, { once: true });
          secondary = timingContext.run(secondaryMetrics, async () => {
            try {
              const extra = detailsResultSchema.parse(
                await details({
                  japanese: tutor.reply.japanese,
                  history: [
                    ...effectiveHistory,
                    { role: "user" as const, content: text },
                  ].slice(-16),
                  signal: secondaryController.signal,
                }),
              );
              if (signal.aborted || secondaryController.signal.aborted) return;
              const event = voiceLabReplySchema.parse({
                type: "details",
                ...extra,
                japanese: tutor.reply.japanese,
                coaching: tutor.coaching ?? null,
              });
              emit(event);
            } catch (error) {
              if (
                secondaryController.signal.aborted ||
                (error instanceof Error && error.name === "AbortError")
              )
                metrics.secondary_cancelled = 1;
              else if (!signal.aborted) metrics.secondary_unavailable = 1;
            } finally {
              secondarySettled = true;
              metrics.secondary_pending = 0;
              if (secondaryController.signal.aborted)
                metrics.secondary_cancelled = 1;
              clearTimeout(secondaryTimer);
              signal.removeEventListener("abort", stopSecondary);
              metrics.secondary_total = performance.now() - secondaryStarted;
              if (secondaryMetrics.secondary !== undefined)
                metrics.secondary = secondaryMetrics.secondary;
              if (secondaryMetrics.generations !== undefined)
                metrics.secondary_generations = secondaryMetrics.generations;
              if (secondaryMetrics.secondary_cancel_ack !== undefined)
                metrics.secondary_cancel_ack =
                  secondaryMetrics.secondary_cancel_ack;
              if (!signal.aborted)
                emit({
                  type: "metrics",
                  metrics: Object.fromEntries(
                    Object.entries(metrics).filter(([name]) =>
                      name.startsWith("secondary"),
                    ),
                  ),
                });
            }
          });
        }
        armBudget();
      }
    } catch (error) {
      stopSecondary();
      throw error;
    }
    armBudget(true);
    metrics.tts_all = performance.now() - tts;
    metrics.playback_estimate = playbackEstimateMs;
    metrics.secondary_pending = secondary && !secondarySettled ? 1 : 0;
    metrics.secondary_tail_wait = 0; // No secondary work may gate listening.
    // The terminal audio event authorizes the client to resume after playback.
    // Same-turn details may still arrive while the already validated audio plays.
    if (signal.aborted) return;
    emit({ type: "metrics", metrics: { ...metrics } });
    emit({ type: "response_done" });
  };
}
