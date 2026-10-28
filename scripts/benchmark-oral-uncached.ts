// Explicit local experiment: different answers, audio cache disabled in this process only.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createLocalTutor } from "../server/local-tutor";
import { createLocalSpeech } from "../server/local-speech";
import { createApp } from "../server/app";

const cases = [
  {
    id: "identity",
    scenario: "meet",
    lessonId: "meet-name",
    question: "お名前は？",
    file: "cb0412a327921b1a150b.wav",
  },
  {
    id: "origin",
    scenario: "meet",
    lessonId: "meet-origin",
    question: "どこから来ましたか？",
    file: "109e155eca21856c868a.wav",
  },
  {
    id: "likes",
    scenario: "meet",
    lessonId: "meet-likes",
    question: "日本語は好きですか？",
    file: "cdbbfef81b23fcb88885.wav",
  },
  {
    id: "order",
    scenario: "cafe",
    lessonId: "cafe-order",
    question: "何にしますか？",
    file: "fc48f4733aae10f420d6.wav",
  },
  {
    id: "temperature",
    scenario: "cafe",
    lessonId: "cafe-choice",
    question: "ホットですか、アイスですか？",
    file: "a39332e0aafc35578065.wav",
  },
  {
    id: "destination",
    scenario: "station",
    lessonId: "station-destination",
    question: "どちらまでですか？",
    file: "2d738f422a192c578a24.wav",
  },
];
async function main() {
  const destination = process.argv[2];
  if (!destination) throw new Error("Output path required");
  const started = performance.now(),
    provider = createLocalTutor(),
    speech = createLocalSpeech({ cacheAudio: false });
  if (!provider || !speech) throw new Error("Local engines required");
  const sourceHash = createHash("sha256")
    .update(
      [
        "server/app.ts",
        "server/conversation_worker.py",
        "server/local-speech.ts",
        "server/voice_worker.py",
        "server/pedagogic_romaji.py",
        "server/linguistic_support.py",
        "server/conversation_context.py",
      ]
        .map((path) => readFileSync(path))
        .join("\n"),
    )
    .digest("hex");
  const token = randomBytes(32).toString("hex");
  const server = createApp({
    token,
    provider,
    speech,
    mode: "local",
    isReady: provider.ready,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Address unavailable");
  const results: unknown[] = [];
  try {
    while (!provider.ready()) {
      if (performance.now() - started > 120_000)
        throw new Error("Startup timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    const readyMs = Math.round(performance.now() - started);
    for (let round = 0; round < 2; round++)
      for (const item of cases) {
        const body = {
          scenario: item.scenario,
          lessonId: item.lessonId,
          history: [{ role: "assistant", content: item.question }],
          format: "wav",
          audio: readFileSync(`assets/speech/${item.file}`).toString("base64"),
        };
        const begin = performance.now();
        const response = await fetch(
          `http://127.0.0.1:${address.port}/api/oral-turn`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          },
        );
        const bytes = await response.text();
        const data = JSON.parse(bytes);
        const ms = Math.round(performance.now() - begin);
        results.push({
          id: item.id,
          round,
          firstInference: round === 0 && item.id === "identity",
          status: response.status,
          requestMs: ms,
          responseBytes: Buffer.byteLength(bytes),
          timing: response.headers.get("server-timing"),
          heard: data.heard,
          reason: data.reason,
          transcript: data.transcript,
          tutor: data.tutor,
          coachingUnavailable: data.coachingUnavailable,
        });
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(
          destination,
          JSON.stringify(
            {
              date: new Date().toISOString(),
              sourceHash,
              readyMs,
              audioCache: false,
              fixture:
                "Six distinct synthetic VOICEVOX recordings, no human or physical phone",
              rounds: 2,
              results,
            },
            null,
            2,
          ) + "\n",
        );
        process.stdout.write(
          `${item.id} round=${round} status=${response.status} ms=${ms}\n`,
        );
      }
  } finally {
    provider.close();
    speech.close();
    server.close();
  }
}
void main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
