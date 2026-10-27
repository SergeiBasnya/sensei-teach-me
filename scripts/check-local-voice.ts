import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { createLocalSpeech } from "../server/local-speech";
import { speechEnergyFromWav } from "../src/lib/speech-energy";
async function main() {
  const speech = createLocalSpeech();
  if (!speech)
    throw new Error("Installe le moteur local avant npm run voice:check.");
  const token = "local-voice-check-personal-token";
  const server = createApp({ token, speech }).listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    for (const [language, text] of [
      ["ja", "こんにちは！私はもちです。お名前は？"],
      ["fr", "Bonjour ! Prends ton temps. Je peux te donner un indice."],
    ] as const) {
      const response: Response = await fetch(
        `http://127.0.0.1:${address.port}/api/speech`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, language }),
        },
      );
      assert.equal(response.status, 200);
      const result: unknown = await response.json();
      assert.ok(
        result &&
          typeof result === "object" &&
          "audio" in result &&
          typeof result.audio === "string",
      );
      const wav = Buffer.from(result.audio, "base64");
      assert.equal(wav.subarray(0, 4).toString(), "RIFF");
      assert.equal(wav.subarray(8, 12).toString(), "WAVE");
      assert.ok(wav.length > 10_000);
      assert.ok(
        speechEnergyFromWav(result.audio)?.levels.some((level) => level > 0),
      );
      process.stdout.write(
        `${language === "fr" ? "Vivienne en ligne" : "VOICEVOX local"} : synthèse réelle, WAV et énergie du visage validés (${wav.length} octets), sans OpenAI.\n`,
      );
    }
  } finally {
    speech.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
void main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
