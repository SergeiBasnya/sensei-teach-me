// Explicit local experiment: no human voice, microphone, TTS or model download.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createLocalTutor } from "../server/local-tutor";
import { timingContext } from "../server/timing";

async function main() {
  const destination = process.argv[2];
  if (!destination || !process.argv.includes("--exclusive")) {
    process.stdout.write(
      JSON.stringify({
        status: "plan-only",
        modelLaunched: false,
        cells: 6,
        delaysMs: [0, 100, 600],
        humanVoice: false,
      }) + "\n",
    );
    return;
  }
  const path = resolve(destination),
    privateRoot = resolve(".local/voice-lab");
  if (!path.startsWith(privateRoot + sep) || existsSync(path))
    throw new Error("new_private_output_required");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (realpathSync(dirname(path)) !== dirname(path))
    throw new Error("canonical_private_directory_required");
  execFileSync("git", ["check-ignore", "--quiet", "--", path]);
  const tracked = execFileSync("git", ["ls-files", "--", path], {
    encoding: "utf8",
  });
  if (tracked.trim()) throw new Error("private_output_required");
  const sourcePaths = [
    "scripts/check-secondary-cancellation.ts",
    "server/conversation_worker.py",
    "server/local-tutor.ts",
    "server/lab_generation.py",
    "server/lab_conversation.py",
    "server/lab_worker_inbox.py",
    "server/llm_stream_trace.py",
    "package-lock.json",
  ];
  const sourceSnapshot = sourcePaths.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  }));
  const tutor = createLocalTutor();
  if (!tutor) throw new Error("installed_local_engines_required");
  const rows: Record<string, unknown>[] = [];
  let created = false,
    status = "running";
  const save = () => {
    writeFileSync(
      path,
      JSON.stringify(
        {
          schemaVersion: 1,
          date: new Date().toISOString(),
          status,
          sourceSnapshot,
          rows,
          definition:
            "Foreground readings RPC through the same worker after optional French. Not a microphone, first audio, human observation or global GPU-idle measurement.",
          humanValidation: "pending",
          productionSelection: "unchanged",
        },
        null,
        2,
      ) + "\n",
      { flag: created ? "w" : "wx", mode: 0o600 },
    );
    created = true;
  };
  const stop = () => tutor.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const readyDeadline = performance.now() + 120_000;
    while (!tutor.ready()) {
      if (performance.now() > readyDeadline) throw new Error("startup_timeout");
      await sleep(100);
    }
    await tutor.labTurn(
      {
        scenario: "meet",
        text: "ベルギーから来ました。",
        history: [{ role: "assistant", content: "どこから来ましたか？" }],
      },
      "structured",
    );
    const japanese =
      "これは日本語の練習です。駅の窓口で切符を買います。京都までの切符を二枚お願いします。片道の切符です。帰りの切符はいりません。ホームの番号を確認したいです。これは架空の会話で、実際の電車の情報ではありません。短い文でゆっくり話すと練習しやすいです。";
    await tutor.labDetails({ japanese: "どの町から来ましたか？", history: [] });
    for (const [round, delays] of [
      [0, [0, 100, 600]],
      [1, [600, 100, 0]],
    ] as const) {
      for (const delayMs of delays) {
        const controlAt = performance.now();
        await tutor.romanize!(["はい"]);
        const controlMs = performance.now() - controlAt;
        const metrics: Record<string, number> = {};
        const metadataAt = performance.now();
        const secondary = timingContext.run(metrics, () =>
          tutor.labDetails({ japanese, history: [] }),
        );
        // Attach both handlers immediately; cancellation is a measured outcome.
        const settled = secondary.then(
          () => "completed",
          (error) =>
            error instanceof Error && error.name === "AbortError"
              ? "cancelled"
              : "failed",
        );
        await sleep(delayMs);
        const foregroundAt = performance.now();
        const reading = await tutor.romanize!(["はい"]);
        const foregroundReadingMs = performance.now() - foregroundAt;
        const secondaryStatus = await settled;
        rows.push({
          round,
          delayMs,
          controlReadingMs: controlMs,
          foregroundReadingMs,
          secondaryStatus,
          allSettledMs: performance.now() - metadataAt,
          metrics,
          readingSucceeded: reading[0] !== undefined,
        });
        save();
        process.stdout.write(
          `cancellation round=${round} delay=${delayMs} status=${secondaryStatus}\n`,
        );
        if (secondaryStatus !== "cancelled")
          throw new Error("cancellation_not_observed");
      }
    }
    status = "complete";
    save();
  } catch (error) {
    status = "incomplete";
    save();
    throw error;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    tutor.close();
  }
}
main().catch(() => {
  process.stderr.write(
    "Cancellation experiment incomplete; inspect the private report.\n",
  );
  process.exitCode = 1;
});
