import test from "node:test";
import assert from "node:assert/strict";
import {
  beginOralMetrics,
  captureOralMetrics,
  captureOralTrial,
  finishOralMetrics,
  noteOralEvent,
  oralMetricsSnapshot,
  oralTrialReport,
  parseServerTiming,
  playbackOralMetrics,
  responseOralMetrics,
  sentOralMetrics,
  startOralTrial,
  type OralEvent,
  type OralTrialPlatform,
} from "../src/lib/oral-metrics";

test("le rapport reste vide et en attente avant un essai volontaire", () => {
  const report = oralTrialReport("android", 900_000);
  assert.equal(report.started, false);
  assert.equal(report.humanValidation, "pending");
  assert.deepEqual(report.turns, []);
  assert.equal(captureOralTrial(), null);
  noteOralEvent("request_error");
  assert.equal(oralTrialReport("android").events.request_error, 0);
});

test("quinze minutes écoulées ne constituent jamais une validation humaine", () => {
  startOralTrial(0);
  const report = oralTrialReport("android", 900_000);
  assert.equal(report.elapsedMs, 900_000);
  assert.equal(report.humanValidation, "pending");
  assert.deepEqual(report.firstPlaybackAfterSendMs, {
    samples: 0,
    meanMs: null,
    minMs: null,
    maxMs: null,
  });
  assert.equal(
    oralTrialReport("unexpected input" as OralTrialPlatform).platform,
    "other",
  );
});

test("le rapport distingue envoi, dernière voix détectée et fin du lecteur", () => {
  const trial = startOralTrial(0);
  const turn = beginOralMetrics(100);
  sentOralMetrics(1800, 3100, turn);
  responseOralMetrics(
    {
      requestMs: 1250,
      responseBodyMs: 20,
      responseChars: 4500,
      server: { asr: 42.6, tts_ja: 600 },
    },
    turn,
  );
  playbackOralMetrics(4500, turn);
  playbackOralMetrics(4700, turn);
  finishOralMetrics(true, 6100, turn);
  for (const event of [
    "recognition_empty",
    "recognition_uncertain",
    "playback_error",
    "request_error",
    "french_unavailable",
    "interruption_user",
    "interruption_background",
  ] as const)
    noteOralEvent(event, trial);
  const report = oralTrialReport("android", 7000);
  assert.equal(report.turns[0]?.recordingMs, 3000);
  assert.equal(report.turns[0]?.firstPlaybackMs, 1400);
  assert.equal(report.turns[0]?.playbackMs, 1600);
  assert.equal(report.turns[0]?.server?.asr, 42.6);
  assert.equal(report.firstPlaybackAfterSendMs.meanMs, 1400);
  assert.equal(report.firstPlaybackAfterDetectedVoiceMs.meanMs, 3200);
  assert.deepEqual(report.counts, {
    recordingStarts: 1,
    sentTurns: 1,
    finishedTurns: 1,
    completedTurns: 1,
  });
  assert.equal(report.events.french_unavailable, 1);
  assert.equal(report.events.playback_error, 1);
  assert.equal(report.humanValidation, "pending");
});

test("les valeurs exportées suivent une liste fermée et rejettent texte et nombres invalides", () => {
  startOralTrial(0);
  const turn = beginOralMetrics(0);
  sentOralMetrics(0, 100, turn);
  responseOralMetrics(
    {
      requestMs: Number.NaN,
      responseBodyMs: -10,
      responseChars: Number.POSITIVE_INFINITY,
      server: {
        asr: 12.3,
        transcription: 42,
        personal_name: 21,
        tts_ja: "PRIVATE_TEXT" as unknown as number,
      },
      transcript: "PRIVATE_TEXT",
      audio: "PRIVATE_AUDIO",
      token: "PRIVATE_TOKEN",
    } as Parameters<typeof responseOralMetrics>[0],
    turn,
  );
  noteOralEvent("PRIVATE_EVENT" as OralEvent);
  playbackOralMetrics(Number.POSITIVE_INFINITY, turn);
  finishOralMetrics(false, 200, turn);
  const report = oralTrialReport("android", 300);
  assert.deepEqual(report.turns[0]?.server, { asr: 12.3 });
  assert.equal(report.turns[0]?.requestMs, undefined);
  assert.equal(report.turns[0]?.responseBodyMs, undefined);
  assert.equal(report.turns[0]?.responseChars, undefined);
  assert.equal(report.turns[0]?.firstPlaybackMs, undefined);
  const json = JSON.stringify(report);
  for (const forbidden of [
    "PRIVATE_",
    "transcription",
    "personal_name",
    '"audio"',
    '"token"',
    '"transcript"',
  ])
    assert.equal(json.includes(forbidden), false);
});

