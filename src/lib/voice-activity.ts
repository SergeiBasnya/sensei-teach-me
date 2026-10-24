// Fin de tour par niveau sonore : tolère une hésitation, ignore les clics brefs.
export type VoiceActivity = {
  started: number;
  lastVoice: number;
  voicedMs: number;
  floor: number;
  previous: number;
};
export function beginVoiceActivity(now: number): VoiceActivity {
  return {
    started: now,
    previous: now,
    lastVoice: now,
    voicedMs: 0,
    floor: -60,
  };
}
export function observeVoice(
  state: VoiceActivity,
  db: number | undefined,
  now: number,
): "listen" | "send" | "quiet" {
  const step = Math.max(0, Math.min(250, now - state.previous));
  state.previous = now;
  if (db !== undefined && Number.isFinite(db)) {
    const threshold = Math.min(-25, Math.max(-45, state.floor + 12));
    if (db > threshold) {
      state.voicedMs += step;
      state.lastVoice = now;
    } else
      state.floor = Math.max(
        -75,
        Math.min(-38, state.floor * 0.98 + db * 0.02),
      );
  }
  const heard = state.voicedMs >= 300;
  if (heard && now - state.lastVoice >= 1800) return "send";
  if (now - state.started >= 30_000) return heard ? "send" : "quiet";
  if (!heard && now - state.started >= 15_000) return "quiet";
  return "listen";
}
