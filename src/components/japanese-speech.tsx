import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";
import { z } from "zod";
import { apiRequest, type Connection } from "../lib/api";
import { recordedSpeech } from "../data/recorded-speech";
import { recordedEnergy } from "../data/recorded-energy";
import {
  mouthLevelAt,
  speechEnergyFromWav,
  type SpeechEnergy,
} from "../lib/speech-energy";
import { selectJapaneseVoice } from "../lib/voice-selection";

type SpeechService = {
  speakJapanese: (text: string) => Promise<boolean>;
  playJapaneseAudio: (audio: string) => Promise<boolean>;
  stopJapanese: () => Promise<void>;
  isSpeaking: boolean;
  isAudioPlaying: boolean;
  mouthLevel: number;
  error: string;
};
const JapaneseSpeech = createContext<SpeechService | null>(null);
const audioResponse = z.object({
  audio: z.string().min(60).max(4_000_000),
  format: z.literal("wav"),
});
export function JapaneseSpeechProvider({
  connection,
  children,
}: {
  connection: Connection | null;
  children: ReactNode;
}) {
  const player = useAudioPlayer(null, { updateInterval: 80 });
  const [isSpeaking, setSpeaking] = useState(false);
  const [isAudioPlaying, setAudioPlaying] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const energy = useRef<SpeechEnergy | null>(null);
  const fallbackStart = useRef(0);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const file = useRef<File | null>(null);
  const alive = useRef(true);
  const completion = useRef<((played: boolean) => void) | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cleanupFile = useCallback(() => {
    if (file.current?.exists) file.current.delete();
    file.current = null;
  }, []);
  const stopJapanese = useCallback(async () => {
    const stoppingSequence = ++sequence.current;
    request.current?.abort();
    request.current = null;
    clearTimeout(playbackTimer.current);
    completion.current?.(false);
    completion.current = null;
    energy.current = null;
    if (alive.current) {
      setAudioPlaying(false);
      setMouthLevel(0);
    }
    if (alive.current) player.pause();
    cleanupFile();
    // Le lecteur de fichiers fonctionne même si la synthèse système est absente.
    try {
      await Speech.stop();
    } catch {
      /* Aucun moteur système à arrêter. */
    }
    if (alive.current && sequence.current === stoppingSequence)
      setSpeaking(false);
  }, [player, cleanupFile]);
  useEffect(() => {
    const subscription = player.addListener(
      "playbackStatusUpdate",
      (status) => {
        if (!alive.current) return;
        setAudioPlaying(
          !!status.playing &&
            !status.isBuffering &&
            !status.didJustFinish &&
            !status.error,
        );
        if (status.didJustFinish || status.error) {
          clearTimeout(playbackTimer.current);
          setSpeaking(false);
          setMouthLevel(0);
          energy.current = null;
          cleanupFile();
          completion.current?.(!status.error);
          completion.current = null;
          if (status.error)
            setError(
              "La lecture audio a échoué. Touche à nouveau Écouter pour réessayer.",
            );
        }
      },
    );
    return () => subscription.remove();
  }, [player, cleanupFile]);
  useEffect(() => {
    if (!isAudioPlaying) {
      setMouthLevel(0);
      return;
    }
    const sample = () => {
      if (!alive.current) return;
      setMouthLevel(
        energy.current
          ? mouthLevelAt(energy.current, player.currentTime)
          : [1, 2, 1, 0, 3, 1, 0][
              Math.floor((Date.now() - fallbackStart.current) / 140) % 7
            ]!,
      );
    };
    sample();
    const timer = setInterval(sample, 80);
    return () => clearInterval(timer);
  }, [isAudioPlaying, player]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
      request.current?.abort();
      clearTimeout(playbackTimer.current);
      void Speech.stop().catch(() => undefined);
      cleanupFile();
      completion.current?.(false);
      completion.current = null;
    };
  }, [cleanupFile]);
  const speakJapanese = useCallback(
    async (text: string, suppliedAudio?: string): Promise<boolean> => {
      // stopJapanese incrémente la séquence avant son premier await.
      const current = sequence.current + 1;
      await stopJapanese();
      const isCurrent = () => alive.current && current === sequence.current;
      if ((!text.trim() && !suppliedAudio) || !isCurrent()) return false;
      setError("");
      setSpeaking(true);
      const ended = new Promise<boolean>((resolve) => {
        completion.current = resolve;
      });
      const finish = (played: boolean) => {
        if (!isCurrent()) return;
        setSpeaking(false);
        setAudioPlaying(false);
        setMouthLevel(0);
        energy.current = null;
        completion.current?.(played);
        completion.current = null;
      };
      try {
        const bundled = suppliedAudio ? undefined : recordedSpeech[text];
        if (bundled !== undefined) {
          energy.current = recordedEnergy[text] || null;
          fallbackStart.current = Date.now();
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          });
          if (!isCurrent()) return false;
          player.replace(bundled);
          player.play();
        } else if (connection || suppliedAudio) {
          const controller = new AbortController();
          request.current = controller;
          const result = suppliedAudio
            ? audioResponse.parse({ audio: suppliedAudio, format: "wav" })
            : audioResponse.parse(
                await apiRequest(
                  connection!,
                  "/api/speech",
                  { text },
                  controller.signal,
                ),
              );
          if (!isCurrent()) return false;
          energy.current = speechEnergyFromWav(result.audio);
          fallbackStart.current = Date.now();
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          });
          if (!isCurrent()) return false;
          let uri: string;
          if (Platform.OS === "web")
            uri = `data:audio/wav;base64,${result.audio}`;
          else {
            const next = new File(
              Paths.cache,
              `sensei-voice-${Date.now()}.wav`,
            );
            next.write(result.audio, { encoding: "base64" });
            file.current = next;
            uri = next.uri;
          }
          player.replace({ uri });
          player.play();
        } else {
          const voice = selectJapaneseVoice(
            await Speech.getAvailableVoicesAsync(),
          );
          if (!isCurrent()) return false;
          if (!voice)
            throw new Error(
              "Cette phrase n’a pas encore d’enregistrement et aucune voix japonaise n’est installée. Connecte le serveur vocal local pour la lire.",
            );
          Speech.speak(text, {
            language: "ja-JP",
            voice: voice.identifier,
            rate: 1,
            pitch: 1,
            onStart: () => {
              if (isCurrent()) {
                fallbackStart.current = Date.now();
                setAudioPlaying(true);
              }
            },
            onDone: () => {
              finish(true);
            },
            onStopped: () => {
              finish(false);
            },
            onError: () => {
              if (isCurrent()) {
                finish(false);
                setError("La voix japonaise de cet appareil est indisponible.");
              }
            },
          });
          return ended;
        }
        playbackTimer.current = setTimeout(() => {
          if (isCurrent()) {
            player.pause();
            finish(false);
            setError(
              "La lecture a été interrompue. Touche Écouter pour réessayer.",
            );
            cleanupFile();
          }
        }, 90_000);
      } catch (cause) {
        if (isCurrent()) {
          finish(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "La voix est indisponible. Réessaie.",
          );
        }
      }
      return ended;
    },
    [connection, player, stopJapanese, cleanupFile],
  );
  const playJapaneseAudio = useCallback(
    (audio: string) => speakJapanese("", audio),
    [speakJapanese],
  );
  return (
    <JapaneseSpeech.Provider
      value={{
        speakJapanese,
        playJapaneseAudio,
        stopJapanese,
        isSpeaking,
        isAudioPlaying,
        mouthLevel,
        error,
      }}
    >
      {children}
    </JapaneseSpeech.Provider>
  );
}
export function useJapaneseSpeech(): SpeechService {
  const service = useContext(JapaneseSpeech);
  if (!service) throw new Error("JapaneseSpeechProvider absent");
  useEffect(
    () => () => {
      void service.stopJapanese();
    },
    [service.stopJapanese],
  );
  return service;
}
// Lecture seule : démonter un avatar ne doit jamais interrompre le lecteur.
export function useSpeechPlayback() {
  const service = useContext(JapaneseSpeech);
  return {
    playing: service?.isAudioPlaying || false,
    mouthLevel: service?.mouthLevel || 0,
  };
}
