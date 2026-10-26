import assert from "node:assert/strict";
import test from "node:test";
import { getLesson, lessons } from "../shared/learning-plan";
import { lessonIdSchema } from "../shared/contracts";
import { getLearningStats, lessonScene } from "../src/lib/learning-plan";
import { initialProgress, progressSchema } from "../src/lib/progress";

test("les anciennes séances restent conservées sans inventer des objectifs déjà pratiqués", () => {
  const old = progressSchema.parse({
    ...initialProgress,
    sessions: [
      {
        id: "old",
        scenario: "meet",
        date: "2026-10-24",
        seconds: 180,
        turns: 5,
      },
    ],
  });
  const stats = getLearningStats(old);
  assert.equal(old.sessions.length, 1);
  assert.equal(stats.count, 0);
  assert.equal(stats.next.id, "meet-name");
});
test("un essai vide et une discussion libre ne font pas avancer le plan ; les répétitions ne doublent pas l’avancement", () => {
  const sessions = [
    {
      id: "empty",
      scenario: "meet",
      lessonId: "meet-name",
      date: "2026-10-26",
      seconds: 9,
      turns: 0,
    },
    { id: "free", scenario: "free", date: "2026-10-26", seconds: 50, turns: 4 },
  ];
  assert.equal(
    getLearningStats(progressSchema.parse({ ...initialProgress, sessions }))
      .count,
    0,
  );
  sessions.push({ ...sessions[0]!, id: "one", turns: 1 });
  sessions.push({ ...sessions[0]!, id: "repeat", turns: 2 });
  const stats = getLearningStats(
    progressSchema.parse({ ...initialProgress, sessions }),
  );
  assert.equal(stats.count, 1);
  assert.equal(stats.next.id, "meet-origin");
});
test("chaque objectif ouvre sa propre question ; le plan entièrement parcouru reste disponible en révision", () => {
  for (const lesson of lessons) {
    assert.equal(lessonIdSchema.parse(lesson.id), lesson.id);
    const scene = lessonScene(lesson);
    assert.equal(scene.lessonId, lesson.id);
    assert.equal(scene.id, lesson.scenario);
    assert.equal(scene.title, lesson.title);
    assert.ok(scene.turns[0]?.tutor.japanese);
  }
  assert.match(
    lessonScene(getLesson("meet-origin")!).turns[0]!.tutor.japanese,
    /どこ/,
  );
  const progress = progressSchema.parse({
    ...initialProgress,
    sessions: lessons.map((lesson, i) => ({
      id: String(i),
      scenario: lesson.scenario,
      lessonId: lesson.id,
      date: "2026-10-26",
      seconds: 20,
      turns: 1,
    })),
  });
  assert.equal(getLearningStats(progress).count, 9);
  assert.equal(getLearningStats(progress).next.id, "meet-name");
});
