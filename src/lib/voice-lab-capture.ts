import type { VoiceLabPcmBuffer } from "./voice-lab-pcm";
export type VoiceLabCaptureProps = {
  onBuffer: (buffer: VoiceLabPcmBuffer) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onPermission: (requesting: boolean) => void;
};
