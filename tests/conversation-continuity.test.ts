import test from "node:test";
import assert from "node:assert/strict";
import { createApp, type TutorProvider } from "../server/app";
import { type SpeechProvider } from "../server/local-speech";
import { oralResponseSchema } from "../shared/contracts";
import { assistanceIntent } from "../shared/teaching";
import { readTutor } from "../src/lib/tutor-playback";
import {
  beginOralMetrics,
  sentOralMetrics,
  playbackOralMetrics,
  finishOralMetrics,
  oralMetricsSnapshot,
  parseServerTiming,
} from "../src/lib/oral-metrics";

const reply = {
  reply: {
    japanese: "お茶ですね。",
    romaji: "Ocha desu ne.",
    french: "Du thé, d’accord.",
  },
  coaching: "Tu peux choisir la température.",
  correction: null,
  vocabulary: [],
};
const body = {
  scenario: "cafe",
  lessonId: "cafe-order",
  history: [],
  audio: Buffer.alloc(150).toString("base64"),
  format: "wav",
};
const wav = Buffer.from("RIFF0000WAVE" + "a".repeat(64));
async function withApp(
  provider: TutorProvider,
  speech: SpeechProvider,
  run: (
    post: (path: string, body: unknown) => Promise<Response>,
  ) => Promise<void>,
) {
  const token = "test-only-personal-token";
  const server = createApp({ token, provider, speech }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run((path, body) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
test("une panne française conserve le tour japonais ; les synthèses sont lancées sans dépendance", async () => {
  let japaneseDone = false;
  await withApp(
    {
      async transcribe() {
        return "お茶をください。";
      },
      async turn() {
        return reply;
      },
    },
    {
      async speak(_text, language) {
        if (language === "fr") {
          assert.equal(japaneseDone, false);
          throw new Error("private engine diagnostics");
        }
        japaneseDone = true;
        return wav;
      },
      close() {},
    },
    async (post) => {
      const response = await post("/api/oral-turn", body);
      assert.equal(response.status, 200);
      const result = oralResponseSchema.parse(await response.json());
      assert.ok(result.heard);
      assert.equal(result.audio, wav.toString("base64"));
      assert.equal(result.coachingUnavailable, true);
      assert.equal(result.tutor.coaching, reply.coaching);
      assert.equal(JSON.stringify(result).includes("private engine"), false);
      assert.ok(
        parseServerTiming(response.headers.get("server-timing")).asr !==
          undefined,
      );
    },
  );
});
test("une voix française bloquée est bornée et ne jette pas le japonais", async () => {
  await withApp(
    {
      async transcribe() {
        return "お茶をください。";
      },
      async turn() {
        return reply;
      },
    },
    {
      async speak(_text, language) {
        return language === "fr" ? new Promise<Buffer>(() => {}) : wav;
      },
      close() {},
    },
    async (post) => {
      const started = performance.now();
      const response = await post("/api/oral-turn", body);
      const result = await response.json();
      assert.equal(result.coachingUnavailable, true);
      assert.equal(result.heard, true);
      assert.ok(performance.now() - started < 4500);
    },
  );
});
test("une transcription incertaine ne déclenche ni correction, ni révision, ni synthèse", async () => {
  await withApp(
    {
      async transcribe() {
        throw new Error("must use metadata");
      },
      async transcribeDetailed() {
        return { text: "私はフランスを来ました。", uncertain: true };
      },
      async turn() {
        throw new Error("must not grade uncertain audio");
      },
    },
    {
      async speak() {
        throw new Error("must not synthesize");
      },
      close() {},
    },
    async (post) => {
      const response = await post("/api/oral-turn", body);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        heard: false,
        reason: "uncertain",
      });
    },
  );
});
test("la question répétée ne révèle pas une réponse de révision et ne passe pas au contrôle des acquis", async () => {
  await withApp(
    {
      async transcribe() {
        return "";
      },
      async turn() {
        throw new Error("must not generate");
      },
    },
    {
      async speak() {
        return wav;
      },
      close() {},
    },
    async (post) => {
      const response = await post("/api/turn", {
        scenario: "meet",
        lessonId: "meet-origin",
        history: [
          {
            role: "assistant",
            content: "Pour parler de ton origine.\nどこから来ましたか？",
          },
        ],
        text: "もう一度お願いします。",
      });
      const result = await response.json();
      assert.equal(result.reply.japanese, "どこから来ましたか？");
      assert.equal(result.correction, null);
      assert.equal(result.practice, undefined);
      assert.equal(result.review, undefined);
    },
  );
});
test("répéter, traduire ou expliquer la question ne demande pas une réponse modèle", () => {
  for (const text of [
    "Répète s’il te plaît",
    "もう一度お願いします",
    "plus lentement",
  ])
    assert.deepEqual(assistanceIntent(text), {
      kind: "question",
      action: "repeat",
    });
  for (const text of [
    "Ça veut dire quoi ?",
    "Traduis la question",
    "En français ?",
  ])
    assert.deepEqual(assistanceIntent(text), {
      kind: "question",
      action: "translate",
    });
  assert.deepEqual(assistanceIntent("Explique cette phrase"), {
    kind: "question",
    action: "explain",
  });
  assert.deepEqual(assistanceIntent("Comment on dit : j’habite à Lyon ?"), {
    kind: "answer",
    meaning: "j’habite à Lyon",
  });
});
test("le lecteur saute le français indisponible sans le redemander et respecte une pause", async () => {
  const operations: string[] = [];
  let active = true;
  const reader = {
    async speakFrench() {
      operations.push("fr");
      return false;
    },
    async speakJapanese() {
      operations.push("ja");
      return true;
    },
    async playJapaneseAudio() {
      operations.push("wav");
      return true;
    },
  };
  assert.equal(
    await readTutor(reply, reader, () => active, {
      japanese: "audio",
      coachingUnavailable: true,
    }),
    true,
  );
  assert.deepEqual(operations, ["wav"]);
  operations.length = 0;
  assert.equal(
    await readTutor(
      reply,
      {
        ...reader,
        async speakFrench() {
          active = false;
          throw new Error("interrupted");
        },
      },
      () => active,
    ),
    false,
  );
  assert.deepEqual(operations, []);
});
test("les mesures attendent le vrai démarrage lecteur et ne contiennent aucune conversation", () => {
  beginOralMetrics(100);
  sentOralMetrics(1800, 3100);
  playbackOralMetrics(4500);
  playbackOralMetrics(4600);
  finishOralMetrics(true, 6000);
  const value = oralMetricsSnapshot().at(-1)!;
  assert.equal(value.recordingMs, 3000);
  assert.equal(value.firstPlaybackMs, 1400);
  assert.equal(value.playbackMs, 1500);
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      "completed",
      "firstPlaybackMs",
      "playbackMs",
      "recordingMs",
      "silenceTailMs",
    ].sort(),
  );
  for (let i = 0; i < 35; i++) {
    beginOralMetrics(i);
    finishOralMetrics(false, i + 1);
  }
  assert.equal(oralMetricsSnapshot().length, 30);
  assert.deepEqual(
    parseServerTiming("asr;dur=30, transcription-secret;dur=-3"),
    { asr: 30 },
  );
});

