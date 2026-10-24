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

type OralReply = Extract<typeof oralResponseSchema._output, { heard: true }>;
type History = { role: "user" | "assistant"; content: string }[];
export function useOralSession({
  connection,
  scenario,
  history,
  onReply,
}: {
  connection: Connection | null;
  scenario: ScenarioId;
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
  const active = useRef(false);
  const run = useRef(0);
  const capturing = useRef(false);
  const mounted = useRef(true);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef({ connection, scenario, history, onReply });
  latest.current = { connection, scenario, history, onReply };
  const discard = useCallback(() => {
    const uri = recorder.uri;
    if (!uri) return;
    if (Platform.OS === "web") URL.revokeObjectURL(uri);
    else {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  }, [recorder]);
  const stop = useCallback(async () => {
    active.current = false;
    run.current++;
    clearInterval(ticker.current);
    abort.current?.abort();
    if (capturing.current) {
      capturing.current = false;
      await recorder.stop().catch(() => undefined);
      discard();
    }
    await speech.stopJapanese();
    if (mounted.current) setPhase("idle");
  }, [recorder, discard, speech.stopJapanese]);
  const fail = useCallback(
    async (message: string) => {
      await stop();
      if (mounted.current) setError(message);
    },
    [stop],
  );
  const listen = async (id: number): Promise<void> => {
    const current = () =>
      mounted.current && active.current && id === run.current;
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
        void fail(
          "Je n’ai pas entendu de phrase. Rapproche-toi du micro, puis reprends la conversation.",
        );
      if (decision === "send") void submit(id);
    }, 100);
  };
  const submit = async (id: number) => {
    const current = () =>
      mounted.current && active.current && id === run.current;
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
      const played = await speech.playJapaneseAudio(result.audio);
      if (!current()) return;
      if (!played) {
        await fail(
          "La lecture a été interrompue. Reprends la conversation quand tu es prêt.",
        );
        return;
      }
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
  const start = async () => {
    if (active.current) return;
    if (!connection?.oral) {
      setError(
        "Connecte le serveur local avec ses trois moteurs pour parler à Mochi.",
      );
      return;
    }
    const id = ++run.current;
    active.current = true;
    setError("");
    setPhase("starting");
    const current = () =>
      mounted.current && active.current && id === run.current;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!current()) return;
      if (!permission.granted)
        throw new Error(
          "Autorise l’accès au micro dans ton navigateur ou sur ton téléphone pour parler à Mochi.",
        );
      const last = [...latest.current.history]
        .reverse()
        .find((message) => message.role === "assistant");
      if (last) {
        setPhase("speaking");
        const played = await speech.speakJapanese(last.content);
        if (!current()) return;
        if (!played)
          throw new Error("La voix de Mochi n’a pas pu démarrer. Réessaie.");
      }
      await listen(id);
    } catch (cause) {
      if (current())
        await fail(
          cause instanceof Error ? cause.message : "Le micro est indisponible.",
        );
    }
  };
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void stop();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      void stop();
    };
  }, [stop]);
  return {
    phase,
    error,
    active: phase !== "idle",
    start,
    stop,
    sendNow: () => submit(run.current),
  };
}
