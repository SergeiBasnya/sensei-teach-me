import { AsyncLocalStorage } from "node:async_hooks";

// Numeric, request-scoped diagnostics only. Never store text, audio or identity.
export type Timings = Record<string, number>;
export const timingContext = new AsyncLocalStorage<Timings>();
export function addTiming(
  name: string,
  ms: number,
  target = timingContext.getStore(),
) {
  if (target && /^[a-z_]{1,40}$/.test(name) && Number.isFinite(ms) && ms >= 0)
    target[name] = Math.round(((target[name] || 0) + ms) * 10) / 10;
}
export async function timed<T>(
  name: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const target = timingContext.getStore();
  try {
    return await work();
  } finally {
    addTiming(name, performance.now() - started, target);
  }
}
export function serverTimingHeader(timings: Timings) {
  return Object.entries(timings)
    .map(([name, ms]) =>
      name === "generations" || name === "translation_unavailable"
        ? `${name};desc="${ms}"`
        : `${name};dur=${ms}`,
    )
    .join(", ");
}
