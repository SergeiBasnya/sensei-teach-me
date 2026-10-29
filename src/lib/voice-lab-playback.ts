/** A diagnostic observer must never own playback or survive its source epoch. */
export function onceCurrentPlayback(
  current: () => boolean,
  observe: () => void,
) {
  let started = false;
  return () => {
    if (started || !current()) return;
    started = true;
    try {
      observe();
    } catch {
      /* Measurement failure must not stop valid audio. */
    }
  };
}
