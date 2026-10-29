import { useEffect, useRef } from "react";
import type { VoiceLabCaptureProps } from "../lib/voice-lab-capture";

import { voiceLabWorkletSource } from "../lib/voice-lab-worklet";
export function VoiceLabCapture(props: VoiceLabCaptureProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    let alive = true;
    let context: AudioContext | undefined;
    let media: MediaStream | undefined;
    let processor: AudioWorkletNode | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    const stop = () => {
      processor?.port.close();
      processor?.disconnect();
      source?.disconnect();
      media?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => undefined);
    };
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error("secure_context");
        callbacks.current.onPermission(true);
        try {
          media = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } finally {
          callbacks.current.onPermission(false);
        }
        if (!alive) {
          stop();
          return;
        }
        context = new AudioContext({ sampleRate: 16000 });
        if (!context.audioWorklet) throw new Error("no_audio_worklet");
        const url = URL.createObjectURL(
          new Blob([voiceLabWorkletSource], { type: "application/javascript" }),
        );
        try {
          await context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (!alive) {
          stop();
          return;
        }
        source = context.createMediaStreamSource(media);
        processor = new AudioWorkletNode(context, "sensei-pcm", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        const rate = context.sampleRate;
        processor.port.onmessage = (event: MessageEvent<unknown>) => {
          if (!alive || !event.data || typeof event.data !== "object") return;
          if ("overflow" in event.data && event.data.overflow === true) {
            stop();
            callbacks.current.onError(
              "La capture du navigateur a pris du retard. Reprends pour éviter une phrase tronquée.",
            );
            return;
          }
          if ("data" in event.data && event.data.data instanceof ArrayBuffer) {
            processor?.port.postMessage("ack");
            callbacks.current.onBuffer({
              data: event.data.data,
              sampleRate: rate,
              channels: 1,
              ...("timestamp" in event.data &&
              typeof event.data.timestamp === "number"
                ? { timestamp: event.data.timestamp }
                : {}),
            });
          }
        };
        source.connect(processor);
        processor.connect(context.destination);
        await context.resume();
        if (!alive) {
          stop();
          return;
        }
        callbacks.current.onReady();
      } catch {
        stop();
        if (alive)
          callbacks.current.onError(
            "La capture nécessite un navigateur récent sur localhost ou HTTPS, avec le micro autorisé.",
          );
      }
    })();
    return () => {
      alive = false;
      callbacks.current.onPermission(false);
      stop();
    };
  }, []);
  return null;
}
