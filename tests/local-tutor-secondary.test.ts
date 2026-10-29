import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createLocalTutor } from "../server/local-tutor";
import { timingContext } from "../server/timing";

async function fixture(
  run: (
    tutor: NonNullable<ReturnType<typeof createLocalTutor>>,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "sensei-secondary-"));
  const script = join(root, "worker.cjs");
  await writeFile(
    join(root, "setup-receipt.json"),
    JSON.stringify({ "chat-qwen3-14b": true }),
  );
  await writeFile(
    script,
    `
const {createInterface}=require('node:readline');
let active;const queue=[];const cancelled=new Set();
const send=x=>console.log(JSON.stringify(x));
function drain(){if(active||!queue.length)return;const r=active=queue.shift();
 if(cancelled.has(r.id)){send({id:r.id,cancelled:true});active=undefined;drain();return;}
 if(r.kind==='lab_details')return;
 setTimeout(()=>{send({id:r.id,result:r.kind==='readings'?r.texts.map(()=>'hai'):{}});active=undefined;drain()},5);
}
send({ready:true});
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);
 if(r.kind==='cancel_lab_details'){
  if(cancelled.has(r.target))return;cancelled.add(r.target);
  setTimeout(()=>{if(active?.id===r.target){send({id:r.target,cancelled:true});active=undefined;drain()}},80);return;
 }
 queue.push(r);drain();
});`,
  );
  const tutor = createLocalTutor({ root, script, python: process.execPath });
  assert.ok(tutor);
  try {
    const deadline = Date.now() + 3000;
    while (!tutor.ready()) {
      assert.ok(Date.now() < deadline);
      await wait(5);
    }
    await run(tutor);
  } finally {
    tutor.close();
    await rm(root, { recursive: true, force: true });
  }
}
const request = { japanese: "どこから来ましたか？", history: [] };

test("secondary cancellation keeps bounded slots until terminal worker acknowledgement", async () => {
  await fixture(async (tutor) => {
    const a = new AbortController();
    const first = tutor.labDetails(request, a.signal);
    await assert.rejects(tutor.labDetails(request), /traite déjà/);
    const rejected = assert.rejects(first, { name: "AbortError" });
    a.abort();
    const foreground = tutor.romanize!(["はい"]);
    await assert.rejects(tutor.romanize!(["はい"]), /traite déjà/);
    await rejected;
    await foreground;
    assert.equal(tutor.ready(), true);
    assert.deepEqual(await tutor.romanize!(["はい"]), ["hai"]);
  });
});

test("foreground readings preempt optional French without restarting the worker", async () => {
  await fixture(async (tutor) => {
    const metrics: Record<string, number> = {};
    const secondary = timingContext.run(metrics, () =>
      tutor.labDetails(request),
    );
    const cancelled = assert.rejects(secondary, { name: "AbortError" });
    await wait(5);
    const reading = await tutor.romanize!(["はい"]);
    await cancelled;
    assert.deepEqual(reading, ["hai"]);
    assert.ok(metrics.secondary_cancel_ack! >= 50);
    assert.ok(metrics.secondary_cancel_ack! < 1000);
    assert.equal(tutor.ready(), true);
  });
});

test("already aborted secondary never occupies a worker slot", async () => {
  await fixture(async (tutor) => {
    const signal = AbortSignal.abort();
    await assert.rejects(tutor.labDetails(request, signal), {
      name: "AbortError",
    });
    assert.deepEqual(await tutor.romanize!(["はい"]), ["hai"]);
  });
});
