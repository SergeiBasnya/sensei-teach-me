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
    assert.deepEqual(await health.json(), { ready: false });
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
