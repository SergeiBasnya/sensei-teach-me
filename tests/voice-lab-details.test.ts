import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import {
  applyVoiceLabDetails,
  applyPhraseDetails,
} from "../src/lib/voice-lab-details";
import {
  voiceLabReplySchema,
  type VoiceLabReplyEvent,
} from "../shared/voice-lab";
import { pcmWav } from "../server/voice-lab-samples";

const tutor = {
  reply: {
    japanese: "そうですか。どの町から来ましたか？",
    romaji: "Sō desu ka. Dono machi kara kimashita ka?",
    french: "",
  },
  correction: null,
  vocabulary: [],
};
const provider = {
  turn: async () => structuredClone(tutor),
  transcribe: async () => "",
};
const speech = { speak: async () => pcmWav(Buffer.alloc(6400)), close() {} };
const input = {
  text: "フランスです。",
  turn: 1,
  language: "ja" as const,
  scenario: "meet" as const,
  history: [],
  signal: new AbortController().signal,
};

test("first validated audio is emitted while secondary text is still pending", async () => {
  const events: VoiceLabReplyEvent[] = [];
  let finishDetails: (value: {
    french: string;
    coaching: null;
  }) => void = () => {};
  let detailsStarted = false;
  const response = createVoiceLabResponse(provider, speech, {
    details: async () => {
      assert.equal(
        events.some((event) => event.type === "audio" && event.index === 0),
        true,
      );
      detailsStarted = true;
      return new Promise((resolve) => {
        finishDetails = resolve;
      });
    },
  });
  const pending = response({ ...input, emit: (event) => events.push(event) });
  while (!detailsStarted) await wait(1);
  assert.equal(
    events.some((event) => event.type === "response_done"),
    false,
  );
  finishDetails({ french: "De quelle ville viens-tu ?", coaching: null });
  await pending;
  assert.ok(
    events.findIndex((event) => event.type === "audio") <
      events.findIndex((event) => event.type === "details"),
  );
  assert.equal(events.at(-1)?.type, "response_done");
  const details = events.find((event) => event.type === "details");
  assert.equal(
    details?.type === "details" && details.japanese,
    tutor.reply.japanese,
  );
});

test("secondary output cannot mutate Japanese or turn into a correction", async () => {
  const events: VoiceLabReplyEvent[] = [];
  const response = createVoiceLabResponse(provider, speech, {
    details: async () => ({
      french: "Une phrase.",
      coaching: null,
      japanese: "別の文。",
    }),
  });
  await response({ ...input, emit: (event) => events.push(event) });
  assert.equal(
    events.some((event) => event.type === "details"),
    false,
  );
  const metrics = events.find((event) => event.type === "metrics");
  assert.equal(
    metrics?.type === "metrics" && metrics.metrics.secondary_unavailable,
    1,
  );
  assert.equal(
    events[0]?.type === "tutor" && events[0].tutor.reply.japanese,
    tutor.reply.japanese,
  );
  assert.equal(
    voiceLabReplySchema.safeParse({
      type: "details",
      japanese: tutor.reply.japanese,
      french: "Une phrase.",
      coaching: null,
      correction: {},
    }).success,
    false,
  );
});

test("cancelled secondary work cannot publish text into a later turn", async () => {
  const controller = new AbortController();
  const events: VoiceLabReplyEvent[] = [];
  const response = createVoiceLabResponse(provider, speech, {
    details: async () => {
      controller.abort();
      return { french: "De quelle ville viens-tu ?", coaching: null };
    },
  });
  await response({
    ...input,
    signal: controller.signal,
    emit: (event) => events.push(event),
  });
  assert.equal(
    events.some(
      (event) => event.type === "details" || event.type === "response_done",
    ),
    false,
  );
});

test("pause releases the lab queue without waiting for suspended secondary inference", async () => {
  const controller = new AbortController();
  const events: VoiceLabReplyEvent[] = [];
  let started = false;
  let resolveDetails!: (value: { french: string }) => void;
  const response = createVoiceLabResponse(provider, speech, {
    details: async () => {
      started = true;
      return new Promise((resolve) => {
        resolveDetails = resolve;
      });
    },
  });
  const pending = response({
    ...input,
    signal: controller.signal,
    emit: (event) => events.push(event),
  });
  while (!started) await wait(1);
  controller.abort();
  assert.equal(
    await Promise.race([
      pending.then(() => "released"),
      wait(150).then(() => "blocked"),
    ]),
    "released",
  );
  const before = events.length;
  resolveDetails({ french: "Une réponse tardive." });
  await wait(5);
  assert.equal(events.length, before);
  assert.equal(
    events.some((event) => event.type === "response_done"),
    false,
  );
});

test("postprocess includes the reading conversion before the first sound", async () => {
  const events: VoiceLabReplyEvent[] = [];
  const response = createVoiceLabResponse(
    {
      ...provider,
      romanize: async () => {
        await wait(35);
        return ["test"];
      },
    },
    speech,
  );
  await response({ ...input, emit: (event) => events.push(event) });
  const event = events.find((event) => event.type === "metrics");
  assert.ok(event?.type === "metrics");
  assert.ok(event.metrics.postprocess! >= 25);
  assert.ok(event.metrics.first_audio_emit! >= event.metrics.postprocess!);
});

test("accepted correction keeps its original teaching path and has no secondary rewrite", async () => {
  let calls = 0;
  const corrected = {
    ...tutor,
    correction: {
      original: "日本語を好きです。",
      corrected: "日本語が好きです。",
      romaji: "Nihongo ga suki desu.",
      french: "J’aime le japonais.",
      explanation: "Avec suki, utilise ga.",
    },
  };
  const events: VoiceLabReplyEvent[] = [];
  const response = createVoiceLabResponse(
    { ...provider, turn: async () => corrected },
    speech,
    {
      details: async () => {
        calls++;
        return { french: "Une phrase.", coaching: null };
      },
    },
  );
  await response({
    ...input,
    text: corrected.correction.original,
    emit: (event) => events.push(event),
  });
  assert.equal(calls, 0);
  assert.equal(
    events[0]?.type === "tutor" && events[0].tutor.correction?.corrected,
    corrected.correction.corrected,
  );
});

test("display metadata only enriches the matching, uncorrected sentence", () => {
  const details = {
    japanese: tutor.reply.japanese,
    french: "De quelle ville viens-tu ?",
    coaching: null,
  };
  const changed = applyVoiceLabDetails(tutor, details);
  assert.equal(changed?.reply.japanese, tutor.reply.japanese);
  assert.equal(changed?.reply.romaji, tutor.reply.romaji);
  assert.equal(changed?.reply.french, details.french);
  assert.equal(
    applyVoiceLabDetails(tutor, { ...details, japanese: "別の文。" }),
    tutor,
  );
  assert.equal(
    applyPhraseDetails(tutor.reply, { ...details, japanese: "別の文。" }),
    tutor.reply,
  );
});
