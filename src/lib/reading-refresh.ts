import type { Progress } from "./progress";
import type { Connection } from "./api";
import { apiRequest } from "./api";
import { readingsResponseSchema } from "../../shared/contracts";

export function storedReadingTexts(progress: Progress) {
  return [
    ...new Set([
      ...progress.words.map((word) => word.japanese),
      ...progress.learning.items.map((item) => item.reference.japanese),
    ]),
  ].filter((text) => text.trim() && text.length <= 500);
}
/** Readings only: do not change errors, dates, boxes, scores, identities or facts. */
export function applyStoredReadings(
  progress: Progress,
  readings: ReadonlyMap<string, string>,
): Progress {
  let changed = false;
  const words = progress.words.map((word) => {
    const reading = readings.get(word.japanese);
    if (!reading || reading === word.romaji) return word;
    changed = true;
    return { ...word, romaji: reading };
  });
  const items = progress.learning.items.map((item) => {
    const reading = readings.get(item.reference.japanese);
    if (!reading || reading === item.reference.romaji) return item;
    changed = true;
    return { ...item, reference: { ...item.reference, romaji: reading } };
  });
  return changed
    ? { ...progress, words, learning: { ...progress.learning, items } }
    : progress;
}
export async function fetchStoredReadings(
  connection: Connection,
  texts: string[],
  signal: AbortSignal,
) {
  const result = new Map<string, string>();
  for (let start = 0; start < texts.length; start += 50) {
    const batch = texts.slice(start, start + 50);
    const { readings } = readingsResponseSchema.parse(
      await apiRequest(connection, "/api/readings", { texts: batch }, signal),
    );
    if (readings.length !== batch.length)
      throw new Error("Invalid readings count");
    batch.forEach((text, index) => {
      const reading = readings[index];
      if (reading && reading !== "…" && !/(^|\s)\?(\s|$)/.test(reading))
        result.set(text, reading);
    });
  }
  return result;
}
