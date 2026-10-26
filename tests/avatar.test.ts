import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { speechEnergyFromWav, mouthLevelAt } from "../src/lib/speech-energy";
import {
  avatarFrame,
  conversationMood,
  type AvatarMood,
} from "../src/lib/avatar-state";
import { recordedEnergy } from "../src/data/recorded-energy";

function wav() {
  const rate = 8000,
    samples = 8000;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate;
    const volume = time >= 0.24 && time < 0.48 ? 0.3 : time >= 0.72 ? 0.8 : 0;
    data.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 880) * volume * 30000),
      44 + i * 2,
    );
  }
  return data;
}
test("la bouche suit les silences internes du WAV, son intensité et sa fin", () => {
  const energy = speechEnergyFromWav(wav().toString("base64"));
  assert.ok(energy);
  assert.equal(energy.duration, 1);
  assert.equal(mouthLevelAt(energy, 0.1), 0);
  assert.ok(mouthLevelAt(energy, 0.32) > 0);
  assert.equal(mouthLevelAt(energy, 0.6), 0);
  assert.ok(mouthLevelAt(energy, 0.9) > mouthLevelAt(energy, 0.32));
  assert.equal(mouthLevelAt(energy, 1.2), 0);
  assert.equal(mouthLevelAt(energy, -1), 0);
});
test("un WAV inconnu ou tronqué ne produit pas de faux niveau sonore", () => {
  assert.equal(speechEnergyFromWav("AAAA"), null);
  const wrong = wav();
  wrong.writeUInt16LE(32, 34);
  assert.equal(speechEnergyFromWav(wrong.toString("base64")), null);
  const broken = wav();
  broken.writeUInt32LE(0xffffffff, 40);
  assert.equal(speechEnergyFromWav(broken.toString("base64")), null);
});
test("préparer une voix ou mettre en pause garde la bouche fermée ; écouter et réfléchir restent distincts", () => {
  const preparing = conversationMood("speaking", true);
  assert.notEqual(preparing, "speaking");
  assert.equal(
    avatarFrame(preparing, 3, false),
    avatarFrame(preparing, 0, false),
  );
  const stopped = conversationMood("idle", false);
  assert.equal(avatarFrame(stopped, 3, false), avatarFrame("idle", 0, false));
  assert.notEqual(
    avatarFrame("listening", 0, false),
    avatarFrame("thinking", 0, false),
  );
  for (const mood of [
    "idle",
    "listening",
    "thinking",
    "speaking",
    "happy",
  ] as AvatarMood[])
    for (const level of [0, 1, 2, 3])
      for (const blink of [false, true]) {
        const frame = avatarFrame(mood, level, blink);
        assert.ok(frame >= 0 && frame < 8);
      }
});
test("les 25 phrases embarquées ont leurs enveloppes, sans acquisition ni appel réseau", () => {
  const manifest = JSON.parse(
    readFileSync("assets/speech/manifest.json", "utf8"),
  ) as { phrases: Record<string, string> };
  assert.deepEqual(
    Object.keys(recordedEnergy).sort(),
    Object.keys(manifest.phrases).sort(),
  );
  for (const energy of Object.values(recordedEnergy)) {
    assert.ok(energy.duration > 0);
    assert.ok(energy.levels.some((level) => level > 0));
    assert.ok(energy.levels.every((level) => level >= 0 && level <= 1));
    assert.equal(mouthLevelAt(energy, energy.duration), 0);
  }
});
