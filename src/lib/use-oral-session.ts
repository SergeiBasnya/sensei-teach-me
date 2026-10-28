import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { File } from "expo-file-system";
import {
  oralResponseSchema,
  helpResponseSchema,
  type ScenarioId,
  type TutorReply,
  type Phrase,
} from "../../shared/contracts";
import {
  openingInvitation,
  tutorFromHelp,
  type LessonOpening,
} from "../../shared/teaching";
import { readTutor } from "./tutor-playback";
import { apiRequest, type Connection } from "./api";
import { beginVoiceActivity, observeVoice } from "./voice-activity";
import { useJapaneseSpeech } from "../components/japanese-speech";
import { OralRun } from "./oral-run";
import {
  beginOralMetrics,
  sentOralMetrics,
  finishOralMetrics,
} from "./oral-metrics";
import type {
  LearnerContext,
  ReviewContext,
} from "../../shared/learning-memory";

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
  learner,
  review,
  finished,
  history,
  onReply,
  onAssistance,
  opening,
  onOpeningStep,
  question,
}: {
  connection: Connection | null;
  scenario: ScenarioId;
  lessonId?: import("../../shared/contracts").LessonId;
  learner?: LearnerContext;
  review?: ReviewContext;
  finished?: () => boolean;
  history: History;
  onReply: (reply: OralReply) => void;
  onAssistance: (tutor: TutorReply) => void;
  opening?: LessonOpening;
  onOpeningStep: (step: { phrase: Phrase; coaching: string } | null) => void;
  question: { phrase: Phrase; coaching?: string | null; practice?: boolean };
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
  const lastVoiceAt = useRef(0);
  const stopping = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const openingDone = useRef(false);
  const silenceHelpOffered = useRef(false);
  const unclearCount = useRef(0);
  const latest = useRef({
    connection,
    scenario,
    lessonId,
    learner,
    review,
    finished,
    history,
    onReply,
    speech,
    onAssistance,
    opening,
    onOpeningStep,
    question,
  });
  latest.current = {
    connection,
    scenario,
    lessonId,
    learner,
    review,
    finished,
    history,
    onReply,
    speech,
    onAssistance,
    opening,
    onOpeningStep,
    question,
  };
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
    finishOralMetrics(false);
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
    beginOralMetrics();
    const activity = beginVoiceActivity(Date.now());
    ticker.current = setInterval(() => {
      if (!current()) return;
      const decision = observeVoice(
        activity,
        recorder.getStatus().metering,
        Date.now(),
      );
      lastVoiceAt.current = activity.lastVoice;
      if (decision === "quiet") void offerHelp(id);
      if (decision === "send") void submit(id);
    }, 100);
  };
  const offerHelp = async (id: number) => {
    const current = () => mounted.current && run.current(id);
    if (!current() || !capturing.current) return;
    clearInterval(ticker.current);
    if (silenceHelpOffered.current) {
      await stop();
      if (mounted.current) setQuiet(true);
      return;
    }
    silenceHelpOffered.current = true;
    finishOralMetrics(false);
    capturing.current = false;
    setPhase("thinking");
    try {
      await recorder.stop();
      discard();
      if (!current()) return;
      const config = latest.current;
      const question = [...config.history]
        .reverse()
        .find((item) => item.role === "assistant")?.content;
      if (!config.connection || !question)
        throw new Error("Ouvre Je bloque pour préparer ta réponse.");
      let tutor: TutorReply;
      if (config.review) {
        tutor = tutorFromHelp({
          explanation: config.review.target.explanation,
          answer: config.review.target.reference,
        });
      } else if (config.question.practice) {
        tutor = {
          reply: config.question.phrase,
          coaching: "Prends ton temps. Écoute encore le modèle, puis réessaie.",
          practice: true,
          correction: null,
          vocabulary: [],
        };
      } else {
        const controller = new AbortController();
        abort.current = controller;
        const help = helpResponseSchema.parse(
          await apiRequest(
            config.connection,
            "/api/help",
            {
              scenario: config.scenario,
              history: config.history.slice(-16),
              question: question.slice(-500),
              meaning: "",
            },
            controller.signal,
          ),
        );
        tutor = tutorFromHelp(help);
      }
      if (!current()) return;
      config.onAssistance(tutor);
      setPhase("speaking");
      if (!(await readTutor(tutor, latest.current.speech, current))) {
        if (current())
          await fail(
            "La lecture de l’aide a été interrompue. Reprends quand tu es prêt.",
          );
        return;
      }
      run.didRead(id, tutor.reply.japanese);
      await listen(id);
    } catch (cause) {
      if (current())
        await fail(
          cause instanceof Error
            ? cause.message
            : "Ouvre Je bloque pour préparer ta réponse.",
        );
    }
  };
  const submit = async (id: number) => {
    const current = () => mounted.current && run.current(id);
    if (!current() || !capturing.current) return;
    capturing.current = false;
    clearInterval(ticker.current);
    sentOralMetrics(Math.max(0, Date.now() - lastVoiceAt.current));
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
            learner: config.learner,
            review: config.review,
            history: config.history.slice(-16),
          },
          controller.signal,
        ),
      );
      if (!current()) return;
      if (!result.heard) {
        finishOralMetrics(false);
        if (++unclearCount.current >= 3) {
          await stop();
          if (mounted.current) setQuiet(true);
          return;
        }
        // No reply or memory event: an uncertain recording is not a learner error.
        setPhase("speaking");
        await latest.current.speech.speakFrench(
          "Je n’ai pas bien entendu. Essaie encore, prends ton temps.",
        );
        if (current()) await listen(id);
        return;
      }
      unclearCount.current = 0;
      // Le texte est une trace consultable ; son envoi ne demande aucune validation.
      config.onReply(result);
      silenceHelpOffered.current = false;
      setPhase("speaking");
      const played = await readTutor(
        result.tutor,
        latest.current.speech,
        current,
        {
          japanese: result.audio,
          french: result.coachingAudio,
          coachingUnavailable: result.coachingUnavailable,
        },
      );
      if (!current()) return;
      if (!played) {
        await fail(
          "La lecture a été interrompue. Reprends la conversation quand tu es prêt.",
        );
        return;
      }
      run.didRead(id, result.tutor.reply.japanese);
      finishOralMetrics(true);
      if (latest.current.finished?.()) {
        await stop();
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
    unclearCount.current = 0;
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
      const last = latest.current.question;
      if (run.needsReading(last.phrase.japanese)) {
        setPhase("speaking");
        const opening = latest.current.opening;
        if (opening && !openingDone.current) {
          latest.current.onOpeningStep({
            phrase: opening.model,
            coaching: opening.explanation,
          });
          if (
            !(await readTutor(
              {
                reply: opening.model,
                coaching: opening.explanation,
                correction: null,
                vocabulary: [],
              },
              latest.current.speech,
              current,
            ))
          ) {
            if (current())
              throw new Error(
                "L’explication a été interrompue. Reprends quand tu es prêt.",
              );
            return;
          }
          if (!current()) return;
          latest.current.onOpeningStep(null);
          await latest.current.speech.speakFrench(openingInvitation);
          if (!current()) return;
          openingDone.current = true;
        }
        const played = await readTutor(
          {
            reply: last.phrase,
            coaching: last.coaching,
            correction: null,
            vocabulary: [],
          },
          latest.current.speech,
          current,
        );
        if (!current()) return;
        if (!played)
          throw new Error("La voix de Mochi n’a pas pu démarrer. Réessaie.");
        run.didRead(id, last.phrase.japanese);
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
