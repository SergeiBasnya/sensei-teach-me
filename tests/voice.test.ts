import test from "node:test";
import assert from "node:assert/strict";
import { selectJapaneseVoice } from "../src/lib/voice-selection";
import { speechRequestSchema } from "../shared/contracts";

test("une voix française par défaut ne remplace jamais une voix japonaise absente", () => {
  assert.equal(
    selectJapaneseVoice([
      {
        identifier: "fr",
        language: "fr-FR",
        name: "French Premium",
        quality: "Enhanced",
      },
    ]),
    undefined,
  );
});
test("la lecture sélectionne explicitement une voix japonaise de qualité supérieure", () => {
  const regular = {
    identifier: "ja-basic",
    language: "ja-JP",
    name: "Japanese",
    quality: "Default",
  };
  const enhanced = {
    ...regular,
    identifier: "ja-enhanced",
    quality: "Enhanced",
  };
  assert.equal(
    selectJapaneseVoice([regular, enhanced])?.identifier,
    "ja-enhanced",
  );
  assert.equal(
    selectJapaneseVoice([{ ...regular, language: "ja_JP" }])?.identifier,
    "ja-basic",
  );
});
test("les requêtes de synthèse bornent le texte sans le réécrire", () => {
  assert.deepEqual(
    speechRequestSchema.parse({ text: "こんにちは！私はもちです。お名前は？" }),
    { text: "こんにちは！私はもちです。お名前は？" },
  );
  assert.equal(speechRequestSchema.safeParse({ text: " " }).success, false);
  assert.equal(
    speechRequestSchema.safeParse({ text: "あ".repeat(501) }).success,
    false,
  );
});
