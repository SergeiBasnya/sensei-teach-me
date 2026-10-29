import test from "node:test";
import assert from "node:assert/strict";
import { wavDurationMs } from "../server/voice-lab-audio";
import { pcmWav } from "../server/voice-lab-samples";

test("WAV estimate follows encoded sample duration and refuses malformed sizes", () => {
  const wave = pcmWav(Buffer.alloc(16_000 * 2));
  assert.equal(wavDurationMs(wave), 1000);
  assert.equal(wavDurationMs(wave.subarray(0, wave.length - 2)), undefined);
  const invalid = Buffer.from(wave);
  invalid.writeUInt32LE(0, 28);
  assert.equal(wavDurationMs(invalid), undefined);
  assert.equal(wavDurationMs(Buffer.alloc(100)), undefined);
});
