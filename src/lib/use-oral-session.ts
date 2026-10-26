import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import { oralResponseSchema, type ScenarioId } from "../../shared/contracts";
import { apiRequest, type Connection } from "./api";
import { beginVoiceActivity, observeVoice } from "./voice-activity";
import { useJapaneseSpeech } from "../components/japanese-speech";
import { OralRun } from "./oral-run";

type OralReply = Extract<typeof oralResponseSchema._output, { heard: true }>;
type History = { role: "user" | "assistant"; content: string }[];
async function waitForForeground(signal: AbortSignal): Promise<void> {
  if (AppState.currentState === "active") return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      subscription.remove();
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new Error("La conversation est en pause."));
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        cleanup();
        resolve();
      }
    });
    const timer = setTimeout(cancel, 15_000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else if (AppState.currentState === "active") {
      cleanup();
      resolve();
    }
  });
}
export function useOralSession({
  connection,
  scenario,
  lessonId,
  history,
  onReply,
}: {
  connection: Connection | null;
  scenario: ScenarioId;
  lessonId?: import("../../shared/contracts").LessonId;
  history: History;
  onReply: (reply: OralReply) => void;
}) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const speech = useJapaneseSpeech();
  const [phase, setPhase] = useState<
    "idle" | "starting" | "listening" | "thinking" | "speaking"
  >("idle");
  const [error, setError] = useState("");
  const [quiet, setQuiet] = useState(false);
  const run = useRef(new OralRun()).current;
  const capturing = useRef(false);
  const stopping = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef({
    connection,
    scenario,
    lessonId,
    history,
    onReply,
    speech,
  });
  latest.current = { connection, scenario, lessonId, history, onReply, speech };
  const discard = useCallback(() => {
    const uri = recorder.uri;
    if (!uri) return;
    if (Platform.OS === "web") URL.revokeObjectURL(uri);
    else {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  }, [recorder]);
  const stop = useCallback(() => {
    const id = run.stop();
    clearInterval(ticker.current);
    abort.current?.abort();
    const wasCapturing = capturing.current;
    capturing.current = false;
    const previous = stopping.current;
    const work = (async () => {
      await previous.catch(() => undefined);
      if (wasCapturing) {
        await recorder.stop().catch(() => undefined);
        discard();
      }
      await speech.stopJapanese();
      if (mounted.current && run.stopped(id)) setPhase("idle");
    })();
    stopping.current = work;
    return work;
  }, [run, recorder, discard, speech.stopJapanese]);
  const fail = useCallback(
    async (message: string) => {
      await stop();
      if (mounted.current) setError(message);
    },
    [stop],
  );
  const listen = async (id: number): Promise<void> => {
    const current = () => mounted.current && run.current(id);
    if (!current()) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    if (!current()) return;
    await recorder.prepareToRecordAsync();
    // Une pause pendant la préparation doit aussi libérer la piste micro.
    recorder.record();
    capturing.current = true;
    if (!current()) {
      await recorder.stop();
      capturing.current = false;
      discard();
      return;
    }
    setPhase("listening");
    const activity = beginVoiceActivity(Date.now());
    ticker.current = setInterval(() => {
      if (!current()) return;
      const decision = observeVoice(
        activity,
        recorder.getStatus().metering,
        Date.now(),
      );
      if (decision === "quiet")
        void (async () => {
          await stop();
          if (mounted.current) setQuiet(true);
        })();
      if (decision === "send") void submit(id);
    }, 100);
  };
  const submit = async (id: number) => {
    const current = () => mounted.current && run.current(id);
    if (!current() || !capturing.current) return;
    capturing.current = false;
    clearInterval(ticker.current);
    setPhase("thinking");
    try {
      await recorder.stop();
      if (!current()) {
        discard();
        return;
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const uri = recorder.uri;
      if (!uri)
        throw new Error(
          "Enregistrement indisponible. Reprends la conversation.",
        );
      let audio: string;
      let format: "webm" | "m4a" | "mp4" = "m4a";
      try {
        if (Platform.OS === "web") {
          const blob = await (await fetch(uri)).blob();
          format = /mp4|m4a/.test(blob.type) ? "mp4" : "webm";
          audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else audio = await new File(uri).base64();
      } finally {
        discard();
      }
      if (!current()) return;
      const config = latest.current;
      if (!config.connection)
        throw new Error("Connecte le serveur local pour parler à Mochi.");
      const controller = new AbortController();
      abort.current = controller;
      const result = oralResponseSchema.parse(
        await apiRequest(
          config.connection,
          "/api/oral-turn",
          {
            audio,
            format,
            scenario: config.scenario,
            lessonId: config.lessonId,
            history: config.history.slice(-16),
          },
          controller.signal,
        ),
      );
      if (!current()) return;
      if (!result.heard) {
        await fail(
          "Je n’ai pas bien compris. Reprends la conversation et essaie une phrase courte.",
        );
        return;
      }
      // Le texte est une trace consultable ; son envoi ne demande aucune validation.
      config.onReply(result);
      setPhase("speaking");
      const played = await latest.current.speech.playJapaneseAudio(
        result.audio,
      );
      if (!current()) return;
      if (!played) {
        await fail(
          "La lecture a été interrompue. Reprends la conversation quand tu es prêt.",
        );
        return;
      }
      run.didRead(id, result.tutor.reply.japanese);
      await listen(id);
    } catch (cause) {
      if (current())
        await fail(
          cause instanceof Error
            ? cause.message
            : "Mochi est indisponible. Reprends la conversation.",
        );
    }
  };
  const start = useCallback(async () => {
    if (!latest.current.connection?.oral) {
      setError(
        "Connecte le serveur local avec ses trois moteurs pour parler à Mochi.",
      );
      return;
    }
    const id = run.begin();
    if (id === null) return;
    setError("");
    setQuiet(false);
    setPhase("starting");
    const current = () => mounted.current && run.current(id);
    try {
      await stopping.current;
      if (!current()) return;
      run.requestingPermission(id, true);
      let permission: Awaited<
        ReturnType<typeof AudioModule.requestRecordingPermissionsAsync>
      >;
      try {
        permission = await AudioModule.requestRecordingPermissionsAsync();
      } finally {
        run.requestingPermission(id, false);
      }
      if (!current()) return;
      if (!permission.granted)
        throw new Error(
          "Autorise l’accès au micro dans ton navigateur ou sur ton téléphone pour parler à Mochi.",
        );
      const controller = new AbortController();
      abort.current = controller;
      await waitForForeground(controller.signal);
      if (!current()) return;
      const last = [...latest.current.history]
        .reverse()
        .find((message) => message.role === "assistant");
      if (last && run.needsReading(last.content)) {
        setPhase("speaking");
        const played = await latest.current.speech.speakJapanese(last.content);
        if (!current()) return;
        if (!played)
          throw new Error("La voix de Mochi n’a pas pu démarrer. Réessaie.");
        run.didRead(id, last.content);
      } else await latest.current.speech.stopJapanese();
      await listen(id);
    } catch (cause) {
      if (current())
        await fail(
          cause instanceof Error ? cause.message : "Le micro est indisponible.",
        );
    }
  }, [run, fail, recorder]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (run.shouldPause(state)) void stop();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      void stop();
    };
  }, [run, stop]);
  return {
    phase,
    error,
    quiet,
    active: phase !== "idle",
    start,
    stop,
  };
}
