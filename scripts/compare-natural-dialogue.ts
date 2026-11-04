/** Bounded stage-3 text replay, existing Qwen/VOICEVOX only. No microphone. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { naturalDialogueCases } from "./natural-dialogue-cases";
import { assistanceIntent, isHelpReply } from "../shared/teaching";
import type { DialogueHistory } from "./dialogue-cases";

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
  );
  const root = resolve(args.root || ".");
  const output = resolve(args.output || "");
  if (
    !args.run ||
    !args.output ||
    existsSync(output) ||
    !output.startsWith(resolve(".local/voice-lab") + "/")
  )
    throw Error("fresh_private_output_required");
  const load = (file: string) =>
    import(pathToFileURL(resolve(root, file)).href);
  const [{ createLocalTutor }, { createLocalSpeech }, { runTrial }] =
    (await Promise.all([
      load("server/local-tutor.ts"),
      load("server/local-speech.ts"),
      load("scripts/benchmark-voice-dialogue.ts"),
    ])) as [
      typeof import("../server/local-tutor"),
      typeof import("../server/local-speech"),
      typeof import("./benchmark-voice-dialogue"),
    ];
  process.chdir(root);
  const tutor = createLocalTutor(),
    speech = createLocalSpeech({ cacheAudio: false });
  if (!tutor || !speech) throw Error("existing_engines_required");
  const rows: unknown[] = [],
    skipped: unknown[] = [];
  const sources = [
    "server/beginner_dialogue.py",
    "server/lab_conversation.py",
    "server/lab_generation.py",
    "server/conversation_worker.py",
    "server/linguistic_support.py",
    "shared/teaching.ts",
  ].map((path) => ({
    path,
    sha256: createHash("sha256")
      .update(readFileSync(resolve(root, path)))
      .digest("hex"),
  }));
  const checkpoint = () =>
    writeFileSync(
      output,
      JSON.stringify(
        {
          schema: "sensei-naturality-step3.v1",
          label: args.label,
          sources,
          profile: "ja-first",
          dialogue: "hybrid",
          cacheAudio: false,
          personalData: false,
          physicalAndroid: false,
          exclusiveGpu: false,
          linguisticHumanReview: "pending",
          rows,
          skipped,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  const watchdog = setTimeout(() => {
    tutor.close();
    speech.close();
  }, 540_000);
  try {
    const at = performance.now();
    while (!tutor.ready()) {
      if (performance.now() - at > 85_000) throw Error("startup_timeout");
      await wait(50);
    }
    for (const mode of ["paired", "rollout"] as const) {
      for (const dialogue of naturalDialogueCases) {
        let history: DialogueHistory = structuredClone(dialogue.initialHistory);
        let stopped = false;
        for (let index = 0; index < dialogue.turns.length; index++) {
          const turn = dialogue.turns[index]!;
          if (stopped) {
            skipped.push({
              mode,
              dialogue: dialogue.id,
              turn: turn.id,
              reason: "previous-turn-failed",
            });
            continue;
          }
          const row = await runTrial(
            tutor,
            speech,
            dialogue,
            index,
            {
              scenario: dialogue.scenario,
              text: turn.text,
              history: structuredClone(history),
            },
            "ja-first",
            mode,
            AbortSignal.timeout(60_000),
          );
          rows.push(row);
          checkpoint();
          process.stdout.write(
            JSON.stringify({
              mode,
              dialogue: dialogue.id,
              turn: turn.id,
              status: row.status,
              path: row.path,
              reply: row.finalTutor?.reply,
              firstWav: row.firstJapaneseAudioEmittedMs,
            }) + "\n",
          );
          if (mode === "rollout" && row.status !== "complete") {
            stopped = true;
            continue;
          }
          // Real lab history excludes help exchanges. Paired history is authored,
          // rollout history uses the actual emitted tutor, never a repaired answer.
          if (
            !assistanceIntent(turn.text) &&
            !(row.finalTutor && isHelpReply(row.finalTutor))
          )
            history = [
              ...history,
              { role: "user" as const, content: turn.text },
              {
                role: "assistant" as const,
                content:
                  mode === "paired"
                    ? turn.referenceAssistant
                    : [row.finalTutor?.coaching, row.finalTutor?.reply.japanese]
                        .filter(Boolean)
                        .join("\n"),
              },
            ].slice(-12);
        }
      }
    }
  } finally {
    clearTimeout(watchdog);
    checkpoint();
    tutor.close();
    speech.close();
  }
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