test("les variantes de traduction gardent l’intention de l’élève", () => {
  for (const text of [
    "Traduis-moi ce que tu viens de dire",
    "Traduis-moi ta dernière phrase",
    "Pourquoi tu utilises kara ?",
  ])
    assert.equal(assistanceIntent(text)?.kind, "question");
  assert.deepEqual(assistanceIntent("Traduis-moi : j’habite à Lyon"), {
    kind: "answer",
    meaning: "j’habite à Lyon",
  });
});
test("une répétition en révision conserve sa consigne sans montrer le modèle", async () => {
  const target = {
    id: "skill:origin",
    skill: "origin",
    reference: {
      japanese: "フランスから来ました。",
      romaji: "Furansu kara kimashita.",
      french: "Je viens de France.",
    },
    explanation: "Utilise kara après le pays.",
  };
  await withApp(
    {
      async transcribe() {
        return "";
      },
      async turn() {
        throw new Error("must not grade");
      },
      async question() {
        throw new Error("must repeat existing task");
      },
    },
    {
      async speak() {
        return wav;
      },
      close() {},
    },
    async (post) => {
      const response = await post("/api/turn", {
        scenario: "meet",
        history: [
          {
            role: "assistant",
            content: "Dis que tu viens de France.\n日本語で言ってみましょう。",
          },
        ],
        text: "Répète",
        review: { target, assisted: false },
      });
      const result = await response.json();
      assert.equal(result.coaching, "Dis que tu viens de France.");
      assert.equal(result.reply.japanese, "日本語で言ってみましょう。");
      assert.equal(result.review, undefined);
      assert.equal(JSON.stringify(result).includes("フランスから"), false);
    },
  );
});
test("une explication conserve la demande précise et porte le marqueur d’aide", async () => {
  await withApp(
    {
      async transcribe() {
        return "";
      },
      async turn() {
        throw new Error("must not run dialogue");
      },
      async question(input) {
        assert.equal(input.request, "Explique-moi le mot aisu");
        return { ...reply, assisted: true };
      },
    },
    {
      async speak() {
        return wav;
      },
      close() {},
    },
    async (post) => {
      const response = await post("/api/turn", {
        scenario: "cafe",
        history: [
          { role: "assistant", content: "ホットですか、アイスですか？" },
        ],
        text: "Explique-moi le mot aisu",
      });
      assert.equal((await response.json()).assisted, true);
    },
  );
});

test("l’aide aux choix enseigne les options sans supprimer une autre explication", async () => {
  const generated = {
    ...reply,
    reply: {
      japanese: "お茶ですね。ホットですか、アイスですか？",
      romaji: "Ocha desu ne. Hotto desu ka, aisu desu ka?",
      french: "Du thé, d’accord. Chaud ou glacé ?",
    },
    coaching: "Ocha veut dire thé.",
  };
  await withApp(
    {
      async transcribe() {
        return "";
      },
      async turn() {
        return generated;
      },
    },
    {
      async speak() {
        return wav;
      },
      close() {},
    },
    async (post) => {
      const body = {
        scenario: "cafe",
        lessonId: "cafe-order",
        history: [],
        text: "お茶をください。",
      };
      const first = await (await post("/api/turn", body)).json();
      assert.deepEqual(first.reply, generated.reply);
      assert.match(first.coaching, /hotto de onegaishimasu/);
      assert.match(first.coaching, /aisu de onegaishimasu/);
      const next = await (
        await post("/api/turn", {
          ...body,
          history: [
            {
              role: "assistant",
              content: first.coaching + "\n" + first.reply.japanese,
            },
          ],
        })
      ).json();
      assert.equal(next.coaching, generated.coaching);
    },
  );
});
