import { tutorReplySchema } from "../shared/contracts";
import { scenes, freeScene } from "../src/data/lessons";
import { teachTurn, type TutorProvider } from "./app";
import type { SpeechProvider } from "./local-speech";
import type { VoiceLabRespond } from "./voice-lab";
import { timingContext } from "./timing";

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
    if (signal.aborted) return;
    // French remains available as text; the experiment never waits for Vivienne.
    emit({ type: "tutor", tutor });
    const segments = japaneseSegments(tutor.reply.japanese);
    const tts = performance.now();
    for (const [index, segment] of segments.entries()) {
      if (signal.aborted) return;
      const audio = await speech.speak(segment, "ja");
      if (signal.aborted) return;
      if (index === 0) {
        metrics.tts_first = performance.now() - tts;
        metrics.first_audio_emit = performance.now() - started;
      }
      emit({
        type: "audio",
        index,
        audio: audio.toString("base64"),
        format: "wav",
      });
    }
    metrics.tts_all = performance.now() - tts;
    emit({ type: "metrics", metrics });
    emit({ type: "response_done" });
  };
}
