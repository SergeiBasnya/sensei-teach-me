import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createVoiceLabAsr } from "../server/voice-lab-asr";

test("aborting the separate ASR process allows an immediate clean retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sensei-lab-asr-"));
  const script = join(directory, "worker.cjs");
  await writeFile(
    script,
    `const {createInterface}=require('node:readline');console.log(JSON.stringify({ready:true}));createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);setTimeout(()=>console.log(JSON.stringify({id:r.id,text:'はい',uncertain:false,metrics:{asr:100}})),100);});`,
  );
  const service = createVoiceLabAsr({ python: process.execPath, script });
  try {
    const controller = new AbortController();
    const first = service.transcribe(Buffer.alloc(6400), {
      language: "ja",
      partial: true,
      signal: controller.signal,
    });
    while (!service.ready()) await wait(10);
    await wait(10);
    controller.abort();
    await assert.rejects(first);
    const retry = await service.transcribe(Buffer.alloc(6400), {
      language: "auto",
      partial: false,
      signal: new AbortController().signal,
    });
    assert.equal(retry.text, "はい");
    assert.equal(retry.uncertain, false);
    service.close();
    await assert.rejects(
      service.transcribe(Buffer.alloc(6400), {
        language: "auto",
        partial: false,
        signal: new AbortController().signal,
      }),
    );
  } finally {
    service.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("raw diagnostics require a final opt-in and are stripped from default and partial results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sensei-lab-asr-diagnostic-"));
  const script = join(directory, "worker.cjs");
  await writeFile(
    script,
    `
    const {createInterface}=require('node:readline');
    console.log(JSON.stringify({ready:true}));
    createInterface({input:process.stdin}).on('line',line=>{
      const r=JSON.parse(line);
      console.log(JSON.stringify({id:r.id,text:r.diagnostic?'requested':'disabled',uncertain:true,metrics:{asr:1},diagnostic:{rawText:'synthetic raw text',detectedLanguage:'fr',acceptedSegments:1,rejectedSegments:2,signalGate:'decoded'}}));
    });
  `,
  );
  const service = createVoiceLabAsr({ python: process.execPath, script });
  try {
    const options = {
      language: "auto" as const,
      partial: false,
      signal: new AbortController().signal,
    };
    const plain = await service.transcribe(Buffer.alloc(6400), options);
    assert.equal(plain.text, "disabled");
    assert.equal(Object.hasOwn(plain, "diagnostic"), false);
    const final = await service.transcribe(Buffer.alloc(6400), {
      ...options,
      diagnostic: true,
    });
    assert.equal(final.text, "requested");
    assert.deepEqual(final.diagnostic, {
      rawText: "synthetic raw text",
      detectedLanguage: "fr",
      acceptedSegments: 1,
      rejectedSegments: 2,
      signalGate: "decoded",
    });
    const partial = await service.transcribe(Buffer.alloc(6400), {
      ...options,
      partial: true,
      diagnostic: true,
    });
    assert.equal(partial.text, "disabled");
    assert.equal(Object.hasOwn(partial, "diagnostic"), false);
  } finally {
    service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
