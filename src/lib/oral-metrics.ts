// Bounded volatile diagnostics. No text/audio, identity, storage, network or logs.
export type OralMetrics = {
  recordingMs?: number;
  silenceTailMs?: number;
  requestMs?: number;
  responseBodyMs?: number;
  responseChars?: number;
  server?: Record<string, number>;
  firstPlaybackMs?: number;
  playbackMs?: number;
  completed?: boolean;
};

declare const metricBrand: unique symbol;
declare const trialBrand: unique symbol;
export type OralMetricToken = Readonly<{ [metricBrand]: true }>;
export type OralTrialToken = Readonly<{ [trialBrand]: true }>;
export type OralTrialPlatform = "android" | "ios" | "web" | "other";
export type OralEvent =
  | "recognition_empty"
  | "recognition_uncertain"
  | "playback_error"
  | "request_error"
  | "french_unavailable"
  | "interruption_user"
  | "interruption_background";

const MAX_MEASUREMENT_MS = 3_600_000;
const MAX_RESPONSE_CHARS = 16_000_000;
const MAX_COUNT = 100_000;
const TRIAL_TRACE_LIMIT = 120;
const SERVER_METRICS = new Set([
  "decode",
  "whisper",
  "correction",
  "dialogue",
  "translation",
  "dialogue_translation",
  "review",
  "help",
  "question_help",
  "romanization",
  "generations",
  "translation_unavailable",
  "worker_roundtrip",
  "worker_queue",
  "asr",
  "teaching",
  "tts_ja",
  "tts_fr",
  "server",
]);
const EVENT_NAMES: readonly OralEvent[] = [
  "recognition_empty",
  "recognition_uncertain",
  "playback_error",
  "request_error",
  "french_unavailable",
  "interruption_user",
  "interruption_background",
];

type SampleStats = {
  samples: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
};
type ActiveMetric = {
  token: OralMetricToken;
  trial: OralTrialToken | null;
  started: number;
  sent?: number;
  playback?: number;
  value: OralMetrics;
};
type Trial = {
  token: OralTrialToken;
  started: number;
  recordingStarts: number;
  sentTurns: number;
  finishedTurns: number;
  completedTurns: number;
  firstPlayback: SampleStats;
  firstPlaybackFromVoice: SampleStats;
  events: Record<OralEvent, number>;
  turns: OralMetrics[];
};
let current: ActiveMetric | undefined;
let trial: Trial | undefined;
const history: OralMetrics[] = [];

function measurement(value: unknown, maximum = MAX_MEASUREMENT_MS) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum
    ? Math.round(value)
    : undefined;
}
function serverMeasurement(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_MEASUREMENT_MS
    ? Math.round(value * 10) / 10
    : undefined;
}
function serverMeasurements(raw: unknown) {
  const result: Record<string, number> = {};
  if (raw && typeof raw === "object")
    for (const [name, value] of Object.entries(raw)) {
      const safe = serverMeasurement(value);
      if (SERVER_METRICS.has(name) && safe !== undefined) result[name] = safe;
    }
  return result;
}
function copyMetric(value: OralMetrics): OralMetrics {
  return { ...value, ...(value.server ? { server: { ...value.server } } : {}) };
}
function active(token?: OralMetricToken | null) {
  return current && (token === undefined || token === current.token)
    ? current
    : undefined;
}
function belongsToTrial(metric: ActiveMetric) {
  return trial && metric.trial === trial.token ? trial : undefined;
}
function increment(value: number) {
  return Math.min(MAX_COUNT, value + 1);
}
function newStats(): SampleStats {
  return { samples: 0, totalMs: 0, minMs: 0, maxMs: 0 };
}
function sample(stats: SampleStats, value: number | undefined) {
  if (value === undefined || stats.samples >= MAX_COUNT) return;
  stats.minMs = stats.samples ? Math.min(stats.minMs, value) : value;
  stats.maxMs = Math.max(stats.maxMs, value);
  stats.totalMs += value;
  stats.samples++;
}
function summary(stats?: SampleStats) {
  return {
    samples: stats?.samples || 0,
    meanMs: stats?.samples ? Math.round(stats.totalMs / stats.samples) : null,
    minMs: stats?.samples ? stats.minMs : null,
    maxMs: stats?.samples ? stats.maxMs : null,
  };
}

