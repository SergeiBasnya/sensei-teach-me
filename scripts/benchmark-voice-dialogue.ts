/** Opt-in local text experiment. No ASR input, microphone or human reference. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  tutorReplySchema,
  turnRequestSchema,
  type TutorReply,
} from "../shared/contracts";
import {
  voiceLabReplySchema,
  type VoiceLabReplyEvent,
} from "../shared/voice-lab";
import {
  createLocalTutor,
  type LocalTutor,
  type LabGeneration,
} from "../server/local-tutor";
import { createLocalSpeech } from "../server/local-speech";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import { wavDurationMs } from "../server/voice-lab-audio";
import { timingContext } from "../server/timing";
import type { TutorProvider } from "../server/app";
import {
  dialogueCases,
  pairedDialogueInput,
  appendDialogueHistory,
  type DialogueCase,
  type DialogueTurn,
  type DialogueInput,
  type DialogueHistory,
} from "./dialogue-cases";

export const DIALOGUE_PROFILES: readonly LabGeneration[] = [
  "structured",
  "compact",
  "ja-first",
];
type Mode = "paired" | "rollout";
type DetailsInput = { japanese: string; history: DialogueHistory };
type CancellableTutor = Omit<LocalTutor, "labDetails"> & {
  labDetails(
    input: DetailsInput,
    signal?: AbortSignal,
  ): ReturnType<LocalTutor["labDetails"]>;
};
type Check = {
  id: string;
  status: "pass" | "flag" | "not-applicable";
  kind: "mechanical" | "lexical-signal";
  detail: string;
};
type Trial = {
  mode: Mode;
  dialogue: string;
  turn: string;
  turnIndex: number;
  profile: LabGeneration;
  input: DialogueInput;
  inputSha256: string;
  status: "complete" | "failed";
  path:
    | "generated"
    | "correction"
    | "assisted"
    | "practice"
    | "shared-response"
    | "no-tutor";
  providerTurnCalls: number;
  historyRecovery?: {
    strategy: "unchanged-last-successful-history";
    afterFailures: string[];
  };
  failure?: string;
  firstJapaneseAudioEmittedMs: number | null;
  responseDoneMs: number | null;
  respondReturnedMs: number | null;
  secondaryCallbacks: {
    settledMs: number;
    status: "completed" | "cancelled" | "rejected";
    metrics: Record<string, number>;
  }[];
  allObservedWorkSettledMs: number | null;
  totalJapaneseWaveMs: number;
  estimatedLastWaveEndMs: number | null;
  estimatedListeningGateMs: number | null;
  estimatedHoldAfterLastWaveMs: number | null;
  finalTutor: TutorReply | null;
  events: Record<string, unknown>[];
  checks: Check[];
  humanLinguisticReview: "pending";
};

const round = (number: number) => Math.round(number * 10) / 10;
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const dialogueInputHash = (input: DialogueInput) =>
  digest(JSON.stringify(input));
export function rotateProfiles(
  profiles: readonly LabGeneration[],
  offset: number,
) {
  const index = offset % profiles.length;
  return [...profiles.slice(index), ...profiles.slice(0, index)];
}
export function numericSummary(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    n: sorted.length,
    medianMs: sorted.length
      ? round(
          (sorted[Math.floor((sorted.length - 1) / 2)]! +
            sorted[Math.floor(sorted.length / 2)]!) /
            2,
        )
      : null,
    minMs: sorted.length ? round(sorted[0]!) : null,
    maxMs: sorted.length ? round(sorted.at(-1)!) : null,
  };
}

/** Duration of complete samples, using the same parser as the response budget. */
export function japaneseWaveDurationMs(wav: Buffer) {
  const value = wavDurationMs(wav);
  if (value === undefined) throw new Error("invalid_complete_wav");
  return round(value);
}

/** Timing-only ideal queue: no network, decode, player startup, VAD or speaker. */
export function estimateListeningGate(
  audio: { elapsedMs: number; durationMs: number }[],
  responseDoneMs: number | null,
) {
  let end = 0;
  for (const clip of audio)
    end = Math.max(end, clip.elapsedMs) + clip.durationMs;
  if (!audio.length || responseDoneMs === null)
    return {
      lastWaveEndMs: null,
      listeningGateMs: null,
      holdAfterLastWaveMs: null,
    };
  return {
    lastWaveEndMs: round(end),
    listeningGateMs: round(Math.max(end, responseDoneMs)),
    holdAfterLastWaveMs: round(Math.max(0, responseDoneMs - end)),
  };
}

