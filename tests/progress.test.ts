import test from "node:test";
import assert from "node:assert/strict";
import {
  addWords,
  dayKey,
  getStats,
  initialProgress,
  progressSchema,
} from "../src/lib/progress";
import { scenes } from "../src/data/lessons";

test("jour local et séries : les jours manquants interrompent la série", () => {
  const now = new Date(2026, 9, 24, 12);
  assert.equal(dayKey(now), "2026-10-24");
  const sessions = ["2026-10-21", "2026-10-23", "2026-10-24"].map(
    (date, i) => ({
      id: String(i),
      date,
      scenario: "meet",
      seconds: 45,
      turns: 1,
    }),
  );
  const stats = getStats({ ...initialProgress, sessions }, now);
  assert.equal(stats.streak, 2);
  assert.equal(stats.secondsToday, 45);
  assert.equal(stats.totalMinutes, 2);
  assert.equal(
    getStats({ ...initialProgress, sessions: sessions.slice(0, 2) }, now)
      .streak,
    1,
  );
  assert.equal(
    getStats({ ...initialProgress, sessions: sessions.slice(0, 1) }, now)
      .streak,
    0,
  );
});
test("les expressions rencontrées sont dédupliquées sans devenir acquises automatiquement", () => {
  const phrase = scenes[0]!.turns[0]!.suggestion;
  const next = addWords(initialProgress, [phrase, phrase]);
  assert.equal(next.words.length, 1);
  assert.equal(next.words[0]!.learned, false);
  assert.equal(addWords(next, [phrase]).words.length, 1);
  assert.equal(initialProgress.words.length, 0);
});
test("une sauvegarde corrompue est rejetée, sans faux historique", () => {
  assert.equal(progressSchema.safeParse({ sessions: [] }).success, false);
  assert.equal(
    progressSchema.safeParse({ ...initialProgress, goal: -1 }).success,
    false,
  );
  assert.equal(getStats(initialProgress).streak, 0);
});
