import type { VoiceLabPcmBuffer } from "./voice-lab-pcm";
export type VoiceLabCaptureProps = {
  onBuffer: (buffer: VoiceLabPcmBuffer) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onPermission: (requesting: boolean) => void;
};

type NativeCaptureRuntime = {
  requestPermission: () => Promise<boolean>;
  isForeground: () => boolean;
  prepare: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
};

/** Native stream lifecycle, separated from React for race tests without a mic. */
export class VoiceLabNativeCapture {
  private generation = 0;
  private active = 0;
  private bufferOwner = 0;
  private pending = Promise.resolve();
  constructor(
    private readonly runtime: NativeCaptureRuntime,
    private readonly callbacks: () => VoiceLabCaptureProps,
  ) {}
  buffer(buffer: VoiceLabPcmBuffer) {
    if (this.active && this.bufferOwner === this.active)
      this.callbacks().onBuffer(buffer);
  }
  begin() {
    const owner = ++this.generation;
    this.active = owner;
    const current = () => this.active === owner;
    const start = async () => {
      if (!current()) return;
      try {
        this.callbacks().onPermission(true);
        let granted = false;
        try {
          granted = await this.runtime.requestPermission();
        } finally {
          if (current()) this.callbacks().onPermission(false);
        }
        if (!current()) return;
        if (!granted) throw new Error("permission_denied");
        if (!this.runtime.isForeground()) throw new Error("background");
        await this.runtime.prepare();
        if (!current()) return;
        if (!this.runtime.isForeground()) throw new Error("background");
        // A native buffer can arrive before the start Promise settles.
        this.bufferOwner = owner;
        await this.runtime.start();
        if (!current()) {
          this.stop();
          return;
        }
        this.callbacks().onReady();
      } catch {
        this.bufferOwner = 0;
        this.stop();
        if (current())
          this.callbacks().onError(
            "La capture PCM n’a pas démarré. Vérifie le micro et ta version d’Expo Go, ou reprends le vocal classique.",
          );
      }
    };
    // Finish a cancelled native start before a replay can start the same stream.
    // A late completion must neither confirm nor stop the replacement capture.
    this.pending = this.pending.then(start, start);
    return () => {
      if (!current()) return;
      this.active = 0;
      this.bufferOwner = 0;
      this.callbacks().onPermission(false);
      this.stop();
    };
  }
  private stop() {
    try {
      this.runtime.stop();
    } catch {}
  }
}
