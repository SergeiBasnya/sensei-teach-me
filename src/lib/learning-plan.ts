import { lessons, type Lesson } from "../../shared/learning-plan";
import { scenes, type Scene } from "../data/lessons";
import type { Progress } from "./progress";

export function getLearningStats(progress: Progress) {
  const practiced = new Set(
    progress.sessions
      .filter((session) => session.lessonId && session.turns > 0)
      .map((session) => session.lessonId!),
  );
  const next =
    lessons.find((lesson) => !practiced.has(lesson.id)) || lessons[0]!;
  return { practiced, next, total: lessons.length, count: practiced.size };
}

export function lessonScene(lesson: Lesson): Scene {
  const source = scenes.find((scene) => scene.id === lesson.scenario)!;
  return {
    ...source,
    lessonId: lesson.id,
    title: lesson.title,
    subtitle: source.title,
    turns: [source.turns[lesson.turnIndex]!],
  };
}
