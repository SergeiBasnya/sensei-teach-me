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
import { Asset } from "expo-asset";
import { z } from "zod";
import { apiRequest, type Connection } from "../lib/api";
import { recordedSpeech } from "../data/recorded-speech";
import { recordedEnergy } from "../data/recorded-energy";
import {
  mouthLevelAt,
  voiceLevelAt,
  speechEnergyFromWav,
  type SpeechEnergy,
} from "../lib/speech-energy";
import { selectJapaneseVoice } from "../lib/voice-selection";

type SpeechService = {
  speakJapanese: (text: string) => Promise<boolean>;
  speakFrench: (text: string) => Promise<boolean>;
  playJapaneseAudio: (audio: string) => Promise<boolean>;
  stopJapanese: () => Promise<void>;
  isSpeaking: boolean;
  isAudioPlaying: boolean;
  mouthLevel: number;
  voiceLevel: number;
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
  const webAudio = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setSpeaking] = useState(false);
  const [isAudioPlaying, setAudioPlaying] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const energy = useRef<SpeechEnergy | null>(null);
  const playbackArmed = useRef(false);
  const playbackStarted = useRef(false);
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
    playbackArmed.current = false;
    playbackStarted.current = false;
    request.current?.abort();
    request.current = null;
    clearTimeout(playbackTimer.current);
    completion.current?.(false);
    completion.current = null;
    energy.current = null;
    if (alive.current) {
      setAudioPlaying(false);
      setMouthLevel(0);
      setVoiceLevel(0);
    }
    if (alive.current) player.pause();
    if (webAudio.current) {
      webAudio.current.onended = null;
      webAudio.current.onerror = null;
      webAudio.current.onplaying = null;
      webAudio.current.pause();
      webAudio.current.removeAttribute("src");
      webAudio.current.load();
      webAudio.current = null;
    }
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
        if (!alive.current || !playbackArmed.current) return;
        if (status.playing && !status.isBuffering && !status.didJustFinish)
          playbackStarted.current = true;
        setAudioPlaying(
          !!status.playing &&
            !status.isBuffering &&
            !status.didJustFinish &&
            !status.error,
        );
        if ((status.didJustFinish && playbackStarted.current) || status.error) {
          playbackArmed.current = false;
          clearTimeout(playbackTimer.current);
          setSpeaking(false);
          setMouthLevel(0);
          setVoiceLevel(0);
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
      setVoiceLevel(0);
      return;
    }
    const sample = () => {
      if (!alive.current) return;
      setVoiceLevel(
        energy.current
          ? voiceLevelAt(
              energy.current,
              webAudio.current?.currentTime ?? player.currentTime,
            )
          : [0.3, 0.7, 0.3, 0, 1, 0.3, 0][
              Math.floor((Date.now() - fallbackStart.current) / 140) % 7
            ]!,
      );
      setMouthLevel(
        energy.current
          ? mouthLevelAt(
              energy.current,
              webAudio.current?.currentTime ?? player.currentTime,
            )
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
      if (webAudio.current) {
        webAudio.current.onended = null;
        webAudio.current.onerror = null;
        webAudio.current.onplaying = null;
        webAudio.current.pause();
        webAudio.current.removeAttribute("src");
        webAudio.current.load();
        webAudio.current = null;
      }
      completion.current?.(false);
      completion.current = null;
    };
  }, [cleanupFile]);
  const speakJapanese = useCallback(
    async (
      text: string,
      suppliedAudio?: string,
      language: "ja" | "fr" = "ja",
    ): Promise<boolean> => {
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
        setVoiceLevel(0);
        energy.current = null;
        completion.current?.(played);
        completion.current = null;
      };
      const playFile = (source: number | string | { uri: string }) => {
        if (Platform.OS === "web") {
          const uri =
            typeof source === "number"
              ? Asset.fromModule(source).uri
              : typeof source === "string"
                ? source
                : source.uri;
          const audio = new Audio(uri);
          webAudio.current = audio;
          audio.onplaying = () => {
            if (isCurrent()) setAudioPlaying(true);
          };
          audio.onended = () => finish(true);
          audio.onerror = () => {
            if (isCurrent()) setError("La lecture audio a échoué. Réessaie.");
            finish(false);
          };
          void audio.play().catch(() => {
            if (isCurrent())
              setError(
                "La lecture audio n’a pas démarré. Reprends la conversation.",
              );
            finish(false);
          });
        } else {
          player.replace(source);
          playbackArmed.current = true;
          player.play();
        }
      };
      try {
        const bundled =
          suppliedAudio || language === "fr" ? undefined : recordedSpeech[text];
        if (bundled !== undefined) {
          energy.current = recordedEnergy[text] || null;
          fallbackStart.current = Date.now();
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          });
          if (!isCurrent()) return false;
          playFile(bundled);
        } else if (connection || suppliedAudio) {
          const controller = new AbortController();
          request.current = controller;
          const result = suppliedAudio
            ? audioResponse.parse({ audio: suppliedAudio, format: "wav" })
            : audioResponse.parse(
                await apiRequest(
                  connection!,
                  "/api/speech",
                  { text, ...(language === "fr" ? { language } : {}) },
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
          playFile({ uri });
        } else {
          if (language === "fr")
            throw new Error(
              "Connecte le serveur de Mochi pour écouter les explications en français.",
            );
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
            webAudio.current?.pause();
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
  const speakFrench = useCallback(
    (text: string) => speakJapanese(text, undefined, "fr"),
    [speakJapanese],
  );
  return (
    <JapaneseSpeech.Provider
      value={{
        speakJapanese,
        speakFrench,
        playJapaneseAudio,
        stopJapanese,
        isSpeaking,
        isAudioPlaying,
        mouthLevel,
        voiceLevel,
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
    voiceLevel: service?.voiceLevel || 0,
  };
}
