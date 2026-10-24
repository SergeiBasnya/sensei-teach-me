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
import { selectJapaneseVoice } from "../lib/voice-selection";

type SpeechService = {
  speakJapanese: (text: string) => Promise<void>;
  stopJapanese: () => Promise<void>;
  isSpeaking: boolean;
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
  const player = useAudioPlayer(null);
  const [isSpeaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const file = useRef<File | null>(null);
  const alive = useRef(true);
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
        if (status.didJustFinish || status.error) {
          clearTimeout(playbackTimer.current);
          setSpeaking(false);
          cleanupFile();
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
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
      request.current?.abort();
      clearTimeout(playbackTimer.current);
      void Speech.stop().catch(() => undefined);
      cleanupFile();
    };
  }, [cleanupFile]);
  const speakJapanese = useCallback(
    async (text: string) => {
      // stopJapanese incrémente la séquence avant son premier await.
      const current = sequence.current + 1;
      await stopJapanese();
      const isCurrent = () => alive.current && current === sequence.current;
      if (!text.trim() || !isCurrent()) return;
      setError("");
      setSpeaking(true);
      try {
        const bundled = recordedSpeech[text];
        if (bundled !== undefined) {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          });
          if (!isCurrent()) return;
          player.replace(bundled);
          player.play();
        } else if (connection) {
          const controller = new AbortController();
          request.current = controller;
          const result = audioResponse.parse(
            await apiRequest(
              connection,
              "/api/speech",
              { text },
              controller.signal,
            ),
          );
          if (!isCurrent()) return;
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          });
          if (!isCurrent()) return;
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
          if (!isCurrent()) return;
          if (!voice)
            throw new Error(
              "Cette phrase n’a pas encore d’enregistrement et aucune voix japonaise n’est installée. Connecte le serveur vocal local pour la lire.",
            );
          Speech.speak(text, {
            language: "ja-JP",
            voice: voice.identifier,
            rate: 1,
            pitch: 1,
            onDone: () => {
              if (isCurrent()) setSpeaking(false);
            },
            onStopped: () => {
              if (isCurrent()) setSpeaking(false);
            },
            onError: () => {
              if (isCurrent()) {
                setSpeaking(false);
                setError("La voix japonaise de cet appareil est indisponible.");
              }
            },
          });
          return;
        }
        playbackTimer.current = setTimeout(() => {
          if (isCurrent()) {
            player.pause();
            setSpeaking(false);
            setError(
              "La lecture a été interrompue. Touche Écouter pour réessayer.",
            );
            cleanupFile();
          }
        }, 90_000);
      } catch (cause) {
        if (isCurrent()) {
          setSpeaking(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "La voix est indisponible. Réessaie.",
          );
        }
      }
    },
    [connection, player, stopJapanese, cleanupFile],
  );
  return (
    <JapaneseSpeech.Provider
      value={{ speakJapanese, stopJapanese, isSpeaking, error }}
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
