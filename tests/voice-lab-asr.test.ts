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
