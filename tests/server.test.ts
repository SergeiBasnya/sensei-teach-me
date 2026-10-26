import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp, type TutorProvider } from "../server/app";
import { freeScene } from "../src/data/lessons";
import type { SpeechProvider } from "../server/local-speech";
const token = "test-personal-token-at-least-16";
const auth = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
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
