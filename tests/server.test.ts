import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp, type TutorProvider } from "../server/app";
import { freeScene } from "../src/data/lessons";
import type { SpeechProvider } from "../server/local-speech";
import { oralResponseSchema } from "../shared/contracts";
const token = "test-personal-token-at-least-16";
const auth = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
test("la révision distingue rappel, erreur, aide et construction non démontrée avant de poursuivre", async () => {
  const target = {
    id: "skill:origin",
    skill: "origin" as const,
    reference: {
      japanese: "フランスから来ました。",
      romaji: "Furansu kara kimashita.",
      french: "Je viens de France.",
    },
    explanation: "Utilise kara pour dire d’où tu viens.",
  };
  let outcome: "correct" | "error" | "not_shown" = "correct",
    checks = 0,
    correction = true;
  const provider: TutorProvider = {
    async transcribe() {
      return "私はフランスから来ました。";
    },
    async assessReview(input) {
      checks++;
      assert.equal(input.target.skill, "origin");
      return {
        outcome,
        feedback: "Essaie une phrase complète pour dire d’où tu viens.",
      };
    },
    async turn(input) {
      return {
        reply: target.reference,
        coaching: null,
        correction: correction
          ? {
              original: input.text,
              corrected: target.reference.japanese,
              romaji: target.reference.romaji,
              french: target.reference.french,
              explanation: target.explanation,
            }
          : null,
        vocabulary: [],
      };
    },
  };
  const spoken: { text: string; language?: string }[] = [];
  const speech: SpeechProvider = {
    async speak(text, language) {
      spoken.push({ text, language });
      return Buffer.alloc(60);
    },
    close() {},
  };
  await withServer(
    provider,
    async (base) => {
      const body = {
        scenario: "meet",
        lessonId: "meet-origin",
        history: [{ role: "assistant", content: "日本語で言ってみましょう。" }],
        text: "私はフランスから来ました。",
        review: { target, assisted: false },
        learner: { support: "supported", weak: ["origin"], stable: [] },
      };
      const post = async (payload: unknown, path = "/api/turn") => {
        const r = await fetch(`${base}${path}`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(payload),
        });
        return { status: r.status, data: await r.json() };
      };
      const correct = await post(body);
      assert.equal(correct.status, 200);
      assert.equal(correct.data.review.outcome, "correct");
      assert.equal(correct.data.correction, null);
      outcome = "not_shown";
      const short = await post({ ...body, text: "はい。" });
      assert.equal(short.data.review.outcome, "not_shown");
      assert.equal(short.data.correction, null);
      assert.equal(short.data.practice, true);
      outcome = "error";
      const wrong = await post({ ...body, text: "フランスを来ました。" });
      assert.equal(wrong.data.review.outcome, "error");
      assert.ok(wrong.data.correction);
      correction = false;
      const disagreement = await post({ ...body, text: "フランスです。" });
      assert.equal(disagreement.data.review.outcome, "not_shown");
      assert.equal(disagreement.data.correction, null);
      const previousChecks = checks;
      const help = await post({ ...body, text: "Je ne sais pas." });
      assert.equal(help.data.review.outcome, "helped");
      assert.equal(checks, previousChecks);
      assert.equal(
        (
          await post({
            ...body,
            review: {
              target: { ...target, skill: "unknown" },
              assisted: false,
            },
          })
        ).status,
        400,
      );
      outcome = "correct";
      const oral = await post(
        {
          ...body,
          text: undefined,
          audio: Buffer.alloc(150).toString("base64"),
          format: "wav",
        },
        "/api/oral-turn",
      );
      assert.equal(oral.status, 200);
      const parsed = oralResponseSchema.parse(oral.data);
      assert.ok(parsed.heard);
      assert.equal(parsed.tutor.review?.outcome, "correct");
      assert.ok(parsed.coachingAudio);
      assert.equal(spoken.at(-1)?.language, "fr");
    },
    speech,
  );
});
test("une demande d’aide orale en français enseigne un modèle et fournit deux langues audio", async () => {
  const synthesized: { text: string; language?: string }[] = [];
  const provider: TutorProvider = {
    async transcribe() {
      return "Je ne sais pas.";
    },
    async turn() {
      throw new Error(
        "Une demande d’aide ne doit pas être corrigée comme une réponse japonaise.",
      );
    },
    async help(input) {
      assert.equal(input.question, "お名前は？");
      assert.equal(input.meaning, "");
      return {
        explanation: "Donne ton prénom, puis ajoute desu.",
        answer: {
          japanese: "アレックスです。",
          romaji: "Arekkusu desu.",
          french: "Je m’appelle Alex.",
        },
      };
    },
  };
  const speech: SpeechProvider = {
    async speak(text, language) {
      synthesized.push({ text, language });
      return Buffer.alloc(60);
    },
    close() {},
  };
  await withServer(
    provider,
    async (base) => {
      const response = await fetch(`${base}/api/oral-turn`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          scenario: "meet",
          history: [{ role: "assistant", content: "お名前は？" }],
          format: "wav",
          audio: Buffer.alloc(150).toString("base64"),
        }),
      });
      assert.equal(response.status, 200);
      const result = oralResponseSchema.parse(await response.json());
      assert.ok(result.heard);
      assert.equal(result.transcript, "Je ne sais pas.");
      assert.equal(result.tutor.correction, null);
      assert.equal(result.tutor.reply.japanese, "アレックスです。");
      assert.ok(result.coachingAudio);
      assert.equal(synthesized[1]?.language, "fr");
      assert.equal(synthesized[1]?.text, result.tutor.coaching);
      const invalid = await fetch(`${base}/api/speech`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ text: "Bonjour", language: "invalid" }),
      });
      assert.equal(invalid.status, 400);
      assert.equal(synthesized.length, 2);
    },
    speech,
  );
});
test("une erreur orale est montrée et lue avant toute nouvelle question, puis la répétition reprend le dialogue", async () => {
  const spoken: string[] = [];
  let repeat = false;
  const provider: TutorProvider = {
    async transcribe() {
      return repeat ? "日本語が好きです。" : "日本語を好きです。";
    },
    async turn(input) {
      return {
        reply: {
          japanese: "どんな映画が好きですか？",
          romaji: "donna eiga ga suki desu ka?",
          french: "Quels films aimes-tu ?",
        },
        correction: input.text.includes("を")
          ? {
              original: input.text,
              corrected: "日本語が好きです。",
              romaji: "nihongo ga suki desu.",
              french: "J’aime le japonais.",
              explanation: "Avec suki, utilise ga pour ce que tu aimes.",
            }
          : null,
        vocabulary: [],
      };
    },
  };
  const speech: SpeechProvider = {
    async speak(text) {
      spoken.push(text);
      return Buffer.alloc(60);
    },
    close() {},
  };
  await withServer(
    provider,
    async (base) => {
      const body = {
        scenario: "free",
        history: [],
        format: "wav",
        audio: Buffer.alloc(150).toString("base64"),
      };
      const post = async (path: string, payload: unknown) => {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(payload),
        });
        assert.equal(response.status, 200);
        return response.json();
      };
      const output = oralResponseSchema.parse(
        await post("/api/oral-turn", body),
      );
      assert.ok(output.heard);
      assert.equal(output.tutor.correction?.corrected, "日本語が好きです。");
      assert.equal(
        spoken[0],
        "日本語が好きです。 もう一度、言ってみましょう。",
      );
      assert.equal(output.tutor.reply.japanese, spoken[0]);
      const typed = await post("/api/turn", {
        scenario: "free",
        history: [],
        text: "日本語を好きです。",
      });
      assert.equal(typed.reply.japanese, spoken[0]);
      repeat = true;
      const next = oralResponseSchema.parse(
        await post("/api/oral-turn", {
          ...body,
          history: [
            { role: "assistant", content: output.tutor.reply.japanese },
          ],
        }),
      );
      assert.ok(next.heard);
      assert.equal(next.tutor.correction, null);
      assert.equal(spoken[1], "Avec suki, utilise ga pour ce que tu aimes.");
      assert.equal(spoken[2], "どんな映画が好きですか？");
      assert.ok(output.coachingAudio);
    },
    speech,
  );
});
async function withServer(
  provider: TutorProvider | undefined,
  run: (base: string) => Promise<void>,
  speech?: SpeechProvider,
) {
  const server: Server = createApp({ token, provider, speech }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
test("une étape déjà enseignée n’est pas réintroduite quand son ancien message sort du contexte récent", async () => {
  const reply = {
    reply: {
      japanese: "もちです。",
      romaji: "Mochi desu.",
      french: "Je m’appelle Mochi.",
    },
    coaching: null,
    correction: null,
    vocabulary: [],
  };
  const provider: TutorProvider = {
    async turn() {
      return reply;
    },
    async transcribe() {
      return "";
    },
  };
  await withServer(provider, async (base) => {
    const post = async (guidedStepDone: boolean, text = "アレックスです。") => {
      const response = await fetch(`${base}/api/turn`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          scenario: "meet",
          lessonId: "meet-name",
          history: [{ role: "assistant", content: "お名前は？" }],
          text,
          guidedStepDone,
        }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.deepEqual(await post(true), reply);
    assert.equal((await post(false)).practice, true);
    assert.deepEqual(await post(false, "はい。"), reply);
  });
});
test("le serveur protège les appels, refuse les origines tierces et ne prétend pas être configuré", async () => {
  await withServer(undefined, async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 401);
    const health = await fetch(`${base}/api/health`, { headers: auth });
    assert.deepEqual(await health.json(), {
      ready: false,
      mode: "unavailable",
      oral: false,
      warming: false,
    });
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.equal(
      (
        await fetch(`${base}/api/health`, {
          headers: { ...auth, Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/turn`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({
            scenario: "free",
            history: [],
            text: "Bonjour",
          }),
        })
      ).status,
      503,
    );
  });
});
test("un tour oral transcrit, répond et synthétise sans validation de texte ; le silence ne déclenche aucune réponse", async () => {
  const operations: string[] = [];
  let heard = true;
  const provider: TutorProvider = {
    async transcribe() {
      operations.push("transcribe");
      return heard ? "ポールです" : "";
    },
    async turn(input) {
      operations.push("turn");
      assert.equal(input.text, "ポールです");
      return {
        reply: freeScene.turns[0]!.tutor,
        correction: null,
        vocabulary: [],
      };
    },
  };
  const speech: SpeechProvider = {
    async speak() {
      operations.push("speech");
      return Buffer.from("RIFF0000WAVEfixture00000000000000000000000000000000");
    },
    close() {},
  };
  await withServer(
    provider,
    async (base) => {
      const post = (body: unknown, headers = auth) =>
        fetch(`${base}/api/oral-turn`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      const body = {
        scenario: "meet",
        history: [],
        audio: Buffer.alloc(150).toString("base64"),
        format: "wav",
      };
      assert.equal(
        (await post(body, { ...auth, Authorization: "Bearer wrong" })).status,
        401,
      );
      assert.equal((await post({ ...body, scenario: "invalid" })).status, 400);
      assert.deepEqual(operations, []);
      const result = await post(body);
      assert.equal(result.status, 200);
      const output = await result.json();
      assert.equal(output.heard, true);
      assert.equal(output.transcript, "ポールです");
      assert.equal(output.format, "wav");
      assert.deepEqual(operations, ["transcribe", "turn", "speech"]);
      heard = false;
      operations.length = 0;
      assert.deepEqual(await (await post(body)).json(), { heard: false });
      assert.deepEqual(operations, ["transcribe"]);
    },
    speech,
  );
});
test("la connexion locale automatique est désactivée par défaut et refuse les origines tierces", async () => {
  await withServer(undefined, async (base) => {
    assert.equal(
      (
        await fetch(`${base}/api/local-session`, {
          method: "POST",
          headers: auth,
        })
      ).status,
      404,
    );
  });
  const server = createApp({
    token,
    localPreview: true,
    mode: "local",
    origins: ["http://localhost:8082"],
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal(
      (await fetch(`${base}/api/local-session`, { method: "POST" })).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/local-session`, {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const response = await fetch(`${base}/api/local-session`, {
      method: "POST",
      headers: { Origin: "http://localhost:8082" },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("la voix locale est protégée et fonctionne sans fournisseur OpenAI", async () => {
  let calls = 0;
  const audio = Buffer.from("RIFF0000WAVEtest");
  const speech: SpeechProvider = {
    async speak(text) {
      calls++;
      assert.equal(text, "こんにちは");
      return audio;
    },
    close() {},
  };
  await withServer(
    undefined,
    async (base) => {
      const post = (body: unknown, headers = auth) =>
        fetch(`${base}/api/speech`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      assert.equal(
        (
          await post(
            { text: "こんにちは" },
            { ...auth, Authorization: "Bearer wrong" },
          )
        ).status,
        401,
      );
      assert.equal((await post({ text: "" })).status, 400);
      assert.equal(calls, 0);
      const response = await post({ text: "こんにちは" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        audio: audio.toString("base64"),
        format: "wav",
      });
      assert.equal(calls, 1);
    },
    speech,
  );
  await withServer(undefined, async (base) => {
    const response = await fetch(`${base}/api/speech`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ text: "こんにちは" }),
    });
    assert.equal(response.status, 503);
  });
});
test("validation avant appel fournisseur ; réponse structurée et audio transcrit", async () => {
  let calls = 0;
  const provider: TutorProvider = {
    async turn() {
      calls++;
      return {
        reply: freeScene.turns[0]!.tutor,
        correction: null,
        vocabulary: [],
      };
    },
    async transcribe() {
      return "こんにちは";
    },
  };
  await withServer(provider, async (base) => {
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
      });
    assert.equal(
      (await post("/api/turn", { scenario: "free", history: [], text: "" }))
        .status,
      400,
    );
    assert.equal(
      (
        await post("/api/turn", {
          scenario: "unknown",
          history: [],
          text: "Hello",
        })
      ).status,
      400,
    );
    assert.equal(
      (await post("/api/transcribe", { audio: "bad", format: "exe" })).status,
      400,
    );
    assert.equal(calls, 0);
    const response = await post("/api/turn", {
      scenario: "free",
      history: [],
      text: "こんにちは",
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.deepEqual(await response.json(), {
      reply: freeScene.turns[0]!.tutor,
      correction: null,
      vocabulary: [],
    });
    assert.deepEqual(
      await (
        await post("/api/transcribe", {
          audio: Buffer.alloc(150).toString("base64"),
          format: "webm",
        })
      ).json(),
      { text: "こんにちは" },
    );
  });
});

test("l’aide est protégée et utilise la question actuelle sans envoyer de réponse à la conversation", async () => {
  let helps = 0;
  const answer = {
    explanation: "Indique ton pays, puis ajoute kara kimashita.",
    answer: {
      japanese: "ベルギーから来ました。",
      romaji: "Berugī kara kimashita.",
      french: "Je viens de Belgique.",
    },
  };
  const provider: TutorProvider = {
    async turn() {
      throw new Error("L’aide ne doit pas jouer le tour de l’élève.");
    },
    async transcribe() {
      throw new Error("L’aide ne doit pas ouvrir le micro.");
    },
    async help(input) {
      helps++;
      assert.equal(input.question, "どこから来ましたか？");
      assert.equal(input.meaning, "Je viens de Belgique");
      assert.deepEqual(input.history, [
        { role: "user", content: "ポールです。" },
        { role: "assistant", content: "どこから来ましたか？" },
      ]);
      return answer;
    },
  };
  await withServer(provider, async (base) => {
    const body = {
      scenario: "meet",
      question: "どこから来ましたか？",
      meaning: "Je viens de Belgique",
      history: [
        { role: "user", content: "ポールです。" },
        { role: "assistant", content: "どこから来ましたか？" },
      ],
    };
    const post = (data: unknown, headers = auth) =>
      fetch(`${base}/api/help`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
    assert.equal(
      (await post(body, { ...auth, Authorization: "Bearer wrong" })).status,
      401,
    );
    assert.equal((await post({ ...body, question: "" })).status, 400);
    assert.equal(
      (await post({ ...body, meaning: "a".repeat(501) })).status,
      400,
    );
    assert.equal(
      (await post({ ...body, history: Array(17).fill(body.history[0]) }))
        .status,
      400,
    );
    assert.equal(helps, 0);
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), answer);
    assert.equal(helps, 1);
  });
});

test("une aide absente ou invalide n’est pas présentée comme une phrase utilisable", async () => {
  const body = {
    scenario: "meet",
    history: [],
    question: "どこから来ましたか？",
  };
  await withServer(undefined, async (base) => {
    assert.equal(
      (
        await fetch(`${base}/api/help`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(body),
        })
      ).status,
      503,
    );
  });
  await withServer(
    {
      async turn() {
        return {
          reply: freeScene.turns[0]!.tutor,
          correction: null,
          vocabulary: [],
        };
      },
      async transcribe() {
        return "";
      },
      async help() {
        return {
          explanation: "Conseil",
          answer: { japanese: "", romaji: "", french: "" },
        };
      },
    },
    async (base) => {
      assert.equal(
        (
          await fetch(`${base}/api/help`, {
            method: "POST",
            headers: auth,
            body: JSON.stringify(body),
          })
        ).status,
        502,
      );
    },
  );
});

test("l’objectif de leçon est validé avant calcul", async () => {
  let calls = 0;
  const provider: TutorProvider = {
    async turn(input) {
      calls++;
      assert.equal(input.lessonId, "meet-origin");
      return {
        reply: freeScene.turns[0]!.tutor,
        correction: null,
        vocabulary: [],
      };
    },
    async transcribe() {
      return "ベルギーから来ました。";
    },
  };
  await withServer(provider, async (base) => {
    const body = {
      scenario: "meet",
      lessonId: "unknown",
      history: [],
      text: "はい",
    };
    assert.equal(
      (
        await fetch(`${base}/api/turn`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(body),
        })
      ).status,
      400,
    );
    assert.equal(calls, 0);
    assert.equal(
      (
        await fetch(`${base}/api/turn`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ ...body, lessonId: "meet-origin" }),
        })
      ).status,
      200,
    );
    assert.equal(calls, 1);
  });
});

test("le tour audio transmet l’objectif au dialogue après transcription", async () => {
  const provider: TutorProvider = {
    async transcribe() {
      return "ベルギーから来ました。";
    },
    async turn(input) {
      assert.equal(input.lessonId, "meet-origin");
      assert.equal(input.text, "ベルギーから来ました。");
      return {
        reply: freeScene.turns[0]!.tutor,
        correction: null,
        vocabulary: [],
      };
    },
  };
  await withServer(
    provider,
    async (base) => {
      const response = await fetch(`${base}/api/oral-turn`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          scenario: "meet",
          lessonId: "meet-origin",
          history: [],
          format: "wav",
          audio: Buffer.alloc(200, 1).toString("base64"),
        }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).heard, true);
    },
    {
      async speak() {
        return Buffer.alloc(100, 1);
      },
      close() {},
    },
  );
});
