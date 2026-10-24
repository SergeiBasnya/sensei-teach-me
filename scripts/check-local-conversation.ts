import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "../server/app";
import { createLocalTutor } from "../server/local-tutor";
import { createLocalSpeech } from "../server/local-speech";
import { oralResponseSchema } from "../shared/contracts";

async function main() {
  const tutor = createLocalTutor();
  const speech = createLocalSpeech();
  assert.ok(
    tutor && speech,
    "Installer les trois moteurs locaux avant cette vérification.",
  );
  const token = "local-integration-check-token-32";
  const server = createApp({
    provider: tutor,
    speech,
    token,
    mode: "local",
    isReady: tutor.ready,
  }).listen(0, "127.0.0.1");
  try {
    const started = Date.now();
    while (!tutor.ready()) {
      if (Date.now() - started > 80_000)
        throw new Error("Démarrage local trop long.");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const learner = await speech.speak("ポールです。フランス人です。");
    const begin = Date.now();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/oral-turn`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenario: "meet",
          history: [{ role: "assistant", content: "こんにちは！お名前は？" }],
          audio: learner.toString("base64"),
          format: "wav",
        }),
      },
    );
    assert.equal(response.status, 200);
    const result = oralResponseSchema.parse(await response.json());
    assert.ok(result.heard);
    assert.match(result.transcript, /ポール|フランス/);
    assert.match(result.tutor.reply.japanese, /[？?]/);
    assert.doesNotMatch(result.tutor.reply.romaji, /[\u3040-\u9fff]/);
    const audio = Buffer.from(result.audio, "base64");
    assert.equal(audio.subarray(0, 4).toString(), "RIFF");
    assert.equal(audio.subarray(8, 12).toString(), "WAVE");
    const secondAudio = await speech.speak("はい、日本語が好きです。");
    const second = await fetch(
      `http://127.0.0.1:${address.port}/api/oral-turn`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenario: "meet",
          history: [
            { role: "assistant", content: "こんにちは！お名前は？" },
            { role: "user", content: result.transcript },
            { role: "assistant", content: result.tutor.reply.japanese },
          ],
          audio: secondAudio.toString("base64"),
          format: "wav",
        }),
      },
    );
    assert.equal(
      second.status,
      200,
      "Le deuxième tour doit fonctionner avec l’historique réel.",
    );
    const continuation = oralResponseSchema.parse(await second.json());
    assert.ok(continuation.heard);
    assert.match(continuation.transcript, /日本語/);
    assert.ok(continuation.tutor.reply.japanese.length > 0);
    mkdirSync("output/audio", { recursive: true });
    writeFileSync("output/audio/conversation-reponse.wav", audio);
    writeFileSync("output/audio/conversation-eleve.wav", learner);
    writeFileSync(
      "output/audio/conversation-check.json",
      JSON.stringify(
        {
          transcript: result.transcript,
          reply: result.tutor.reply,
          continuation: continuation.tutor.reply,
          audioBytes: audio.length,
          milliseconds: Date.now() - begin,
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      JSON.stringify({
        transcript: result.transcript,
        reply: result.tutor.reply,
        continuation: continuation.tutor.reply,
        audioBytes: audio.length,
        milliseconds: Date.now() - begin,
      }) + "\n",
    );
  } finally {
    tutor.close();
    speech.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
void main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
