import test from "node:test";
import assert from "node:assert/strict";
import { createApp, type TutorProvider } from "../server/app";
import type { SpeechProvider } from "../server/local-speech";
import { initialProgress, type Progress } from "../src/lib/progress";
import {
  applyStoredReadings,
  storedReadingTexts,
} from "../src/lib/reading-refresh";
import { rememberLesson } from "../shared/learning-memory";
const phrase = {
  japanese: "どこから来ましたか？",
  romaji: "dokokara kima shitaka",
  french: "D’où viens-tu ?",
};
const reply = { reply: phrase, correction: null, vocabulary: [] };
async function app(
  provider: TutorProvider,
  speech: SpeechProvider | undefined,
  run: (
    post: (
      path: string,
      body: unknown,
      authorized?: boolean,
    ) => Promise<Response>,
  ) => Promise<void>,
) {
  const server = createApp({
    token: "local-test-access-token",
    provider,
    speech,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run((path, body, authorized = true) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authorized
            ? { Authorization: "Bearer local-test-access-token" }
            : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
test("lecture locale protégée et bornée, sans génération ni synthèse", async () => {
  let calls = 0;
  await app(
    {
      async turn() {
        throw new Error("No model for readings");
      },
      async transcribe() {
        throw new Error("No audio for readings");
      },
      async romanize(texts) {
        calls++;
        return texts.map(() => "Doko kara kimashita ka?");
      },
    },
    undefined,
    async (post) => {
      assert.equal(
        (await post("/api/readings", { texts: [phrase.japanese] }, false))
          .status,
        401,
      );
      for (const texts of [Array(51).fill("a"), [" "], ["あ".repeat(501)]])
        assert.equal((await post("/api/readings", { texts })).status, 400);
      assert.equal(calls, 0);
      const result = await post("/api/readings", { texts: [phrase.japanese] });
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), {
        readings: ["Doko kara kimashita ka?"],
      });
    },
  );
});
test("le même normaliseur formate les fournisseurs et le son reçoit toujours le japonais", async () => {
  let spoken = "";
  await app(
    {
      async turn() {
        return reply;
      },
      async transcribe() {
        return "フランスです。";
      },
    },
    {
      async romanize(texts) {
        assert.deepEqual(texts, [phrase.japanese]);
        return ["Doko kara kimashita ka?"];
      },
      async speak(text) {
        spoken = text;
        return Buffer.alloc(60);
      },
      close() {},
    },
    async (post) => {
      const typed = await (
        await post("/api/turn", {
          scenario: "meet",
          history: [],
          text: "フランスです。",
        })
      ).json();
      const oral = await (
        await post("/api/oral-turn", {
          scenario: "meet",
          history: [],
          format: "wav",
          audio: Buffer.alloc(150).toString("base64"),
        })
      ).json();
      assert.equal(typed.reply.romaji, "Doko kara kimashita ka?");
      assert.equal(oral.tutor.reply.romaji, typed.reply.romaji);
      assert.equal(spoken, phrase.japanese);
      assert.equal(reply.reply.romaji, "dokokara kima shitaka");
    },
  );
});
test("une lecture indisponible ne jette pas le japonais et ne prétend pas fournir du romaji fiable", async () => {
  await app(
    {
      async turn() {
        return reply;
      },
      async transcribe() {
        return "フランスです。";
      },
      async romanize() {
        throw new Error("unavailable");
      },
    },
    {
      async speak() {
        return Buffer.alloc(60);
      },
      close() {},
    },
    async (post) => {
      const result = await (
        await post("/api/oral-turn", {
          scenario: "meet",
          history: [],
          format: "wav",
          audio: Buffer.alloc(150).toString("base64"),
        })
      ).json();
      assert.equal(result.heard, true);
      assert.equal(result.tutor.reply.japanese, phrase.japanese);
      assert.equal(result.tutor.reply.romaji, "…");
    },
  );
});
test("rafraîchir une ancienne lecture conserve dates, erreurs, rappels et vocabulaire personnel", () => {
  const progress: Progress = {
    ...initialProgress,
    words: [{ ...phrase, id: "saved-word", learned: true }],
    learning: rememberLesson(
      initialProgress.learning,
      "meet-origin",
      phrase,
      "meet",
      "2026-10-01T00:00:00.000Z",
    ),
  };
  const updated = applyStoredReadings(
    progress,
    new Map([[phrase.japanese, "Doko kara kimashita ka?"]]),
  );
  assert.equal(updated.words[0]!.romaji, "Doko kara kimashita ka?");
  assert.equal(
    updated.learning.items[0]!.reference.romaji,
    "Doko kara kimashita ka?",
  );
  assert.deepEqual(
    { ...updated.learning.items[0], reference: undefined },
    { ...progress.learning.items[0], reference: undefined },
  );
  assert.equal(updated.words[0]!.id, "saved-word");
  assert.equal(updated.words[0]!.learned, true);
  assert.deepEqual(updated.sessions, progress.sessions);
  assert.deepEqual(storedReadingTexts(updated), [phrase.japanese]);
  assert.equal(applyStoredReadings(updated, new Map()), updated);
});
