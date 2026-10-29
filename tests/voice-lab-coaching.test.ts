import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import { applyVoiceLabDetails } from "../src/lib/voice-lab-details";
import { pcmWav } from "../server/voice-lab-samples";
import type { VoiceLabReplyEvent } from "../shared/voice-lab";

const tutor = {
  reply: {
    japanese: "コーヒー一つですね。ホットですか、アイスですか？",
    romaji: "Kōhī hitotsu desu ne. Hotto desu ka, aisu desu ka?",
    french: "",
  },
  correction: null,
  vocabulary: [],
  coaching:
    "Hotto veut dire chaud, aisu veut dire glacé. Réponds avec ton choix.",
};

test("French enrichment cannot erase or replace the primary teaching hint", () => {
  for (const coaching of [null, "Nouvelle règle secondaire."]) {
    const changed = applyVoiceLabDetails(tutor, {
      japanese: tutor.reply.japanese,
      french: "Un café. Chaud ou glacé ?",
      coaching,
    });
    assert.equal(changed?.coaching, tutor.coaching);
    assert.equal(changed?.reply.french, "Un café. Chaud ou glacé ?");
    assert.equal(changed?.reply.romaji, tutor.reply.romaji);
  }
  const noHint = { ...tutor, coaching: null };
  assert.equal(
    applyVoiceLabDetails(noHint, {
      japanese: tutor.reply.japanese,
      french: "Un café.",
      coaching: "Une règle non demandée.",
    })?.coaching,
    null,
  );
});

test("the response emits the unchanged validated hint with late French metadata", async () => {
  const events: VoiceLabReplyEvent[] = [];
  const response = createVoiceLabResponse(
    { turn: async () => structuredClone(tutor), transcribe: async () => "" },
    { speak: async () => pcmWav(Buffer.alloc(32000)), close() {} },
    {
      details: async () => ({
        french: "Un café. Chaud ou glacé ?",
        coaching: null,
      }),
    },
  );
  await response({
    text: "コーヒーを一つください。",
    turn: 1,
    language: "ja",
    scenario: "cafe",
    history: [],
    signal: new AbortController().signal,
    emit: (event) => events.push(event),
  });
  await wait(0);
  const primary = events.find((e) => e.type === "tutor"),
    details = events.find((e) => e.type === "details");
  assert.ok(primary?.type === "tutor" && primary.tutor.coaching);
  assert.ok(details?.type === "details");
  assert.equal(details.coaching, primary.tutor.coaching);
});
