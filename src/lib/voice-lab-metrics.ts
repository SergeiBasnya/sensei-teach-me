const SERVER_KEYS = new Set([
  "asr",
  "pcm_decode",
  "duration_ms",
  "samples",
  "rms_db_below_full_scale",
  "window_rms_db_below_full_scale",
  "finish_to_final",
  "finish_to_first_audio",
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
  "controlled_dialogue",
  "controlled_question",
  "postprocess",
  "secondary",
  "secondary_total",
  "secondary_tail_wait",
  "secondary_unavailable",
  "secondary_generations",
  "secondary_pending",
  "secondary_cancelled",
  "secondary_cancel_ack",
  "playback_estimate",
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
  turn?: number;
  lastDetectedVoiceAfterCaptureMs?: number;
  finishAfterDetectedVoiceMs?: number;
  firstAudioReceivedAfterFinishMs?: number;
  playbackRequestAfterFinishMs?: number;
  audioReceiveToRequestMs?: number;
  playbackRequestToPlayingMs?: number;
  transportResidualMs?: number;
  endpointRequiredSilenceMs?: number;
  endpointVoicedMs?: number;
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
  private audioAt: number | null = null;
  private playbackAt: number | null = null;
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
  begin(now = performance.now(), automaticResume = false, turn?: number) {
    if (automaticResume && this.lastJapaneseEndedAt !== null)
      this.current.nextCaptureAfterJapaneseEndedMs = Math.max(
        0,
        Math.round(now - this.lastJapaneseEndedAt),
      );
    this.archive();
    this.current = turn === undefined ? {} : { turn };
    this.captureAt = now;
    this.finishAt = null;
    this.voiceAt = null;
    this.partialSeen = false;
    this.playingSeen = false;
    this.audioAt = this.playbackAt = null;
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
    if (lastVoice !== null) {
      this.current.lastDetectedVoiceAfterCaptureMs = Math.max(
        0,
        Math.round(lastVoice - this.captureAt),
      );
      this.current.finishAfterDetectedVoiceMs = Math.max(
        0,
        Math.round(now - lastVoice),
      );
    }
  }
  endpoint(requiredSilenceMs: number, voicedMs: number) {
    this.current.endpointRequiredSilenceMs = Math.max(
      0,
      Math.round(requiredSilenceMs),
    );
    this.current.endpointVoicedMs = Math.max(0, Math.round(voicedMs));
  }
  audioReceived(now = performance.now()) {
    if (this.audioAt !== null || this.finishAt === null) return;
    this.audioAt = now;
    this.current.firstAudioReceivedAfterFinishMs = Math.max(
      0,
      Math.round(now - this.finishAt),
    );
    const server = this.current.server?.finish_to_first_audio;
    if (server !== undefined)
      this.current.transportResidualMs = Math.max(
        0,
        this.current.firstAudioReceivedAfterFinishMs - server,
      );
  }
  playbackRequested(now = performance.now()) {
    if (this.playbackAt !== null || this.finishAt === null) return;
    this.playbackAt = now;
    this.current.playbackRequestAfterFinishMs = Math.max(
      0,
      Math.round(now - this.finishAt),
    );
    if (this.audioAt !== null)
      this.current.audioReceiveToRequestMs = Math.max(
        0,
        Math.round(now - this.audioAt),
      );
  }
  latest(turn?: number) {
    const value =
      turn === undefined
        ? this.finishAt === null
          ? this.turns.at(-1)
          : this.current
        : [...this.turns, this.current]
            .reverse()
            .find((value) => value.turn === turn);
    return value ? { ...value, server: { ...value.server } } : null;
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
    if (this.playbackAt !== null)
      this.current.playbackRequestToPlayingMs = Math.max(
        0,
        Math.round(now - this.playbackAt),
      );
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
