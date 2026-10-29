const SERVER_KEYS = new Set([
  "asr",
  "pcm_decode",
  "duration_ms",
  "samples",
  "rms_db_below_full_scale",
  "peak",
  "clipped_fraction",
  "leading_energy_ms",
  "trailing_energy_ms",
  "asr_queue",
  "asr_roundtrip",
  "audio_ms",
  "chunks",
  "partials",
  "teaching",
  "correction",
  "dialogue_translation",
  "worker_roundtrip",
  "worker_queue",
  "tts_first",
  "tts_all",
  "first_audio_emit",
  "first_token",
  "japanese_field_complete",
  "dialogue_stream",
  "validation_wait",
  "stream_complete",
  "json_gate_wait",
  "sample_save",
  "dialogue_japanese",
  "dialogue_compact",
  "lab_validation",
  "postprocess",
  "secondary",
  "secondary_total",
  "secondary_tail_wait",
  "secondary_unavailable",
  "secondary_generations",
]);
export type VoiceLabIncident =
  | "pause_user"
  | "pause_background"
  | "network_error"
  | "playback_error"
  | "capture_error"
  | "backpressure"
  | "uncertain_final"
  | "capture_gap";
type Trace = {
  captureMs?: number;
  captureWallMs?: number;
  sourceRateHz?: number;
  sourceChannels?: number;
  peak?: number;
  rms?: number;
  clippedFraction?: number;
  firstPartialAfterCaptureMs?: number;
  finalAfterFinishMs?: number;
  firstJapaneseAfterFinishMs?: number;
  firstJapaneseAfterDetectedVoiceMs?: number;
  lastJapaneseEndedAfterFinishMs?: number;
  responseDoneAfterFinishMs?: number;
  nextCaptureAfterJapaneseEndedMs?: number;
  server?: Record<string, number>;
};
export class VoiceLabMetrics {
  private started = 0;
  private current: Trace = {};
  private captureAt = 0;
  private finishAt: number | null = null;
  private voiceAt: number | null = null;
  private partialSeen = false;
  private playingSeen = false;
  private lastJapaneseEndedAt: number | null = null;
  private turns: Trace[] = [];
  private counts = {
    turns: 0,
    pcmChunks: 0,
    pcmBytes: 0,
    partials: 0,
    finals: 0,
  };
  private incidents: Record<VoiceLabIncident, number> = {
    pause_user: 0,
    pause_background: 0,
    network_error: 0,
    playback_error: 0,
    capture_error: 0,
    backpressure: 0,
    uncertain_final: 0,
    capture_gap: 0,
  };
  constructor(now = performance.now()) {
    this.started = now;
  }
  begin(now = performance.now(), automaticResume = false) {
    if (automaticResume && this.lastJapaneseEndedAt !== null)
      this.current.nextCaptureAfterJapaneseEndedMs = Math.max(
        0,
        Math.round(now - this.lastJapaneseEndedAt),
      );
    this.archive();
    this.current = {};
    this.captureAt = now;
    this.finishAt = null;
    this.voiceAt = null;
    this.partialSeen = false;
    this.playingSeen = false;
    this.lastJapaneseEndedAt = null;
    this.counts.turns++;
  }
  capture(value: {
    capturedMs: number;
    sourceRateHz: number;
    sourceChannels: number;
    peak: number;
    rms: number;
    clippedFraction: number;
  }) {
    for (const [target, source] of [
      ["captureMs", "capturedMs"],
      ["sourceRateHz", "sourceRateHz"],
      ["sourceChannels", "sourceChannels"],
      ["peak", "peak"],
      ["rms", "rms"],
      ["clippedFraction", "clippedFraction"],
    ] as const) {
      const number = value[source];
      if (Number.isFinite(number) && number >= 0) this.current[target] = number;
    }
  }
  chunk(bytes: number) {
    this.counts.pcmChunks++;
    this.counts.pcmBytes += bytes;
  }
  finish(lastVoice: number | null, now = performance.now()) {
    this.finishAt = now;
    this.current.captureWallMs = Math.max(0, Math.round(now - this.captureAt));
    this.voiceAt = lastVoice;
  }
  playbackEnded(now = performance.now()) {
    if (!this.playingSeen || this.finishAt === null) return;
    this.lastJapaneseEndedAt = now;
    this.current.lastJapaneseEndedAfterFinishMs = Math.max(
      0,
      Math.round(now - this.finishAt),
    );
  }
  responseDone(now = performance.now()) {
    if (this.finishAt !== null)
      this.current.responseDoneAfterFinishMs = Math.max(
        0,
        Math.round(now - this.finishAt),
      );
  }
  partial(now = performance.now()) {
    this.counts.partials++;
    if (!this.partialSeen) {
      this.partialSeen = true;
      this.current.firstPartialAfterCaptureMs = Math.max(
        0,
        Math.round(now - this.captureAt),
      );
    }
  }
  final(uncertain: boolean, now = performance.now()) {
    this.counts.finals++;
    if (uncertain) this.incident("uncertain_final");
    if (this.finishAt !== null)
      this.current.finalAfterFinishMs = Math.max(
        0,
        Math.round(now - this.finishAt),
      );
  }
  playing(now = performance.now()) {
    if (this.playingSeen || this.finishAt === null) return;
    this.playingSeen = true;
    this.current.firstJapaneseAfterFinishMs = Math.max(
      0,
      Math.round(now - this.finishAt),
    );
    if (this.voiceAt !== null)
      this.current.firstJapaneseAfterDetectedVoiceMs = Math.max(
        0,
        Math.round(now - this.voiceAt),
      );
  }
  server(raw: Record<string, number>) {
    const result = { ...this.current.server };
    for (const [key, value] of Object.entries(raw))
      if (
        SERVER_KEYS.has(key) &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 3_600_000
      )
        result[key] = value;
    if (Object.keys(result).length) this.current.server = result;
  }
  incident(name: VoiceLabIncident) {
    if (Object.hasOwn(this.incidents, name))
      this.incidents[name] = Math.min(100000, this.incidents[name] + 1);
  }
  private archive() {
    if (Object.keys(this.current).length) {
      this.turns.push({
        ...this.current,
        ...(this.current.server ? { server: { ...this.current.server } } : {}),
      });
      if (this.turns.length > 120) this.turns.shift();
    }
  }
  report(platform: string, now = performance.now()) {
    const copy = (value: Trace) => ({
      ...value,
      ...(value.server ? { server: { ...value.server } } : {}),
    });
    return {
      schemaVersion: "sensei-voice-lab.v1",
      humanValidation: "pending",
      platform: ["web", "android", "ios"].includes(platform)
        ? platform
        : "other",
      elapsedMs: Math.max(0, Math.round(now - this.started)),
      bargeInEnabled: false,
      counts: { ...this.counts },
      incidents: { ...this.incidents },
      retainedTurnLimit: 120,
      turns: [
        ...this.turns.map(copy),
        ...(Object.keys(this.current).length ? [copy(this.current)] : []),
      ].slice(-120),
    };
  }
}
