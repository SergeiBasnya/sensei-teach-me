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
let current:
  | { started: number; sent?: number; playback?: number; value: OralMetrics }
  | undefined;
const history: OralMetrics[] = [];
export function beginOralMetrics(now = performance.now()) {
  current = { started: now, value: {} };
}
export function sentOralMetrics(
  silenceTailMs: number,
  now = performance.now(),
) {
  if (!current) return;
  current.sent = now;
  current.value.recordingMs = Math.round(now - current.started);
  current.value.silenceTailMs = Math.round(silenceTailMs);
}
export function responseOralMetrics(
  value: Pick<
    OralMetrics,
    "requestMs" | "responseBodyMs" | "responseChars" | "server"
  >,
) {
  if (current) Object.assign(current.value, value);
}
// Called ONLY by web onplaying, native playing/non-buffering status or system onStart.
export function playbackOralMetrics(now = performance.now()) {
  if (current?.sent !== undefined && current.playback === undefined) {
    current.playback = now;
    current.value.firstPlaybackMs = Math.round(now - current.sent);
  }
}
export function finishOralMetrics(completed: boolean, now = performance.now()) {
  if (!current) return;
  if (current.playback !== undefined)
    current.value.playbackMs = Math.round(now - current.playback);
  current.value.completed = completed;
  history.push(current.value);
  if (history.length > 30) history.shift();
  current = undefined;
}
export function oralMetricsSnapshot() {
  return history.map((value) => ({
    ...value,
    ...(value.server ? { server: { ...value.server } } : {}),
  }));
}
export function parseServerTiming(header: string | null) {
  const timings: Record<string, number> = {};
  for (const entry of (header || "").split(",")) {
    const match = /^\s*([a-z_]{1,40});dur=(\d+(?:\.\d+)?)\s*$/.exec(entry);
    if (match) timings[match[1]!] = Number(match[2]);
    const count =
      /^\s*(generations|translation_unavailable);desc="(\d+)"\s*$/.exec(entry);
    if (count) timings[count[1]!] = Number(count[2]);
  }
  return timings;
}
