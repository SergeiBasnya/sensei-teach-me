import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { AudioModule, setAudioModeAsync, useAudioStream } from "expo-audio";
import type { VoiceLabCaptureProps } from "../lib/voice-lab-capture";

/** Capability guard is outside the hook: old Expo Go must not crash on mounting. */
export function VoiceLabCapture(props: VoiceLabCaptureProps) {
  if (
    Platform.OS !== "android" ||
    typeof AudioModule.AudioStream !== "function"
  )
    return <Unsupported {...props} />;
  return <NativeCapture {...props} />;
}
function Unsupported({ onError }: VoiceLabCaptureProps) {
  const first = useRef(onError);
  useEffect(() => {
    first.current(
      "Ce prototype PCM nécessite Android avec Expo Go SDK 58 à jour. Le vocal classique reste disponible.",
    );
  }, []);
  return null;
}
function NativeCapture(props: VoiceLabCaptureProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const alive = useRef(true);
  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer(buffer) {
      if (alive.current) callbacks.current.onBuffer(buffer);
    },
  });
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        callbacks.current.onPermission(true);
        let granted = false;
        try {
          granted = (await AudioModule.requestRecordingPermissionsAsync())
            .granted;
        } finally {
          callbacks.current.onPermission(false);
        }
        if (!alive.current) return;
        if (!granted)
          throw new Error(
            "Autorise le micro pour essayer la capture progressive.",
          );
        if (AppState.currentState !== "active")
          throw new Error(
            "Reviens dans l’application puis reprends le laboratoire.",
          );
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        if (!alive.current) return;
        await stream.start();
        if (!alive.current) {
          try {
            stream.stop();
          } catch {}
          return;
        }
        callbacks.current.onReady();
      } catch {
        if (alive.current)
          callbacks.current.onError(
            "La capture PCM n’a pas démarré. Vérifie le micro et ta version d’Expo Go, ou reprends le vocal classique.",
          );
      }
    })();
    return () => {
      alive.current = false;
      callbacks.current.onPermission(false);
      try {
        stream.stop();
      } catch {}
    };
  }, [stream]);
  return null;
}
