import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVoiceLabResponse,
  japaneseSegments,
} from "../server/voice-lab-response";
import type { VoiceLabReplyEvent } from "../shared/voice-lab";
import { pcmWav } from "../server/voice-lab-samples";

const tutor = {
  reply: {
    japanese: "そうですか。どの町から来ましたか？",
    romaji: "Before",
    french: "De quelle ville viens-tu ?",
  },
  correction: null,
  vocabulary: [],
};
test("lab waits for validated feedback, emits Japanese segments without calling French", async () => {
  const events: VoiceLabReplyEvent[] = [];
  const languages: string[] = [];
  let calls = 0;
  const respond = createVoiceLabResponse(
    {
      turn: async () => {
        calls++;
        return structuredClone(tutor);
      },
      transcribe: async () => "",
      romanize: async () => ["Sō desu ka. Dono machi kara kimashita ka?"],
    },
    {
      speak: async (_, language) => {
        languages.push(language || "ja");
        return pcmWav(Buffer.alloc(6400));
      },
      close() {},
    },
  );
  await respond({
    text: "フランスです。",
    turn: 1,
    language: "ja",
    scenario: "meet",
    history: [],
    signal: new AbortController().signal,
    emit: (event) => events.push(event),
  });
  assert.equal(calls, 1);
  assert.deepEqual(languages, ["ja", "ja"]);
  assert.deepEqual(
    events.map((event) => event.type),
    ["tutor", "audio", "audio", "metrics", "response_done"],
  );
  assert.equal(
    events[0]?.type === "tutor" && events[0].tutor.reply.romaji,
    "Sō desu ka. Dono machi kara kimashita ka?",
  );
});
test("aborted feedback cannot produce old audio", async () => {
  const controller = new AbortController();
  const events: VoiceLabReplyEvent[] = [];
  let speechCalls = 0;
  const respond = createVoiceLabResponse(
    {
      turn: async () => {
        controller.abort();
        return tutor;
      },
      transcribe: async () => "",
    },
    {
      speak: async () => {
        speechCalls++;
        return Buffer.alloc(0);
      },
      close() {},
    },
  );
  await respond({
    text: "フランスです。",
    turn: 1,
    scenario: "meet",
    language: "ja",
    history: [],
    signal: controller.signal,
    emit: (event) => events.push(event),
  });
  assert.equal(speechCalls, 0);
  assert.equal(events.length, 0);
});
test("invalid model output never reaches speech and sentence chunking preserves content", async () => {
  assert.equal(
    japaneseSegments(tutor.reply.japanese).join(""),
    tutor.reply.japanese,
  );
  assert.throws(() => japaneseSegments("bad\ufffd"));
  let spoken = false;
  const respond = createVoiceLabResponse(
    {
      turn: async () =>
        ({ ...tutor, correction: {} }) as unknown as typeof tutor,
      transcribe: async () => "",
    },
    {
      speak: async () => {
        spoken = true;
        return Buffer.alloc(0);
      },
      close() {},
    },
  );
  await assert.rejects(
    respond({
      text: "はい",
      turn: 1,
      scenario: "meet",
      language: "ja",
      history: [],
      signal: new AbortController().signal,
      emit() {},
    }),
  );
  assert.equal(spoken, false);
});
