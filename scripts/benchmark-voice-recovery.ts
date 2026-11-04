/** Bounded synthetic comparison. Import/dry-run never starts an inference worker. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  tutorReplySchema,
  turnRequestSchema,
  type TutorReply,
} from "../shared/contracts";
import {
  voiceLabReplySchema,
  type VoiceLabDialogue,
} from "../shared/voice-lab";
import { createLocalTutor, type LocalTutor } from "../server/local-tutor";
import { createLocalSpeech } from "../server/local-speech";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import { timingContext } from "../server/timing";
import {
  privateDialogueOutput,
  japaneseWaveDurationMs,
  numericSummary,
} from "./benchmark-voice-dialogue";

type Input = typeof turnRequestSchema._output;
type History = Input["history"];
type FixtureTurn = {
  id: string;
  text: string;
  referenceAssistant: string;
  review: string[];
};
type Conversation = {
  id: string;
  scenario: Input["scenario"];
  initialHistory: History;
  turns: FixtureTurn[];
};
const POLICIES: readonly VoiceLabDialogue[] = ["hybrid", "generative"];
// Authored public fiction, not an ASR reference or a certificate of Japanese.
const CONVERSATIONS: Conversation[] = [
  {
    id: "meet-to-cinema",
    scenario: "free",
    initialHistory: [{ role: "assistant", content: "どこから来ましたか？" }],
    turns: [
      {
        id: "origin",
        text: "ベルギーから来ました。",
        referenceAssistant: "ベルギーですね。どこに住んでいますか？",
        review: ["Conserver l'origine sans inventer de résidence."],
      },
      {
        id: "topic-change",
        text: "今日は映画の話をしたいです。",
        referenceAssistant: "どんな映画が好きですか？",
        review: [
          "Répondre au changement explicite de sujet, sans reprendre le questionnaire de résidence.",
        ],
      },
      {
        id: "new-interest",
        text: "猫の映画が好きです。",
        referenceAssistant: "猫の映画が好きなんですね。ほかに何が好きですか？",
        review: [
          "Réagir au détail nouveau des films de chats ; ne pas inventer de film connu ou de goût de Mochi.",
        ],
      },
      {
        id: "new-preference-negation",
        text: "音楽も好きです。でも、コーヒーは好きじゃないです。",
        referenceAssistant: "音楽が好きなんですね。どんな音楽が好きですか？",
        review: [
          "Conserver musique positive et café négatif ; relance pertinente, pas répétition du pays.",
        ],
      },
    ],
  },
  {
    id: "cafe-mixed-request",
    scenario: "cafe",
    initialHistory: [
      {
        role: "assistant",
        content:
          "練習のカフェです。お茶は三百五十円、コーヒーは五百円です。何にしますか？",
      },
    ],
    turns: [
      {
        id: "two-teas",
        text: "お茶を二つください。",
        referenceAssistant: "お茶を二つですね。ホットですか、アイスですか？",
        review: ["Deux thés, aucune substitution de boisson ou quantité."],
      },
      {
        id: "temperature-plus-question",
        text: "ホットでお願いします。トイレはどこですか？",
        referenceAssistant:
          "温かいお茶を二つですね。トイレの場所は分かりません。",
        review: [
          "Conserver chaud et deux thés malgré la question ; ne pas inventer le lieu inconnu.",
        ],
      },
      {
        id: "reduce-quantity",
        text: "やっぱり、お茶は一つでお願いします。",
        referenceAssistant: "温かいお茶を一つですね。",
        review: [
          "Remplacer la quantité deux par un, conserver thé et température.",
        ],
      },
      {
        id: "known-linked-price",
        text: "お茶はいくらですか？",
        referenceAssistant: "お茶は三百五十円です。",
        review: [
          "Prix fictif du thé 350 yens ; ne pas emprunter les 500 yens du café.",
        ],
      },
    ],
  },
];
const round = (value: number) => Math.round(value * 10) / 10;
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function referenceInput(item: Conversation, index: number): Input {
  return turnRequestSchema.parse({
    scenario: item.scenario,
    text: item.turns[index]!.text,
    history: [
      ...item.initialHistory,
      ...item.turns.slice(0, index).flatMap((turn) => [
        { role: "user" as const, content: turn.text },
        { role: "assistant" as const, content: turn.referenceAssistant },
      ]),
    ],
  });
}
function policyOrder(index: number): readonly VoiceLabDialogue[] {
  return index % 2 ? [...POLICIES].reverse() : POLICIES;
}
function assertNoWorkers() {
  // PID-only query for the application's named inference scripts. No Mac
  // controls or unrelated command lines are read, displayed, killed or altered.
  const result = spawnSync(
    "pgrep",
    ["-f", "server/(conversation_worker|voice_lab_worker|voice_worker)[.]py"],
    { encoding: "utf8", timeout: 5_000 },
  );
  if (result.error || ![0, 1].includes(result.status ?? -1))
    throw new Error("worker_preflight_unavailable");
  if (result.status === 0) throw new Error("workers_already_running");
  return {
    namedWorkersAbsent: true,
    scope: "named-sensei-workers-only",
    unrelatedGpuLoad: "not-measured",
  };
}
function outputPath(value: string) {
  const path = resolve(value),
    directory = resolve(".local/voice-lab");
  const child = relative(directory, path);
  if (
    !child ||
    child.startsWith(".." + sep) ||
    child === ".." ||
    !/^recovery[-_.a-zA-Z0-9]*\.json$/.test(basename(path))
  )
    throw new Error("private_recovery_output_required");
  privateDialogueOutput(path);
  return path;
}
function snapshot() {
  const files = [
    "scripts/benchmark-voice-recovery.ts",
    "scripts/benchmark-voice-dialogue.ts",
    "package.json",
    "package-lock.json",
    ...["server", "shared"].flatMap((directory) =>
      readdirSync(directory)
        .filter((file) => /\.(ts|py)$/.test(file))
        .map((file) => `${directory}/${file}`),
    ),
  ]
    .sort()
    .map((path) => ({ path, sha256: hash(readFileSync(path)) }));
  const python = execFileSync(
    process.env.VOICEVOX_PYTHON || resolve(".venv/bin/python"),
    [
      "-c",
      "import importlib.metadata as m,json,platform\nv={}\nfor p in ['mlx','mlx-lm','mlx-whisper','numpy','pyopenjtalk','voicevox-core']:\n try:v[p]=m.version(p)\n except m.PackageNotFoundError:v[p]=None\nprint(json.dumps({'python':platform.python_version(),'packages':v}))",
    ],
    { encoding: "utf8", timeout: 10_000 },
  );
  return {
    sourceFiles: files,
    sourceSha256: hash(JSON.stringify(files)),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      python: JSON.parse(python),
      weightHash: "not-measured",
    },
  };
}
type Secondary = {
  settledMs: number;
  status: "completed" | "cancelled" | "rejected";
  metrics: Record<string, number>;
};
type Trial = {
  mode: "paired" | "rollout";
  conversation: string;
  turn: string;
  policy: VoiceLabDialogue;
  input: Input;
  inputSha256: string;
  status: "failed" | "complete";
  failure?: string;
  firstJapaneseAudioEmittedMs: number | null;
  responseDoneMs: number | null;
  respondReturnedMs: number | null;
  allObservedWorkSettledMs: number | null;
  secondaryCallbacks: Secondary[];
  totalJapaneseWaveMs: number;
  tutor: TutorReply | null;
  events: Record<string, unknown>[];
  review: string[];
};
async function runTrial(
  local: LocalTutor,
  speech: NonNullable<ReturnType<typeof createLocalSpeech>>,
  input: Input,
  fixture: Conversation,
  index: number,
  policy: VoiceLabDialogue,
  mode: Trial["mode"],
  signal: AbortSignal,
  close: () => void,
): Promise<Trial> {
  const row: Trial = {
    mode,
    conversation: fixture.id,
    turn: fixture.turns[index]!.id,
    policy,
    input,
    inputSha256: hash(JSON.stringify(input)),
    status: "failed",
    firstJapaneseAudioEmittedMs: null,
    responseDoneMs: null,
    respondReturnedMs: null,
    allObservedWorkSettledMs: null,
    secondaryCallbacks: [],
    totalJapaneseWaveMs: 0,
    tutor: null,
    events: [],
    review: fixture.turns[index]!.review,
  };
  const started = performance.now(),
    elapsed = () => round(performance.now() - started);
  const secondary: Promise<void>[] = [];
  const limit = setTimeout(close, 90_000);
  let nextAudio = 0;
  const respond = createVoiceLabResponse(local, speech, {
    turn: (body, options) => local.labTurn(body, "ja-first", options),
    details(body) {
      if (row.firstJapaneseAudioEmittedMs === null || body.signal.aborted)
        return Promise.reject(new Error("secondary_before_audio"));
      const metrics = timingContext.getStore();
      const work = local.labDetails(
        { japanese: body.japanese, history: body.history },
        body.signal,
      );
      secondary.push(
        work.then(
          () => {
            row.secondaryCallbacks.push({
              settledMs: elapsed(),
              status: "completed",
              metrics: { ...metrics },
            });
          },
          () => {
            row.secondaryCallbacks.push({
              settledMs: elapsed(),
              status: body.signal.aborted ? "cancelled" : "rejected",
              metrics: { ...metrics },
            });
          },
        ),
      );
      return work;
    },
  });
  try {
    await respond({
      text: input.text,
      scenario: input.scenario,
      history: input.history,
      turn: index + 1,
      language: "auto",
      diagnostic: true,
      dialogue: policy,
      signal,
      emit(raw) {
        const event = voiceLabReplySchema.parse(raw),
          elapsedMs = elapsed();
        if (event.type === "tutor") {
          if (row.tutor) throw new Error("duplicate_tutor");
          row.tutor = tutorReplySchema.parse(event.tutor);
        }
        if (event.type === "details") {
          if (
            !row.tutor ||
            !nextAudio ||
            row.tutor.correction ||
            event.japanese !== row.tutor.reply.japanese ||
            event.coaching !== (row.tutor.coaching ?? null)
          )
            throw new Error("invalid_secondary_target");
          row.tutor = {
            ...row.tutor,
            reply: { ...row.tutor.reply, french: event.french },
          };
        }
        if (event.type === "audio") {
          if (!row.tutor || event.index !== nextAudio++)
            throw new Error("audio_before_validated_tutor");
          const wav = Buffer.from(event.audio, "base64"),
            durationMs = japaneseWaveDurationMs(wav);
          row.firstJapaneseAudioEmittedMs ??= elapsedMs;
          row.totalJapaneseWaveMs = round(row.totalJapaneseWaveMs + durationMs);
          row.events.push({
            type: "audio",
            index: event.index,
            bytes: wav.length,
            durationMs,
            elapsedMs,
          });
        } else row.events.push({ ...event, elapsedMs });
        if (event.type === "response_done") {
          if (row.responseDoneMs !== null)
            throw new Error("duplicate_response_done");
          row.responseDoneMs = elapsedMs;
        }
      },
    });
    row.respondReturnedMs = elapsed();
    if (hash(JSON.stringify(input)) !== row.inputSha256)
      throw new Error("authored_input_mutated");
    if (
      !row.tutor ||
      row.firstJapaneseAudioEmittedMs === null ||
      row.responseDoneMs === null
    )
      throw new Error("complete_audio_required");
    row.status = "complete";
  } catch {
    row.failure = signal.aborted
      ? "experiment-stopped"
      : "inference-or-contract-failed";
    row.respondReturnedMs ??= elapsed();
  } finally {
    // Await the real terminal worker acknowledgement, not an elapsed-time guess.
    // The per-trial/global bound closes only our workers if settlement stalls.
    await Promise.allSettled(secondary);
    await sleep(0);
    row.allObservedWorkSettledMs = elapsed();
    clearTimeout(limit);
  }
  return row;
}
function summaries(rows: Trial[]) {
  return POLICIES.map((policy) => {
    const all = rows.filter(
      (row) => row.mode === "paired" && row.policy === policy,
    );
    const complete = all.filter((row) => row.status === "complete");
    const pathRows: Record<string, Trial[]> = {};
    for (const row of all) {
      const observation = row.events.find(
        (event) => event.type === "observation",
      )?.observation;
      const path =
        observation && typeof observation === "object" && "path" in observation
          ? String(observation.path)
          : "unobserved";
      (pathRows[path] ??= []).push(row);
    }
    return {
      policy,
      attempted: all.length,
      completed: complete.length,
      failed: all.length - complete.length,
      byPath: Object.fromEntries(
        Object.entries(pathRows).map(([path, values]) => {
          const successful = values.filter(
            (value) => value.status === "complete",
          );
          return [
            path,
            {
              attempted: values.length,
              completed: successful.length,
              firstJapaneseAudioEmitted: numericSummary(
                successful.map((value) => value.firstJapaneseAudioEmittedMs!),
              ),
              responseDone: numericSummary(
                successful.map((value) => value.responseDoneMs!),
              ),
              allObservedWorkSettled: numericSummary(
                successful.map((value) => value.allObservedWorkSettledMs!),
              ),
            },
          ];
        }),
      ),
      firstJapaneseAudioEmitted: numericSummary(
        complete.map((row) => row.firstJapaneseAudioEmittedMs!),
      ),
      responseDone: numericSummary(complete.map((row) => row.responseDoneMs!)),
      allObservedWorkSettled: numericSummary(
        complete.map((row) => row.allObservedWorkSettledMs!),
      ),
    };
  });
}
function selfCheck() {
  assert.equal(CONVERSATIONS.length, 2);
  assert.equal(
    CONVERSATIONS.reduce((sum, item) => sum + item.turns.length, 0),
    8,
  );
  for (const item of CONVERSATIONS)
    for (let index = 0; index < 4; index++) {
      const a = referenceInput(item, index),
        b = referenceInput(item, index);
      assert.deepEqual(a, b);
      assert.equal(a.history.length, item.initialHistory.length + 2 * index);
      assert.notEqual(a.history, b.history);
    }
  assert.deepEqual(policyOrder(0), ["hybrid", "generative"]);
  assert.deepEqual(policyOrder(1), ["generative", "hybrid"]);
  assert.equal(numericSummary([]).medianMs, null);
  process.stdout.write(
    "Recovery plan checks passed; no inference worker or process query started.\n",
  );
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) {
    selfCheck();
    return;
  }
  const outputIndex = args.indexOf("--output");
  const output =
    outputIndex >= 0
      ? args[outputIndex + 1]
      : args.find((arg) => arg.startsWith("--output="))?.slice(9);
  const rollout = args.includes("--rollout");
  const known = new Set(["--dry-run", "--exclusive", "--rollout", "--output"]);
  for (let index = 0; index < args.length; index++) {
    if (index === outputIndex + 1 && outputIndex >= 0) continue;
    if (!known.has(args[index]!) && !args[index]!.startsWith("--output="))
      throw new Error("unknown_argument");
  }
  const plan = {
    pairedTurns: 16,
    rolloutTurns: rollout ? 16 : 0,
    warmupTurns: 2,
    policies: POLICIES,
    conversations: CONVERSATIONS.map((item) => ({
      id: item.id,
      turns: item.turns.map((turn) => turn.id),
    })),
    generation: "ja-first",
    audioCache: false,
    maxRunMs: 720_000,
    maxTrialMs: 90_000,
  };
  if (args.includes("--dry-run")) {
    process.stdout.write(
      JSON.stringify({
        status: "plan-only",
        modelLaunched: false,
        processQueryRun: false,
        ...plan,
      }) + "\n",
    );
    return;
  }
  if (!output || output.startsWith("--") || !args.includes("--exclusive"))
    throw new Error("output_and_exclusive_required");
  const destination = outputPath(output),
    preflight = assertNoWorkers(),
    provenance = snapshot();
  const rows: Trial[] = [],
    warmups: Record<string, unknown>[] = [];
  let status = "preparing",
    created = false;
  const save = () => {
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(
      destination,
      JSON.stringify(
        {
          schemaVersion: "sensei-voice-recovery.v1",
          status,
          date: new Date().toISOString(),
          plan,
          preflight,
          provenance,
          data: "Authored public fictional text only; no human corpus, ASR, microphone or playback.",
          definitions: {
            firstJapaneseAudioEmittedMs:
              "Already recognized text entering response until first complete validated WAV emitted; excludes endpoint, ASR, transport and Android playback.",
            responseDoneMs:
              "Terminal audio response event; optional metadata can still be pending.",
            allObservedWorkSettledMs:
              "Response and actual secondary callbacks settled/acknowledged before next cell; not listening or audible time.",
            rollout:
              "Own prior responses reinserted; after divergence policies no longer share histories and are not causal latency pairs.",
          },
          warmups,
          rows,
          summaries: summaries(rows),
          humanAsrValidation: "pending",
          humanLinguisticReview: "pending",
          androidLatency: "not-measured",
          productionSelection: "unchanged",
          resources: {
            nodeRssBytes: process.memoryUsage().rss,
            gpuMemory: "not-measured",
            energy: "not-measured",
          },
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: created ? "w" : "wx" },
    );
    created = true;
  };
  save(); // Reserve a fresh private report before creating any worker.
  const local = createLocalTutor();
  let speech: ReturnType<typeof createLocalSpeech>;
  try {
    speech = createLocalSpeech({ cacheAudio: false });
  } catch {
    local?.close();
    status = "incomplete";
    save();
    throw new Error("speech_initialization_failed");
  }
  if (!local || !speech) {
    local?.close();
    speech?.close();
    status = "incomplete";
    save();
    throw new Error("engines_unavailable");
  }
  const stop = new AbortController();
  const close = () => {
    stop.abort();
    local.close();
    speech.close();
  };
  const limit = setTimeout(close, plan.maxRunMs);
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  const assertActive = () => {
    if (stop.signal.aborted || !local.ready())
      throw new Error("engines_stopped");
  };
  try {
    const startup = performance.now();
    while (!local.ready()) {
      if (stop.signal.aborted || performance.now() - startup > 120_000)
        throw new Error("startup_timeout");
      await sleep(100);
    }
    for (const policy of POLICIES) {
      const began = performance.now();
      await local.labTurn(referenceInput(CONVERSATIONS[0]!, 0), "ja-first", {
        dialogue: policy,
      });
      warmups.push({ policy, elapsedMs: round(performance.now() - began) });
    }
    await speech.speak("こんにちは。", "ja");
    status = "running";
    save();
    for (const [conversationIndex, item] of CONVERSATIONS.entries())
      for (let index = 0; index < item.turns.length; index++) {
        const input = referenceInput(item, index);
        for (const policy of policyOrder(conversationIndex + index)) {
          assertActive();
          // Each policy receives its own clone of the identical authored input.
          const row = await runTrial(
            local,
            speech,
            structuredClone(input),
            item,
            index,
            policy,
            "paired",
            stop.signal,
            close,
          );
          rows.push(row);
          save();
          process.stdout.write(
            `paired ${item.id} turn=${index} policy=${policy} status=${row.status}\n`,
          );
          assertActive();
        }
      }
    if (rollout)
      for (const [conversationIndex, item] of CONVERSATIONS.entries())
        for (const policy of policyOrder(conversationIndex)) {
          let history = structuredClone(item.initialHistory);
          for (let index = 0; index < item.turns.length; index++) {
            assertActive();
            const input = turnRequestSchema.parse({
              scenario: item.scenario,
              text: item.turns[index]!.text,
              history,
            });
            const row = await runTrial(
              local,
              speech,
              input,
              item,
              index,
              policy,
              "rollout",
              stop.signal,
              close,
            );
            rows.push(row);
            save();
            process.stdout.write(
              `rollout ${item.id} turn=${index} policy=${policy} status=${row.status}\n`,
            );
            if (row.status !== "complete" || !row.tutor) break; // Never bridge a failed history with a reference answer.
            history = [
              ...history,
              { role: "user" as const, content: input.text },
              {
                role: "assistant" as const,
                content: [row.tutor.coaching, row.tutor.reply.japanese]
                  .filter(Boolean)
                  .join("\n"),
              },
            ].slice(-12);
            assertActive();
          }
        }
    status = "complete";
    save();
  } catch {
    status = "incomplete";
    save();
    throw new Error("recovery_experiment_incomplete");
  } finally {
    clearTimeout(limit);
    process.removeListener("SIGINT", close);
    process.removeListener("SIGTERM", close);
    close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    process.stderr.write(
      "Recovery comparison not completed. Verify arguments, exclusive worker window and private report.\n",
    );
    process.exitCode = 1;
  });
}