function yenValues(text: string) {
  const digits: Record<string, number> = {
    〇: 0,
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  return [
    ...text
      .normalize("NFKC")
      .matchAll(/([0-9〇零一二三四五六七八九十百千]+)円/g),
  ].map((match) => {
    if (/^\d+$/.test(match[1]!)) return Number(match[1]);
    let sum = 0,
      current = 0;
    for (const char of match[1]!) {
      const unit = ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[
        char
      ];
      if (unit) {
        sum += (current || 1) * unit;
        current = 0;
      } else current = digits[char] ?? 0;
    }
    return sum + current;
  });
}

/** Flags are inspection aids, never a linguistic or pedagogical quality score. */
export function inspectDialogueReply(
  dialogue: DialogueCase,
  turn: DialogueTurn,
  tutor: TutorReply | null,
): Check[] {
  if (!tutor)
    return [
      {
        id: "complete-tutor",
        status: "flag",
        kind: "mechanical",
        detail: "No complete validated tutor was emitted.",
      },
    ];
  const checks: Check[] = [];
  const add = (
    id: string,
    flagged: boolean,
    detail: string,
    kind: Check["kind"] = "lexical-signal",
  ) => checks.push({ id, status: flagged ? "flag" : "pass", kind, detail });
  const japanese = tutor.reply.japanese,
    french = tutor.reply.french;
  if (turn.correction === "required") {
    add(
      "expected-correction",
      !tutor.correction,
      "Authored clear particle error should receive a correction; inspect its meaning.",
      "mechanical",
    );
    if (turn.correctedContains)
      add(
        "corrected-construction",
        !tutor.correction?.corrected.includes(turn.correctedContains),
        "Expected retained country and kara construction in the correction.",
        "mechanical",
      );
  } else if (turn.correction === "none")
    add(
      "unexpected-correction",
      tutor.correction !== null,
      "The fixture is intended to be acceptable, repaired or a help request; any correction needs review.",
      "mechanical",
    );
  if (turn.checkGreetingFollowup)
    add(
      "greeting-without-explicit-followup",
      /こんにちは|はじめまして/.test(japanese) &&
        !/[?？]|(?:です|ます)か/.test(japanese),
      "A greeting with no explicit question can leave the beginner without a turn.",
    );
  if (turn.tags.includes("assistant-identity")) {
    const identifiesAsAi =
      /\bAI\b|ＡＩ|人工知能|intelligence\s+artificielle|\bIA\b/i.test(
        japanese + " " + french,
      );
    const claimsOrigin =
      /(?:日本|ベルギー|フランス|カナダ|アメリカ)(?:から来(?:ました|た)|出身です|人です)(?![か?？])/.test(
        japanese,
      ) ||
      /\bje\s+(?:viens\s+(?:du\s+|de\s+|d[’'])|suis\s+(?:originaire|japonaise?|belge|française?))/i.test(
        french,
      );
    add(
      "personal-origin-without-ai",
      claimsOrigin && !identifiesAsAi,
      "In this identity question, Mochi claims an origin without identifying as AI; a targeted biography warning, not a universal identity test.",
    );
  }
  if (dialogue.scenario === "station")
    add(
      "station-role-question",
      /(?:どの|何|どちらの)[^。！？!?]{0,12}(?:ホーム|番線)|(?:ホーム|番線)[^。！？!?]{0,12}(?:どこ|どちら|何)/.test(
        japanese,
      ),
      "Candidate role inversion: Mochi may be asking the passenger for platform information.",
    );
  if (dialogue.scenario === "cafe")
    add(
      "cafe-role-request",
      /(?:コーヒー|お茶|紅茶)[^。！？!?]{0,12}ください/.test(japanese) &&
        !tutor.assisted &&
        !tutor.correction,
      "Candidate role inversion: Mochi may be ordering from the learner; quoted examples need human review.",
    );
  if (turn.expectedPriceYen !== undefined) {
    const prices = yenValues(japanese);
    add(
      "known-price",
      !prices.includes(turn.expectedPriceYen),
      "Compare the reply with the fictional price already supplied; absence can also mean the question was not answered.",
    );
    if (french)
      add(
        "price-translation",
        !french.normalize("NFKC").includes(String(turn.expectedPriceYen)) &&
          !/trois\s+cent\s+cinquante/i.test(french),
        "Inspect the French rendering of the known 350-yen price.",
      );
  }
  const jpNegative =
    /好き(?:じゃない|ではない|ではありません|じゃありません)|(?:飲み|食べ)ません/.test(
      japanese,
    );
  if (jpNegative && french)
    add(
      "negative-translation",
      !/n[’']|ne\s|pas|ni\s|détest|aime\s+peu|négation/i.test(french),
      "A negative Japanese construction has no expected French negative marker; paraphrases need human review.",
    );
  if (!french)
    checks.push({
      id: "translation-available",
      status: "flag",
      kind: "mechanical",
      detail:
        "No French text observed before secondary cleanup; missing is distinct from mistranslated.",
    });
  return checks;
}

export function privateDialogueOutput(path: string) {
  let parent = dirname(path);
  while (!existsSync(parent) && parent !== dirname(parent))
    parent = dirname(parent);
  const canonical = resolve(realpathSync(parent), relative(parent, path));
  const git = spawnSync(
    "git",
    ["-C", realpathSync(parent), "rev-parse", "--show-toplevel"],
    { encoding: "utf8" },
  );
  if (git.error) throw new Error("privacy_check_unavailable");
  if (git.status === 0) {
    const root = git.stdout.trim(),
      item = relative(root, canonical);
    const tracked = spawnSync("git", [
      "-C",
      root,
      "ls-files",
      "--error-unmatch",
      "--",
      item,
    ]);
    const ignored = spawnSync("git", [
      "-C",
      root,
      "check-ignore",
      "--quiet",
      "--",
      item,
    ]);
    if (tracked.status === 0 || ignored.status !== 0)
      throw new Error("private_fresh_output_required");
  }
  if (existsSync(path)) throw new Error("fresh_output_required");
}

function sources() {
  const files = [
    "scripts/dialogue-cases.ts",
    "scripts/benchmark-voice-dialogue.ts",
    "package.json",
    "package-lock.json",
    "src/data/lessons.ts",
    ...readdirSync("server")
      .filter((name) => /\.(py|ts)$/.test(name))
      .map((name) => "server/" + name),
    ...readdirSync("shared")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => "shared/" + name),
  ]
    .toSorted()
    .map((path) => ({ path, sha256: digest(readFileSync(path)) }));
  return { files, sha256: digest(JSON.stringify(files)) };
}
function runtime() {
  const python = execFileSync(
    process.env.VOICEVOX_PYTHON || resolve(".venv/bin/python"),
    [
      "-c",
      "import importlib.metadata as m,json,platform\nv={}\nfor p in ['mlx','mlx-lm','mlx-whisper','numpy','pyopenjtalk','voicevox-core']:\n try:v[p]=m.version(p)\n except m.PackageNotFoundError:v[p]=None\nprint(json.dumps({'python':platform.python_version(),'packages':v}))",
    ],
    { encoding: "utf8", timeout: 10_000 },
  );
  const root = resolve(process.env.SENSEI_LOCAL_ROOT || ".local/conversation");
  const models = ["chat-qwen3-14b", "whisper"].map((name) => ({
    name,
    manifests: [
      "config.json",
      "generation_config.json",
      "tokenizer_config.json",
    ]
      .filter((file) => existsSync(resolve(root, "models", name, file)))
      .map((file) => ({
        file,
        sha256: digest(readFileSync(resolve(root, "models", name, file))),
      })),
    weightHash: "not-measured",
  }));
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    python: JSON.parse(python),
    models,
  };
}

async function runTrial(
  provider: CancellableTutor,
  speech: NonNullable<ReturnType<typeof createLocalSpeech>>,
  dialogue: DialogueCase,
  turnIndex: number,
  input: DialogueInput,
  profile: LabGeneration,
  mode: Mode,
  signal: AbortSignal,
): Promise<Trial> {
  const turn = dialogue.turns[turnIndex]!;
  const row: Trial = {
    mode,
    dialogue: dialogue.id,
    turn: turn.id,
    turnIndex,
    profile,
    input,
    inputSha256: dialogueInputHash(input),
    status: "failed",
    path: "no-tutor",
    providerTurnCalls: 0,
    firstJapaneseAudioEmittedMs: null,
    responseDoneMs: null,
    respondReturnedMs: null,
    secondaryCallbacks: [],
    allObservedWorkSettledMs: null,
    totalJapaneseWaveMs: 0,
    estimatedLastWaveEndMs: null,
    estimatedListeningGateMs: null,
    estimatedHoldAfterLastWaveMs: null,
    finalTutor: null,
    events: [],
    checks: [],
    humanLinguisticReview: "pending",
  };
  const started = performance.now();
  const elapsed = () => round(performance.now() - started);
  const audio: { elapsedMs: number; durationMs: number }[] = [];
  const secondary: Promise<void>[] = [];
  let nextAudio = 0;
  const adapter: TutorProvider = {
    ...provider,
    turn: (body) => {
      row.providerTurnCalls++;
      return provider.labTurn(body, profile);
    },
  };
  const details =
    profile === "ja-first"
      ? (body: {
          japanese: string;
          history: DialogueHistory;
          signal: AbortSignal;
        }) => {
          if (row.firstJapaneseAudioEmittedMs === null || body.signal.aborted)
            return Promise.reject(new Error("secondary_not_allowed"));
          const workerMetrics = timingContext.getStore();
          const work = provider.labDetails(
            { japanese: body.japanese, history: body.history },
            body.signal,
          );
          secondary.push(
            work.then(
              () => {
                row.secondaryCallbacks.push({
                  settledMs: elapsed(),
                  status: "completed",
                  metrics: { ...workerMetrics },
                });
              },
              () => {
                row.secondaryCallbacks.push({
                  settledMs: elapsed(),
                  status: body.signal.aborted ? "cancelled" : "rejected",
                  metrics: { ...workerMetrics },
                });
              },
            ),
          );
          return work;
        }
      : undefined;
  const respond = createVoiceLabResponse(adapter, speech, { details });
  try {
    turnRequestSchema.parse(input);
    await respond({
      text: input.text,
      scenario: input.scenario,
      history: input.history,
      turn: turnIndex + 1,
      language: "auto",
      signal,
      emit(raw: VoiceLabReplyEvent) {
        const event = voiceLabReplySchema.parse(raw),
          elapsedMs = elapsed();
        if (event.type === "tutor") {
          if (row.finalTutor) throw new Error("duplicate_tutor");
          row.finalTutor = tutorReplySchema.parse(event.tutor);
        }
        if (event.type === "details") {
          if (
            !row.finalTutor ||
            row.finalTutor.correction ||
            !nextAudio ||
            event.japanese !== row.finalTutor.reply.japanese
          )
            throw new Error("secondary_changed_validated_target");
          row.finalTutor = {
            ...row.finalTutor,
            reply: { ...row.finalTutor.reply, french: event.french },
            coaching: event.coaching,
          };
        }
        if (event.type === "audio") {
          if (!row.finalTutor || event.index !== nextAudio++)
            throw new Error("audio_without_validated_tutor");
          const wav = Buffer.from(event.audio, "base64"),
            durationMs = japaneseWaveDurationMs(wav);
          row.firstJapaneseAudioEmittedMs ??= elapsedMs;
          row.totalJapaneseWaveMs = round(row.totalJapaneseWaveMs + durationMs);
          audio.push({ elapsedMs, durationMs });
          row.events.push({
            type: event.type,
            index: event.index,
            bytes: wav.length,
            durationMs,
            elapsedMs,
          });
        } else row.events.push({ ...event, elapsedMs });
        if (event.type === "response_done") row.responseDoneMs = elapsedMs;
      },
    });
    row.respondReturnedMs = elapsed();
    if (
      !row.finalTutor ||
      row.firstJapaneseAudioEmittedMs === null ||
      row.responseDoneMs === null
    )
      throw new Error("complete_validated_audio_response_required");
    row.status = "complete";
  } catch {
    row.respondReturnedMs ??= elapsed();
    row.failure = signal.aborted
      ? "experiment-stopped"
      : "inference-or-contract-failed";
  } finally {
    // Observe the real callback promise, not a timeout race. This serializes the
    // next cell after cleanup while keeping response_done separately measured.
    await Promise.allSettled(secondary);
    await sleep(0); // Allow the response callback's settlement metrics to publish.
    row.allObservedWorkSettledMs = elapsed();
    const gate = estimateListeningGate(audio, row.responseDoneMs);
    row.estimatedLastWaveEndMs = gate.lastWaveEndMs;
    row.estimatedListeningGateMs = gate.listeningGateMs;
    row.estimatedHoldAfterLastWaveMs = gate.holdAfterLastWaveMs;
    row.checks = inspectDialogueReply(dialogue, turn, row.finalTutor);
    row.path = dialogueResponsePath(row.finalTutor, row.providerTurnCalls);
  }
  return row;
}

export function dialogueResponsePath(
  tutor: TutorReply | null,
  providerTurnCalls: number,
): Trial["path"] {
  if (!tutor) return "no-tutor";
  if (tutor.correction) return "correction";
  if (tutor.assisted) return "assisted";
  if (tutor.practice) return "practice";
  return providerTurnCalls ? "generated" : "shared-response";
}

function profileSummary(rows: Trial[], mode: Mode, profile: LabGeneration) {
  const selected = rows.filter(
    (row) => row.mode === mode && row.profile === profile,
  );
  const summarize = (path: Trial["path"]) => {
    const matching = selected.filter((row) => row.path === path);
    const complete = matching.filter((row) => row.status === "complete");
    return {
      attempted: matching.length,
      completed: complete.length,
      failed: matching.filter((row) => row.status === "failed").length,
      firstJapaneseAudioEmitted: numericSummary(
        complete.map((row) => row.firstJapaneseAudioEmittedMs!),
      ),
      responseDone: numericSummary(complete.map((row) => row.responseDoneMs!)),
      allObservedWorkSettled: numericSummary(
        complete.map((row) => row.allObservedWorkSettledMs!),
      ),
      estimatedHoldAfterLastWave: numericSummary(
        complete
          .map((row) => row.estimatedHoldAfterLastWaveMs!)
          .filter((value) => value !== null),
      ),
      missingFrench: complete.filter(
        (row) => !row.finalTutor?.reply.french.trim(),
      ).length,
      secondaryCancelled: matching
        .flatMap((row) => row.secondaryCallbacks)
        .filter((item) => item.status === "cancelled").length,
      secondaryRejected: matching
        .flatMap((row) => row.secondaryCallbacks)
        .filter((item) => item.status === "rejected").length,
      checkCounts: Object.fromEntries(
        [
          ...new Set(
            matching.flatMap((row) => row.checks.map((check) => check.id)),
          ),
        ].map((id) => {
          const checks = matching
            .flatMap((row) => row.checks)
            .filter((check) => check.id === id);
          return [
            id,
            {
              examined: checks.length,
              flags: checks.filter((check) => check.status === "flag").length,
              kind: checks[0]!.kind,
            },
          ];
        }),
      ),
    };
  };
  return {
    attempted: selected.length,
    completed: selected.filter((row) => row.status === "complete").length,
    failed: selected.filter((row) => row.status === "failed").length,
    historiesResumedAfterFailure: selected.filter((row) => row.historyRecovery)
      .length,
    primaryComparisonPath: "generated",
    byPath: Object.fromEntries(
      (
        [
          "generated",
          "correction",
          "assisted",
          "practice",
          "shared-response",
          "no-tutor",
        ] as const
      ).map((path) => [path, summarize(path)]),
    ),
    humanLinguisticReview: "pending",
  };
}

export function dialoguePlan(args: string[]) {
  const profilesArg = args
    .find((value) => value.startsWith("--profiles="))
    ?.split("=")[1];
  const profileNames = profilesArg?.split(",") || [...DIALOGUE_PROFILES];
  if (
    !profileNames.length ||
    profileNames.some(
      (value) => !DIALOGUE_PROFILES.includes(value as LabGeneration),
    ) ||
    new Set(profileNames).size !== profileNames.length
  )
    throw new Error("invalid_profiles");
  const names = args
    .find((value) => value.startsWith("--case="))
    ?.split("=")[1]
    ?.split(",");
  if (
    names &&
    (!names.length ||
      names.some((name) => !dialogueCases.some((item) => item.id === name)))
  )
    throw new Error("invalid_cases");
  const cases = names
    ? dialogueCases.filter((item) => names.includes(item.id))
    : dialogueCases;
  if (args.includes("--paired-only") && args.includes("--rollout-only"))
    throw new Error("choose_one_mode");
  const modes: Mode[] = args.includes("--paired-only")
    ? ["paired"]
    : args.includes("--rollout-only")
      ? ["rollout"]
      : ["paired", "rollout"];
  const profiles = DIALOGUE_PROFILES.filter((profile) =>
    profileNames.includes(profile),
  );
  const paired = modes.includes("paired")
    ? cases.reduce((n, item) => n + item.turns.length, 0) * profiles.length
    : 0;
  const rollouts = modes.includes("rollout")
    ? cases
        .filter((item) => item.rollout)
        .reduce((n, item) => n + item.turns.length, 0) * profiles.length
    : 0;
  if (!paired && !rollouts) throw new Error("empty_plan");
  return {
    cases,
    profiles,
    modes,
    pairedResponses: paired,
    rolloutResponses: rollouts,
  };
}

function selfCheck() {
  for (const item of dialogueCases)
    for (const [index] of item.turns.entries())
      turnRequestSchema.parse(pairedDialogueInput(item, index));
  const plan = dialoguePlan([]);
  assert.equal(plan.pairedResponses, 60);
  assert.equal(plan.rolloutResponses, 48);
  assert.equal(numericSummary([4, 1, 3, 2]).medianMs, 2.5);
  assert.equal(
    estimateListeningGate([{ elapsedMs: 10, durationMs: 200 }], 100)
      .holdAfterLastWaveMs,
    0,
  );
  assert.equal(
    estimateListeningGate([{ elapsedMs: 10, durationMs: 200 }], 300)
      .holdAfterLastWaveMs,
    90,
  );
  assert.deepEqual(rotateProfiles(DIALOGUE_PROFILES, 1), [
    "compact",
    "ja-first",
    "structured",
  ]);
  process.stdout.write(
    "Corpus and deterministic timing checks passed; no model, microphone or server started.\n",
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) {
    selfCheck();
    return;
  }
  const plan = dialoguePlan(args);
  if (args.includes("--dry-run")) {
    process.stdout.write(
      JSON.stringify({
        status: "plan-only",
        modelLaunched: false,
        cases: plan.cases.map((item) => item.id),
        profiles: plan.profiles,
        modes: plan.modes,
        pairedResponses: plan.pairedResponses,
        rolloutResponses: plan.rolloutResponses,
        humanData: false,
      }) + "\n",
    );
    return;
  }
  const destinationArg = args.find((value) => !value.startsWith("--"));
  if (!destinationArg || !args.includes("--exclusive"))
    throw new Error("private_destination_and_exclusive_required");
  const destination = resolve(destinationArg);
  privateDialogueOutput(destination);
  const snapshot = sources(),
    versions = runtime();
  const local = createLocalTutor(),
    speech = createLocalSpeech({ cacheAudio: false });
  if (!local || !speech) {
    local?.close();
    speech?.close();
    throw new Error("local_engines_required");
  }
  const provider: CancellableTutor = local;
  const stop = new AbortController();
  const close = () => {
    stop.abort();
    provider.close();
    speech.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  let status = "running",
    created = false;
  const rows: Trial[] = [],
    warmups: Trial[] = [];
  const save = () => {
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(
      destination,
      JSON.stringify(
        {
          schemaVersion: 1,
          date: new Date().toISOString(),
          status,
          sourceSnapshot: snapshot,
          runtime: versions,
          audioCache: false,
          plan: {
            cases: plan.cases.map((item) => item.id),
            profiles: plan.profiles,
            modes: plan.modes,
            pairedResponses: plan.pairedResponses,
            rolloutResponses: plan.rolloutResponses,
          },
          data: "Authored public fictional conversations; no human voice, ASR or personal reference.",
          definitions: {
            paired:
              "Identical authored history and learner text for every compared profile; hashes permit direct verification.",
            rollout:
              "Same scripted learner lines but each profile appends its own emitted tutor. Contexts diverge. A scripted line may not answer that profile's actual preceding question; inspect the full chain.",
            firstJapaneseAudioEmittedMs:
              "Recognized authored text to first complete validated WAV, excluding capture, ASR, transport and playback.",
            responseDoneMs:
              "Observed server permission to finish response delivery; client also waits for its audio queue.",
            respondReturnedMs:
              "Return of the response function; does not imply secondary work has settled.",
            allObservedWorkSettledMs:
              "Return plus observed real details callbacks settled and their microtask metrics published. Not a GPU-idle measurement.",
            estimatedListeningGateMs:
              "Ideal sequential WAV playback from arrival times, gated by response_done; no network, decode, Android player or human observation.",
            estimatedHoldAfterLastWaveMs:
              "Positive response_done minus ideal last WAV end. Secondary delay risk estimate, not actual microphone latency.",
            checks:
              "Mechanical expectations and lexical warning patterns; no automatic Japanese, translation or conversational correctness verdict.",
          },
          corpus: plan.cases,
          warmups,
          rows,
          summary: Object.fromEntries(
            plan.modes.map((mode) => [
              mode,
              Object.fromEntries(
                plan.profiles.map((profile) => [
                  profile,
                  profileSummary(rows, mode, profile),
                ]),
              ),
            ]),
          ),
          humanLinguisticReview: "pending",
          humanVoiceValidation: "postponed",
          productionSelection: "unchanged",
          resources: {
            nodeRssBytes: process.memoryUsage().rss,
            workerRss: "not-measured",
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
  const running = () => {
    if (stop.signal.aborted) throw new Error("experiment_stopped");
  };
  try {
    const loadAt = performance.now();
    while (!provider.ready()) {
      running();
      if (performance.now() - loadAt > 120_000)
        throw new Error("startup_timeout");
      await sleep(100);
    }
    const warmCase = dialogueCases[1]!;
    for (const profile of plan.profiles) {
      running();
      warmups.push(
        await runTrial(
          provider,
          speech,
          warmCase,
          0,
          pairedDialogueInput(warmCase, 0),
          profile,
          "paired",
          stop.signal,
        ),
      );
    }
    save();
    if (plan.modes.includes("paired"))
      for (const [caseIndex, item] of plan.cases.entries())
        for (const [turnIndex] of item.turns.entries()) {
          const input = pairedDialogueInput(item, turnIndex);
          for (const profile of rotateProfiles(
            plan.profiles,
            caseIndex + turnIndex,
          )) {
            running();
            rows.push(
              await runTrial(
                provider,
                speech,
                item,
                turnIndex,
                structuredClone(input),
                profile,
                "paired",
                stop.signal,
              ),
            );
            save();
            process.stdout.write(
              "paired " +
                item.id +
                " turn=" +
                turnIndex +
                " profile=" +
                profile +
                " status=" +
                rows.at(-1)!.status +
                "\n",
            );
            if (!provider.ready()) throw new Error("engine_stopped");
          }
        }
    if (plan.modes.includes("rollout"))
      for (const [caseIndex, item] of plan.cases
        .filter((entry) => entry.rollout)
        .entries()) {
        const histories = new Map(
          plan.profiles.map((profile) => [
            profile,
            structuredClone(item.initialHistory),
          ]),
        );
        const priorFailures = new Map(
          plan.profiles.map((profile) => [profile, [] as string[]]),
        );
        for (const [turnIndex, turn] of item.turns.entries())
          for (const profile of rotateProfiles(
            plan.profiles,
            caseIndex + turnIndex,
          )) {
            running();
            const input: DialogueInput = {
              scenario: item.scenario,
              text: turn.text,
              history: structuredClone(histories.get(profile)!),
            };
            const row = await runTrial(
              provider,
              speech,
              item,
              turnIndex,
              input,
              profile,
              "rollout",
              stop.signal,
            );
            const failed = priorFailures.get(profile)!;
            if (failed.length)
              row.historyRecovery = {
                strategy: "unchanged-last-successful-history",
                afterFailures: [...failed],
              };
            rows.push(row);
            if (row.status === "complete" && row.finalTutor) {
              histories.set(
                profile,
                appendDialogueHistory(
                  input.history,
                  input.text,
                  row.finalTutor,
                ),
              );
              priorFailures.set(profile, []);
            } else {
              // The next authored learner line is still tried against the last
              // successful transcript, never a fictitious assistant fallback.
              priorFailures.set(profile, [...failed, turn.id]);
            }
            save();
            process.stdout.write(
              "rollout " +
                item.id +
                " turn=" +
                turnIndex +
                " profile=" +
                profile +
                " status=" +
                rows.at(-1)!.status +
                "\n",
            );
            if (!provider.ready()) throw new Error("engine_stopped");
          }
      }
    status = "complete";
    save();
  } catch {
    status = "incomplete";
    save();
    throw new Error("experiment_incomplete");
  } finally {
    process.removeListener("SIGINT", close);
    process.removeListener("SIGTERM", close);
    close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    process.stderr.write(
      "Dialogue benchmark incomplete. Inspect its private report; no human validation is implied.\n",
    );
    process.exitCode = 1;
  });
