import { useEffect, useMemo, useRef } from "react";
import { AppState, Platform } from "react-native";
import { AudioModule, setAudioModeAsync, useAudioStream } from "expo-audio";
import {
  VoiceLabNativeCapture,
  type VoiceLabCaptureProps,
} from "../lib/voice-lab-capture";

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
  const owner = useRef<VoiceLabNativeCapture | null>(null);
  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer(buffer) {
      owner.current?.buffer(buffer);
    },
  });
  const lifecycle = useMemo(
    () =>
      new VoiceLabNativeCapture(
        {
          requestPermission: async () =>
            (await AudioModule.requestRecordingPermissionsAsync()).granted,
          isForeground: () => AppState.currentState === "active",
          prepare: () =>
            setAudioModeAsync({
              allowsRecording: true,
              playsInSilentMode: true,
            }),
          start: () => stream.start(),
          stop: () => stream.stop(),
        },
        () => callbacks.current,
      ),
    [stream],
  );
  useEffect(() => {
    owner.current = lifecycle;
    const stop = lifecycle.begin();
    return () => {
      stop();
      if (owner.current === lifecycle) owner.current = null;
    };
  }, [lifecycle]);
  return null;
}
