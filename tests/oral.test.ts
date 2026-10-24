import test from "node:test";
import assert from "node:assert/strict";
import { beginVoiceActivity, observeVoice } from "../src/lib/voice-activity";
test("une hésitation courte conserve le tour ; la fin de phrase l’envoie automatiquement", () => {
  const activity = beginVoiceActivity(0);
  for (let t = 100; t <= 600; t += 100)
    assert.equal(observeVoice(activity, -25, t), "listen");
  assert.equal(observeVoice(activity, -70, 2000), "listen");
  assert.equal(observeVoice(activity, -25, 2100), "listen");
  assert.equal(observeVoice(activity, -70, 3800), "listen");
  assert.equal(observeVoice(activity, -70, 3900), "send");
});
test("le silence et un choc bref ne sont pas envoyés ; le micro se met en pause", () => {
  const activity = beginVoiceActivity(0);
  observeVoice(activity, -20, 100);
  for (let t = 200; t < 15_000; t += 100)
    assert.equal(observeVoice(activity, -70, t), "listen");
  assert.equal(observeVoice(activity, -70, 15_000), "quiet");
  assert.equal(observeVoice(beginVoiceActivity(0), undefined, 15_000), "quiet");
});
