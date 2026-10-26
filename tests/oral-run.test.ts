import test from "node:test";
import assert from "node:assert/strict";
import { OralRun } from "../src/lib/oral-run";

test("un seul démarrage et aucune ancienne tâche après une pause", () => {
  const run = new OralRun();
  const first = run.begin()!;
  assert.equal(run.begin(), null);
  assert.equal(run.current(first), true);
  const stopped = run.stop();
  assert.equal(run.stopped(stopped), true);
  const second = run.begin()!;
  assert.equal(run.stopped(stopped), false);
  assert.equal(run.current(first), false);
  assert.equal(run.current(second), true);
  run.didRead(first, "ancienne réponse");
  assert.equal(run.needsReading("ancienne réponse"), true);
});

test("reprendre l’écoute ne relit pas la question déjà entendue", () => {
  const run = new OralRun();
  const first = run.begin()!;
  assert.equal(run.needsReading("こんにちは！"), true);
  run.didRead(first, "こんにちは！");
  run.stop();
  run.begin();
  assert.equal(run.needsReading("こんにちは！"), false);
  assert.equal(run.needsReading("どこから来ましたか？"), true);
});

test("la boîte de permission ne coupe pas le démarrage ; le vrai arrière-plan met en pause", () => {
  const run = new OralRun();
  const first = run.begin()!;
  run.requestingPermission(first, true);
  assert.equal(run.shouldPause("inactive"), false);
  assert.equal(run.shouldPause("background"), false);
  run.requestingPermission(first, false);
  assert.equal(run.shouldPause("background"), true);
  assert.equal(run.shouldPause("active"), false);
  run.stop();
  run.begin();
  run.requestingPermission(first, true);
  assert.equal(run.shouldPause("background"), true);
});
