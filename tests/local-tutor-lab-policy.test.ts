import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createLocalTutor } from "../server/local-tutor";

test("lab policy and ephemeral observation never propagate into classic turns", async () => {
  const root = await mkdtemp(join(tmpdir(), "sensei-lab-policy-"));
  const script = join(root, "worker.cjs");
  await writeFile(
    join(root, "setup-receipt.json"),
    JSON.stringify({ "chat-qwen3-14b": true }),
  );
  await writeFile(
    script,
    `
 const {createInterface}=require('node:readline');
 console.log(JSON.stringify({ready:true}));
 createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);
 const mode=r.labDialogue==='generative'?'generative':'hybrid';
 const result={reply:{japanese:'はい。',romaji:'Hai.',french:(r.labStreaming?'lab':'classic')+':'+mode+':'+String(r.labDiagnostics===true)},correction:null,vocabulary:[],observation:{intent:'continue_from_answer',path:'generated',facts:[{name:'private',value:'not exported'}]}};
 console.log(JSON.stringify({id:r.id,result}));});`,
  );
  const tutor = createLocalTutor({ root, script, python: process.execPath });
  assert.ok(tutor);
  try {
    const until = Date.now() + 3000;
    while (!tutor.ready()) {
      assert.ok(Date.now() < until);
      await wait(5);
    }
    const input = { scenario: "meet" as const, history: [], text: "はい。" };
    const seen: unknown[] = [];
    const lab = await tutor.labTurn(input, "ja-first", {
      dialogue: "generative",
      onObservation: (value) => seen.push(value),
    });
    assert.equal(lab.reply.french, "lab:generative:true");
    assert.equal(seen.length, 1);
    assert.equal("observation" in lab, false);
    assert.equal((await tutor.labTurn(input)).reply.french, "lab:hybrid:false");
    assert.equal(
      (await tutor.turn(input)).reply.french,
      "classic:hybrid:false",
    );
    assert.equal(seen.length, 1);
  } finally {
    tutor.close();
    await rm(root, { recursive: true, force: true });
  }
});
