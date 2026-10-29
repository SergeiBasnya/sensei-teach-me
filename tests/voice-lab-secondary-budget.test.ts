import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import { pcmWav } from "../server/voice-lab-samples";
import type { VoiceLabReplyEvent } from "../shared/voice-lab";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

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
const firstWav = pcmWav(Buffer.alloc(3200)); // 100 ms at 16 kHz mono PCM16.
const secondWav = pcmWav(Buffer.alloc(32000)); // Another 1000 ms.
const input = {
  text: "フランスです。",
  turn: 1,
  language: "ja" as const,
  scenario: "meet" as const,
  history: [],
};

test("the first WAV duration cannot expire French while a later Japanese synthesis is pending", async () => {
  const controller = new AbortController();
  const secondStarted = deferred<void>();
  const second = deferred<Buffer>();
  const french = deferred<{ french: string; coaching: null }>();
  const events: VoiceLabReplyEvent[] = [];
  let signal!: AbortSignal;
  let calls = 0;
  const response = createVoiceLabResponse(
    provider,
    {
      async speak() {
        if (++calls === 1) return firstWav;
        secondStarted.resolve();
        return second.promise;
      },
      close() {},
    },
    {
      details: (request) => {
        signal = request.signal;
        return french.promise;
      },
    },
  );
  const pending = response({
    ...input,
    signal: controller.signal,
    emit: (event) => events.push(event),
  });
  try {
    await secondStarted.promise;
    await wait(180); // Beyond WAV 1, well below the absolute 2500 ms ceiling.
    assert.equal(
      signal.aborted,
      false,
      "the uncompleted total Japanese duration must not be reduced to WAV 1",
    );
    assert.equal(
      events.some((event) => event.type === "response_done"),
      false,
      "remaining Japanese synthesis is still required",
    );
    second.resolve(secondWav);
    await pending;
    assert.equal(
      events.filter((event) => event.type === "response_done").length,
      1,
      "audio completion must not await French",
    );
    assert.equal(signal.aborted, false);
    french.resolve({ french: "De quelle ville viens-tu ?", coaching: null });
    await wait(1);
    const details = events.find((event) => event.type === "details");
    assert.ok(details?.type === "details");
    assert.equal(details.japanese, tutor.reply.japanese);
    assert.equal(details.french, "De quelle ville viens-tu ?");
  } finally {
    french.resolve({ french: "De quelle ville viens-tu ?", coaching: null });
    second.resolve(secondWav);
    await pending;
    controller.abort();
  }
});

test("parent cancellation still preempts French during a suspended later synthesis", async () => {
  const controller = new AbortController();
  const secondStarted = deferred<void>();
  const second = deferred<Buffer>();
  const french = deferred<{ french: string }>();
  const events: VoiceLabReplyEvent[] = [];
  let signal!: AbortSignal;
  let calls = 0;
  const response = createVoiceLabResponse(
    provider,
    {
      async speak() {
        if (++calls === 1) return firstWav;
        secondStarted.resolve();
        return second.promise;
      },
      close() {},
    },
    {
      details: (request) => {
        signal = request.signal;
        signal.addEventListener(
          "abort",
          () => french.reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
        return french.promise;
      },
    },
  );
  const pending = response({
    ...input,
    signal: controller.signal,
    emit: (event) => events.push(event),
  });
  try {
    await secondStarted.promise;
    controller.abort();
    assert.equal(signal.aborted, true);
    second.resolve(secondWav);
    await pending;
    await wait(1);
    assert.equal(events.filter((event) => event.type === "audio").length, 1);
    assert.equal(
      events.some(
        (event) => event.type === "details" || event.type === "response_done",
      ),
      false,
    );
  } finally {
    second.resolve(secondWav);
    french.resolve({ french: "Une traduction tardive." });
    await pending;
    controller.abort();
  }
});