/** Capture once before asynchronous work, then pass the token to its callbacks. */
export function captureOralMetrics(): OralMetricToken | null {
  return current?.token || null;
}
export function captureOralTrial(): OralTrialToken | null {
  return trial?.token || null;
}
export function beginOralMetrics(now = performance.now()): OralMetricToken {
  if (current) finishOralMetrics(false, now, current.token);
  const token = Object.freeze({}) as OralMetricToken;
  current = { token, trial: trial?.token || null, started: now, value: {} };
  if (trial) trial.recordingStarts = increment(trial.recordingStarts);
  return token;
}
export function sentOralMetrics(
  silenceTailMs: number,
  now = performance.now(),
  token?: OralMetricToken | null,
) {
  const metric = active(token);
  if (!metric || metric.sent !== undefined) return;
  const recordingMs = measurement(now - metric.started);
  if (recordingMs === undefined) return;
  metric.sent = now;
  metric.value.recordingMs = recordingMs;
  const tail = measurement(silenceTailMs, recordingMs);
  if (tail !== undefined) metric.value.silenceTailMs = tail;
  const owner = belongsToTrial(metric);
  if (owner) owner.sentTurns = increment(owner.sentTurns);
}
export function responseOralMetrics(
  value: Pick<
    OralMetrics,
    "requestMs" | "responseBodyMs" | "responseChars" | "server"
  >,
  token?: OralMetricToken | null,
) {
  const metric = active(token);
  if (!metric || !value || typeof value !== "object") return;
  for (const name of [
    "requestMs",
    "responseBodyMs",
    "responseChars",
  ] as const) {
    const safe = measurement(
      value[name],
      name === "responseChars" ? MAX_RESPONSE_CHARS : MAX_MEASUREMENT_MS,
    );
    if (safe !== undefined) metric.value[name] = safe;
  }
  const server = serverMeasurements(value.server);
  if (Object.keys(server).length) metric.value.server = server;
}
// Called ONLY by web onplaying, native playing/non-buffering status or system onStart.
export function playbackOralMetrics(
  now = performance.now(),
  token?: OralMetricToken | null,
) {
  const metric = active(token);
  if (metric?.sent === undefined || metric.playback !== undefined) return;
  const duration = measurement(now - metric.sent);
  if (duration === undefined) return;
  metric.playback = now;
  metric.value.firstPlaybackMs = duration;
}
export function finishOralMetrics(
  completed: boolean,
  now = performance.now(),
  token?: OralMetricToken | null,
) {
  const metric = active(token);
  if (!metric) return;
  if (metric.playback !== undefined) {
    const duration = measurement(now - metric.playback);
    if (duration !== undefined) metric.value.playbackMs = duration;
  }
  metric.value.completed = completed === true;
  history.push(copyMetric(metric.value));
  if (history.length > 30) history.shift();
  const owner = belongsToTrial(metric);
  if (owner) {
    owner.finishedTurns = increment(owner.finishedTurns);
    if (completed === true)
      owner.completedTurns = increment(owner.completedTurns);
    sample(owner.firstPlayback, metric.value.firstPlaybackMs);
    // The VAD tail measures the last detected voice, not semantic sentence completion.
    if (
      metric.value.firstPlaybackMs !== undefined &&
      metric.value.silenceTailMs !== undefined
    )
      sample(
        owner.firstPlaybackFromVoice,
        metric.value.firstPlaybackMs + metric.value.silenceTailMs,
      );
    owner.turns.push(copyMetric(metric.value));
    if (owner.turns.length > TRIAL_TRACE_LIMIT) owner.turns.shift();
  }
  current = undefined;
}
export function oralMetricsSnapshot() {
  return history.map(copyMetric);
}

/** Explicit opt-in/reset: previous traces and in-flight ownership are discarded. */
export function startOralTrial(now = performance.now()): OralTrialToken {
  const token = Object.freeze({}) as OralTrialToken;
  current = undefined;
  history.length = 0;
  trial = {
    token,
    started: now,
    recordingStarts: 0,
    sentTurns: 0,
    finishedTurns: 0,
    completedTurns: 0,
    firstPlayback: newStats(),
    firstPlaybackFromVoice: newStats(),
    events: Object.fromEntries(EVENT_NAMES.map((name) => [name, 0])) as Record<
      OralEvent,
      number
    >,
    turns: [],
  };
  return token;
}
export function noteOralEvent(event: OralEvent, token?: OralTrialToken | null) {
  if (
    !trial ||
    (token !== undefined && token !== trial.token) ||
    !EVENT_NAMES.includes(event)
  )
    return;
  trial.events[event] = increment(trial.events[event]);
}
export function oralTrialReport(
  platform: OralTrialPlatform,
  now = performance.now(),
) {
  const elapsed = trial ? now - trial.started : 0;
  return {
    schemaVersion: "sensei-oral-trial.v1" as const,
    humanValidation: "pending" as const,
    platform: ["android", "ios", "web"].includes(platform) ? platform : "other",
    started: !!trial,
    elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
    turnInProgress: !!current && !!trial && current.trial === trial.token,
    counts: {
      recordingStarts: trial?.recordingStarts || 0,
      sentTurns: trial?.sentTurns || 0,
      finishedTurns: trial?.finishedTurns || 0,
      completedTurns: trial?.completedTurns || 0,
    },
    events: Object.fromEntries(
      EVENT_NAMES.map((name) => [name, trial?.events[name] || 0]),
    ) as Record<OralEvent, number>,
    firstPlaybackAfterSendMs: summary(trial?.firstPlayback),
    firstPlaybackAfterDetectedVoiceMs: summary(trial?.firstPlaybackFromVoice),
    retainedTurnLimit: TRIAL_TRACE_LIMIT,
    retainedTurns: trial?.turns.length || 0,
    turns: trial?.turns.map(copyMetric) || [],
  };
}
export function parseServerTiming(header: string | null) {
  const timings: Record<string, number> = {};
  for (const entry of (header || "").split(",")) {
    const match = /^\s*([a-z_]{1,40});dur=(\d+(?:\.\d+)?)\s*$/.exec(entry);
    if (match && SERVER_METRICS.has(match[1]!)) {
      const safe = serverMeasurement(Number(match[2]));
      if (safe !== undefined) timings[match[1]!] = safe;
    }
    const count =
      /^\s*(generations|translation_unavailable);desc="(\d+)"\s*$/.exec(entry);
    if (count) {
      const safe = measurement(Number(count[2]));
      if (safe !== undefined) timings[count[1]!] = safe;
    }
  }
  return timings;
}
