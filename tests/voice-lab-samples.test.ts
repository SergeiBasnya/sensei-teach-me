import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVoiceLabSampleStore } from "../server/voice-lab-samples";

test("voluntary sample store retains PCM unchanged with empty unvalidated references", async () => {
  const root = await mkdtemp(join(tmpdir(), "sensei-lab-samples-"));
  try {
    const save = createVoiceLabSampleStore(root);
    const pcm = Buffer.alloc(6400, 17);
    const options = {
      language: "ja" as const,
      signal: new AbortController().signal,
    };
    const [first, second] = await Promise.all([
      save(pcm, options),
      save(pcm, options),
    ]);
    assert.notEqual(first.id, second.id);
    const manifest = JSON.parse(
      await readFile(join(root, "manifest-template.json"), "utf8"),
    );
    assert.equal(manifest.humanValidated, false);
    assert.equal(manifest.cases.length, 2);
    assert.ok(
      manifest.cases.every(
        (value: { reference: string; humanValidated: boolean }) =>
          value.reference === "" && value.humanValidated === false,
      ),
    );
    const wav = await readFile(join(root, "samples", first.id + ".wav"));
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.deepEqual(wav.subarray(44), pcm);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      save(pcm, { language: "auto", signal: controller.signal }),
    );
    assert.equal(
      JSON.parse(await readFile(join(root, "manifest-template.json"), "utf8"))
        .cases.length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
