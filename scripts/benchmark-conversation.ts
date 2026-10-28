// Opt-in real local-model benchmark; fixtures are synthesized, never human speech.
import { conversationCases } from "./conversation-cases";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createLocalTutor } from "../server/local-tutor";
import { createLocalSpeech } from "../server/local-speech";
import { createApp } from "../server/app";

async function main() {
  const destination = process.argv[2];
  if (!destination)
    throw new Error(
      "Usage: node --import tsx scripts/benchmark-conversation.ts output.json",
    );
  const sourceHash = createHash("sha256")
    .update(
      [
        "server/app.ts",
        "server/conversation_worker.py",
        "server/local-speech.ts",
        "shared/teaching.ts",
        "shared/conversation-curriculum.ts",
      ]
        .map((path) => readFileSync(path))
        .join("\n"),
    )
    .digest("hex");
  const started = performance.now();
  const provider = createLocalTutor();
  const speech = createLocalSpeech();
  if (!provider || !speech) throw new Error("Local models unavailable");
  const token = randomBytes(32).toString("hex");
  const server = createApp({
    token,
    provider,
    speech,
    isReady: provider.ready,
    mode: "local",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const full = process.argv.includes("--corpus");
  const cases = full
    ? conversationCases.map((item) => ({
        id: item.id,
        path: "turn",
        body: item.body,
      }))
    : [
        {
          id: "origin-fragment",
          path: "turn",
          body: {
            scenario: "meet",
            lessonId: "meet-origin",
            history: [{ role: "assistant", content: "どこから来ましたか？" }],
            text: "フランスです。",
          },
        },
        {
          id: "cafe-change",
          path: "turn",
          body: {
            scenario: "cafe",
            lessonId: "cafe-order",
            history: [
              {
                role: "assistant",
                content: "コーヒーですね。ホットですか、アイスですか？",
              },
            ],
            text: "やっぱりコーヒーじゃなくて、お茶をください。",
          },
        },
        {
          id: "origin-error",
          path: "turn",
          body: {
            scenario: "meet",
            lessonId: "meet-origin",
            history: [{ role: "assistant", content: "どこから来ましたか？" }],
            text: "私はフランスを来ました。",
          },
        },
        {
          id: "repeat",
          path: "turn",
          body: {
            scenario: "meet",
            lessonId: "meet-origin",
            history: [{ role: "assistant", content: "どこから来ましたか？" }],
            text: "もう一度お願いします。",
          },
        },
        {
          id: "oral-origin",
          path: "oral-turn",
          body: {
            scenario: "meet",
            lessonId: "meet-origin",
            history: [{ role: "assistant", content: "どこから来ましたか？" }],
            format: "wav",
            audio: readFileSync("tests/fixtures/origin-synthetic.wav").toString(
              "base64",
            ),
          },
        },
      ];
  const results: unknown[] = [];
  try {
    while (!provider.ready()) {
      if (performance.now() - started > 120_000)
        throw new Error("Model startup timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    const readyMs = Math.round(performance.now() - started);
    for (let round = 0; round < (full ? 1 : 3); round++)
      for (const item of cases) {
        const begin = performance.now();
        const response = await fetch(
          `http://127.0.0.1:${address.port}/api/${item.path}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(item.body),
          },
        );
        const headerMs = performance.now() - begin;
        const bytes = await response.text();
        const data = JSON.parse(bytes);
        const totalMs = performance.now() - begin;
        const tutor = data.tutor || data;
        const result = {
          id: item.id,
          round,
          firstInference: round === 0 && item.id === cases[0]!.id,
          status: response.status,
          requestMs: Math.round(totalMs),
          bodyTransferParseMs: Math.round(totalMs - headerMs),
          responseBytes: Buffer.byteLength(bytes),
          timing: response.headers.get("server-timing"),
          transcript: data.transcript,
          reply: tutor.reply,
          coaching: tutor.coaching,
          correction: tutor.correction,
          assisted: tutor.assisted,
          review: tutor.review,
          heard: data.heard,
          coachingUnavailable: data.coachingUnavailable,
          error: data.error,
        };
        results.push(result);
        process.stdout.write(
          `${item.id} round=${round} status=${response.status} ms=${Math.round(totalMs)}\n`,
        );
        mkdirSync(destination.slice(0, destination.lastIndexOf("/")) || ".", {
          recursive: true,
        });
        writeFileSync(
          destination,
          JSON.stringify(
            {
              date: new Date().toISOString(),
              fixture: "Synthetic VOICEVOX audio, no human or phone test",
              readyMs,
              rounds: full ? 1 : 3,
              sourceHash,
              results,
            },
            null,
            2,
          ) + "\n",
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
