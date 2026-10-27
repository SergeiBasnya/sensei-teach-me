import { z } from "zod";

export const scenarioIdSchema = z.enum(["meet", "cafe", "station", "free"]);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;
export const lessonIdSchema = z.enum([
  "meet-name",
  "meet-origin",
  "meet-likes",
  "cafe-order",
  "cafe-choice",
  "cafe-finish",
  "station-destination",
  "station-ticket",
  "station-thanks",
]);
export type LessonId = z.infer<typeof lessonIdSchema>;
export const phraseSchema = z.object({
  japanese: z.string(),
  romaji: z.string(),
  french: z.string(),
});
export type Phrase = z.infer<typeof phraseSchema>;