test("un callback tardif ne modifie ni ne termine le tour suivant", () => {
  startOralTrial(0);
  const old = beginOralMetrics(0);
  sentOralMetrics(0, 100, old);
  finishOralMetrics(false, 200, old);
  const latest = beginOralMetrics(300);
  responseOralMetrics({ requestMs: 77 }, old);
  sentOralMetrics(10, 500, old);
  playbackOralMetrics(800, old);
  finishOralMetrics(true, 900, old);
  assert.equal(captureOralMetrics(), latest);
  sentOralMetrics(10, 600, latest);
  playbackOralMetrics(700, latest);
  finishOralMetrics(true, 800, latest);
  const report = oralTrialReport("android", 1000);
  assert.equal(report.turns.length, 2);
  assert.equal(report.turns[1]?.requestMs, undefined);
  assert.equal(report.turns[1]?.firstPlaybackMs, 100);
  assert.equal(report.turns[1]?.recordingMs, 300);
});

test("un appel lancé sans tour reste exclu même si un tour commence ensuite", () => {
  startOralTrial(0);
  const absent = captureOralMetrics();
  assert.equal(absent, null);
  const active = beginOralMetrics(100);
  responseOralMetrics({ requestMs: 20 }, absent);
  playbackOralMetrics(1000, absent);
  finishOralMetrics(true, 1100, absent);
  assert.equal(captureOralMetrics(), active);
  finishOralMetrics(false, 1200, active);
  assert.equal(oralTrialReport("android", 1300).turns[0]?.requestMs, undefined);
});

test("réinitialiser un essai exclut ses anciens événements et requêtes", () => {
  const oldTrial = startOralTrial(0);
  const oldTurn = beginOralMetrics(100);
  noteOralEvent("recognition_empty", oldTrial);
  const freshTrial = startOralTrial(1000);
  const turn = beginOralMetrics(1100);
  responseOralMetrics({ requestMs: 5000 }, oldTurn);
  noteOralEvent("request_error", oldTrial);
  noteOralEvent("playback_error", null);
  finishOralMetrics(true, 1200, oldTurn);
  assert.equal(captureOralTrial(), freshTrial);
  assert.equal(captureOralMetrics(), turn);
  finishOralMetrics(false, 1300, turn);
  const report = oralTrialReport("android", 1500);
  assert.equal(report.elapsedMs, 500);
  assert.equal(report.events.recognition_empty, 0);
  assert.equal(report.events.request_error, 0);
  assert.equal(report.events.playback_error, 0);
  assert.equal(report.turns[0]?.requestMs, undefined);
});

test("les retours de rapport sont des copies indépendantes", () => {
  startOralTrial(0);
  const turn = beginOralMetrics(100);
  responseOralMetrics({ server: { asr: 123 } }, turn);
  finishOralMetrics(true, 200, turn);
  const copy = oralTrialReport("android", 300);
  copy.turns[0]!.server!.asr = 999;
  copy.events.request_error = 999;
  copy.turns.splice(0);
  const snapshot = oralMetricsSnapshot();
  snapshot[0]!.server!.asr = 888;
  const fresh = oralTrialReport("android", 400);
  assert.equal(fresh.turns[0]!.server!.asr, 123);
  assert.equal(fresh.events.request_error, 0);
  assert.equal(oralMetricsSnapshot()[0]!.server!.asr, 123);
});

test("le bilan garde au plus 120 traces mais agrège tous les tours observés", () => {
  startOralTrial(0);
  for (let i = 0; i < 150; i++) {
    const base = i * 1000;
    const turn = beginOralMetrics(base);
    sentOralMetrics(0, base + 100, turn);
    playbackOralMetrics(base + 100 + (i === 0 ? 100 : 10), turn);
    finishOralMetrics(true, base + 300, turn);
  }
  const report = oralTrialReport("android", 200_000);
  assert.equal(report.retainedTurns, 120);
  assert.equal(report.turns.length, 120);
  assert.equal(oralMetricsSnapshot().length, 30);
  assert.equal(report.counts.finishedTurns, 150);
  assert.equal(report.firstPlaybackAfterSendMs.samples, 150);
  assert.equal(report.firstPlaybackAfterSendMs.meanMs, 11);
  assert.equal(report.firstPlaybackAfterSendMs.maxMs, 100);
});

test("les en-têtes serveur conservent les décimales utiles et éliminent les noms arbitraires", () => {
  assert.deepEqual(
    parseServerTiming(
      'asr;dur=12.3, worker_queue;dur=0.4, secret_name;dur=99, tts_fr;dur=-1, generations;desc="2", server;dur=9999999999',
    ),
    { asr: 12.3, worker_queue: 0.4, generations: 2 },
  );
});
