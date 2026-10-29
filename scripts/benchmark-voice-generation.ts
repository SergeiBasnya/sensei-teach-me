// Explicit synthetic experiment only. No human corpus or production configuration.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { tutorReplySchema, type TutorReply } from "../shared/contracts";
import type { VoiceLabReplyEvent } from "../shared/voice-lab";
import { createLocalTutor, type LocalTutor } from "../server/local-tutor";
import type { TutorProvider } from "../server/app";
import { createLocalSpeech, type SpeechProvider } from "../server/local-speech";
import { createVoiceLabAsr } from "../server/voice-lab-asr";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import type { VoiceLabRespond } from "../server/voice-lab";
import { timingContext } from "../server/timing";

type Generation = "structured" | "compact" | "ja-first";
type TutorInput = Parameters<TutorProvider["turn"]>[0];
type History = TutorInput["history"];
type Details = { french: string; coaching?: string | null };
// Optional capability is checked before a ja-first experiment starts. Keeping
// the adapter local avoids changing the public production TutorProvider type.
type BenchmarkTutor = LocalTutor & {
  labTurn(input: TutorInput, generation?: Generation): Promise<TutorReply>;
  labDetails?: (input: {
    japanese: string;
    history: History;
  }) => Promise<Details>;
};
type ResponseFactory = (
  provider: TutorProvider,
  speech: SpeechProvider,
  options?: {
    details?: (input: {
      japanese: string;
      history: History;
      signal: AbortSignal;
    }) => Promise<Details>;
  },
) => VoiceLabRespond;
const responseFactory: ResponseFactory = createVoiceLabResponse;
const PROFILES: readonly Generation[] = ["structured", "compact", "ja-first"];
const FIXTURES = [
  {
    id: "identity",
    scenario: "meet",
    lessonId: "meet-name",
    question: "お名前は？",
    text: "私はオーギュストです。",
    file: "cb0412a327921b1a150b.wav",
  },
  {
    id: "origin",
    scenario: "meet",
    lessonId: "meet-origin",
    question: "どこから来ましたか？",
    text: "フランスから来ました。",
    file: "109e155eca21856c868a.wav",
  },
  {
    id: "likes",
    scenario: "meet",
    lessonId: "meet-likes",
    question: "日本語は好きですか？",
    text: "はい、日本語が好きです。",
    file: "cdbbfef81b23fcb88885.wav",
  },
  {
    id: "order",
    scenario: "cafe",
    lessonId: "cafe-order",
    question: "何にしますか？",
    text: "コーヒーを一つください。",
    file: "fc48f4733aae10f420d6.wav",
  },
  {
    id: "temperature",
    scenario: "cafe",
    lessonId: "cafe-choice",
    question: "ホットですか、アイスですか？",
    text: "ホットでお願いします。",
    file: "a39332e0aafc35578065.wav",
  },
  {
    id: "destination",
    scenario: "station",
    lessonId: "station-destination",
    question: "どちらまでですか？",
    text: "京都までお願いします。",
    file: "2d738f422a192c578a24.wav",
  },
] as const;
type Fixture = (typeof FIXTURES)[number];
type Prepared = Fixture & { pcm: Buffer; audioMs: number; pcmSha256: string };
type Interval = { startMs: number; endMs: number };
type AsrSample = Interval & {
  roundtripMs: number;
  metrics: Record<string, number>;
  transcript: string;
  uncertain: boolean;
};
const SOURCE_FILES = [
  "scripts/benchmark-voice-generation.ts",
  "package.json",
  "package-lock.json",
  "server/app.ts",
  "server/local-tutor.ts",
  "server/conversation_worker.py",
  "server/conversation_feedback.py",
  "server/pedagogic_romaji.py",
  "server/linguistic_support.py",
  "server/conversation_context.py",
  "server/lab_generation.py",
  "server/llm_stream_trace.py",
  "server/local-speech.ts",
  "server/voice_worker.py",
  "server/voice-lab-asr.ts",
  "server/voice_lab_worker.py",
  "server/voice-lab-response.ts",
  "server/voice-lab.ts",
  "shared/voice-lab.ts",
];
const rounded = (value: number) => Math.round(value * 10) / 10;
const overlap = (a: Interval, b: Interval) =>
  Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
function ordered<T>(
  items: readonly T[],
  offset: number,
  reverse: boolean,
): T[] {
  const position = ((offset % items.length) + items.length) % items.length;
  const values = [...items.slice(position), ...items.slice(0, position)];
  return reverse ? values.reverse() : values;
}
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: sorted.length,
    meanMs: sorted.length
      ? rounded(sorted.reduce((sum, x) => sum + x, 0) / sorted.length)
      : null,
    medianMs: sorted.length
      ? rounded(
          sorted.length % 2
            ? sorted[middle]!
            : (sorted[middle - 1]! + sorted[middle]!) / 2,
        )
      : null,
    minMs: sorted.length ? rounded(sorted[0]!) : null,
    maxMs: sorted.length ? rounded(sorted.at(-1)!) : null,
  };
}
function privateOutput(path: string) {
  let parent = dirname(path);
  while (!existsSync(parent) && parent !== dirname(parent))
    parent = dirname(parent);
  const canonical = resolve(realpathSync(parent), relative(parent, path));
  const git = spawnSync(
    "git",
    ["-C", dirname(canonical), "rev-parse", "--show-toplevel"],
    { encoding: "utf8" },
  );
  // If the final parent does not exist yet, ask Git from the nearest existing one.
  const fallback =
    git.status === 0
      ? git
      : spawnSync(
          "git",
          ["-C", realpathSync(parent), "rev-parse", "--show-toplevel"],
          { encoding: "utf8" },
        );
  if (git.error || fallback.error) throw new Error("privacy_check_unavailable");
  if (fallback.status === 0) {
    const repo = fallback.stdout.trim(),
      item = relative(repo, canonical);
    const tracked = spawnSync("git", [
      "-C",
      repo,
      "ls-files",
      "--error-unmatch",
      "--",
      item,
    ]);
    const ignored = spawnSync("git", [
      "-C",
      repo,
      "check-ignore",
      "--quiet",
      "--",
      item,
    ]);
    if (tracked.status === 0 || ignored.status !== 0)
      throw new Error("private_output_required");
  }
  if (existsSync(path)) throw new Error("fresh_output_required");
}
function prepare(item: Fixture): Prepared {
  const source = readFileSync(`assets/speech/${item.file}`);
  const pcm = execFileSync(
    process.env.VOICEVOX_PYTHON || resolve(".venv/bin/python"),
    [
      "-c",
      [
        "import subprocess,sys,imageio_ffmpeg",
        "p=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-v','error','-i','pipe:0','-ac','1','-ar','16000','-f','s16le','-acodec','pcm_s16le','pipe:1'],input=sys.stdin.buffer.read(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=15)",
        "sys.stdout.buffer.write(p.stdout)",
      ].join("\n"),
    ],
    { input: source, timeout: 20_000, maxBuffer: 2_000_000 },
  );
  if (pcm.length % 2 || pcm.length < 3200 || pcm.length > 1_440_000)
    throw new Error("invalid_synthetic_pcm");
  return {
    ...item,
    pcm,
    audioMs: pcm.length / 32,
    pcmSha256: createHash("sha256").update(pcm).digest("hex"),
  };
}
function inputFor(item: Fixture): TutorInput {
  return {
    scenario: item.scenario,
    lessonId: item.lessonId,
    history: [{ role: "assistant", content: item.question }],
    text: item.text,
  };
}
function sourceSnapshot() {
  const missing = SOURCE_FILES.filter((path) => !existsSync(path));
  const files = SOURCE_FILES.filter((path) => existsSync(path)).map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  }));
  return {
    files,
    missing,
    sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
  };
}
function runtimeSnapshot() {
  // Metadata only: do not import inference libraries or load model weights.
  const python = execFileSync(
    process.env.VOICEVOX_PYTHON || resolve(".venv/bin/python"),
    [
      "-c",
      [
        "import importlib.metadata as m,json,platform",
        "versions={}",
        "for package in ['mlx','mlx-lm','mlx-whisper','numpy','imageio-ffmpeg','pyopenjtalk','voicevox-core']:",
        " try: versions[package]=m.version(package)",
        " except m.PackageNotFoundError: versions[package]=None",
        "print(json.dumps({'python':platform.python_version(),'packages':versions}))",
      ].join("\n"),
    ],
    { timeout: 10_000, maxBuffer: 10_000, encoding: "utf8" },
  );
  const root = resolve(process.env.SENSEI_LOCAL_ROOT || ".local/conversation");
  const models = [
    ["qwen", resolve(root, "models/chat-qwen3-14b")],
    ["whisper-tutor", resolve(root, "models/whisper")],
    [
      "whisper-load",
      resolve(
        process.env.SENSEI_LAB_WHISPER_MODEL || resolve(root, "models/whisper"),
      ),
    ],
  ].map(([id, path]) => ({
    id,
    manifests: [
      "config.json",
      "generation_config.json",
      "tokenizer_config.json",
    ]
      .filter((file) => existsSync(resolve(path!, file)))
      .map((file) => ({
        file,
        sha256: createHash("sha256")
          .update(readFileSync(resolve(path!, file)))
          .digest("hex"),
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
function selfCheck() {
  assert.equal(
    overlap({ startMs: 0, endMs: 100 }, { startMs: 100, endMs: 200 }),
    0,
  );
  assert.equal(
    overlap({ startMs: 0, endMs: 200 }, { startMs: 50, endMs: 150 }),
    100,
  );
  assert.equal(
    overlap({ startMs: 100, endMs: 300 }, { startMs: 0, endMs: 200 }),
    100,
  );
  assert.deepEqual(ordered(PROFILES, 1, false), [
    "compact",
    "ja-first",
    "structured",
  ]);
  assert.deepEqual(ordered(PROFILES, 1, true), [
    "structured",
    "ja-first",
    "compact",
  ]);
  assert.equal(summary([]).medianMs, null);
  assert.equal(summary([4, 1, 3, 2]).medianMs, 2.5);
  assert.equal(summary([2, 1, 3]).medianMs, 2);
  process.stdout.write(
    "8 deterministic checks passed; no model, microphone or server started.\n",
  );
}

async function main() {
  if (process.argv.includes("--self-check")) {
    selfCheck();
    return;
  }
  const destinationArgument = process.argv
    .slice(2)
    .find((value) => !value.startsWith("--"));
  const scope =
    process.argv.find((value) => value.startsWith("--scope="))?.split("=")[1] ||
    "all";
  const rounds = Number(
    process.argv
      .find((value) => value.startsWith("--rounds="))
      ?.split("=")[1] || 2,
  );
  const contentionChoice =
    process.argv
      .find((value) => value.startsWith("--contention-profiles="))
      ?.split("=")[1] || "structured";
  const contentionProfiles =
    contentionChoice === "all" ? PROFILES : (["structured"] as const);
  if (
    !["contracts", "contention", "all"].includes(scope) ||
    ![1, 2, 3].includes(rounds) ||
    !["structured", "all"].includes(contentionChoice)
  )
    throw new Error("invalid_plan");
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(
      JSON.stringify({
        status: "plan-only",
        modelLaunched: false,
        scope,
        rounds,
        profiles: PROFILES,
        fixtures: FIXTURES.map((value) => value.id),
        contentionProfiles,
        cadencesMs: [1000, 0],
        humanData: false,
      }) + "\n",
    );
    return;
  }
  if (!destinationArgument || !process.argv.includes("--exclusive"))
    throw new Error("destination_and_exclusive_required");
  const destination = resolve(destinationArgument);
  privateOutput(destination);
  const sources = sourceSnapshot();
  if (sources.missing.length) throw new Error("prototype_sources_missing");
  const runtime = runtimeSnapshot();
  const prepared = FIXTURES.map(prepare);
  const loaded = createLocalTutor();
  const speech = createLocalSpeech({ cacheAudio: false });
  if (!loaded || !speech) {
    loaded?.close();
    speech?.close();
    throw new Error("local_engines_required");
  }
  const provider: BenchmarkTutor = loaded;
  if (scope !== "contention" && typeof provider.labDetails !== "function") {
    provider.close();
    speech.close();
    throw new Error("secondary_capability_required");
  }
  const asr = createVoiceLabAsr();
  const stop = new AbortController();
  const stopEngines = () => {
    stop.abort();
    asr.close();
    provider.close();
    speech.close();
  };
  process.once("SIGINT", stopEngines);
  process.once("SIGTERM", stopEngines);
  const contractResults: Record<string, unknown>[] = [];
  const contentionResults: Record<string, unknown>[] = [];
  const warmups: Record<string, unknown>[] = [];
  const started = performance.now();
  let readyMs = 0;
  let status = "running";
  let outputCreated = false;
  const save = () => {
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(
      destination,
      JSON.stringify(
        {
          schemaVersion: 1,
          date: new Date().toISOString(),
          status,
          scope,
          rounds,
          contentionProfiles,
          sourceSnapshot: sources,
          runtime,
          readyMs,
          data: "Six public synthetic VOICEVOX fixtures and their authored Japanese; no human voice or reference.",
          audioCache: false,
          definitions: {
            firstJapaneseAudioEmittedMs:
              "From an already recognized authored text entering the response function until its first complete validated Japanese WAV is emitted; not transport, playback, VAD tail or human end of speech.",
            generationOnlyMs:
              "Wall time of labTurn, including grammatical check and selected complete output contract; no TTS or secondary request.",
            overlapMs:
              "Intersection of ASR and Qwen request wall-time windows; not a measurement of simultaneous GPU kernels.",
            contention:
              "Controlled two-process workload; normal single-client lab currently serializes ASR and respond. This does not establish that the stress occurs in production.",
          },
          resources: {
            nodeRssBytes: process.memoryUsage().rss,
            childProcessRss: "not-measured",
            gpuMemory: "not-measured",
            energy: "not-measured",
          },
          fixtures: prepared.map(({ pcm: _pcm, ...item }) => item),
          warmups,
          contractResults,
          contentionResults,
          summary: Object.fromEntries(
            PROFILES.map((profile) => [
              profile,
              summary(
                contractResults
                  .filter(
                    (row) =>
                      row.profile === profile &&
                      row.round === rounds - 1 &&
                      row.status === "complete" &&
                      typeof row.firstJapaneseAudioEmittedMs === "number",
                  )
                  .map((row) => row.firstJapaneseAudioEmittedMs as number),
              ),
            ]),
          ),
          humanLinguisticReview: "pending",
          mechanicalContractChecksOnly: true,
          humanRecognition: "pending-corpus",
          humanPlayback: "pending",
          productionSelection: "unchanged",
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: outputCreated ? "w" : "wx" },
    );
    outputCreated = true;
  };
  const assertRunning = () => {
    if (stop.signal.aborted) throw new Error("experiment_cancelled");
  };
  try {
    while (!provider.ready()) {
      assertRunning();
      if (performance.now() - started > 120_000)
        throw new Error("startup_timeout");
      await sleep(100);
    }
    readyMs = rounded(performance.now() - started);
    const warm = performance.now();
    await provider.labTurn(inputFor(prepared[1]!), "structured");
    await speech.speak("こんにちは。", "ja");
    warmups.push({
      kind: "qwen-and-japanese-tts",
      ms: rounded(performance.now() - warm),
    });
    save();

    if (scope !== "contention") {
      for (let round = 0; round < rounds; round++)
        for (const [caseIndex, item] of prepared.entries())
          for (const profile of ordered(
            PROFILES,
            caseIndex + round,
            round % 2 === 1,
          )) {
            assertRunning();
            const row: Record<string, unknown> = {
              id: item.id,
              round,
              profile,
              inputSource: "authored-public-fixture",
            };
            const events: Record<string, unknown>[] = [];
            const runAt = performance.now();
            let firstAudio: number | undefined,
              tutorSeen = false,
              validatedJapanese = "";
            const adapter: TutorProvider = {
              ...provider,
              turn: (input) =>
                provider.labTurn(
                  { ...input, lessonId: item.lessonId },
                  profile,
                ),
            };
            const details =
              profile === "ja-first"
                ? async (input: {
                    japanese: string;
                    history: History;
                    signal: AbortSignal;
                  }) => {
                    if (input.signal.aborted || firstAudio === undefined)
                      throw new Error("secondary_before_validated_audio");
                    return provider.labDetails!({
                      japanese: input.japanese,
                      history: input.history,
                    });
                  }
                : undefined;
            const respond = responseFactory(adapter, speech, { details });
            try {
              await respond({
                text: item.text,
                turn: 1,
                language: "auto",
                scenario: item.scenario,
                history: inputFor(item).history,
                signal: stop.signal,
                emit(event: VoiceLabReplyEvent) {
                  const elapsedMs = rounded(performance.now() - runAt);
                  if (event.type === "tutor") {
                    if (tutorSeen) throw new Error("duplicate_validated_tutor");
                    tutorReplySchema.parse(event.tutor);
                    tutorSeen = true;
                    validatedJapanese = event.tutor.reply.japanese;
                  }
                  const candidate: unknown = event;
                  if (
                    candidate &&
                    typeof candidate === "object" &&
                    "type" in candidate &&
                    candidate.type === "details"
                  ) {
                    if (
                      !tutorSeen ||
                      !("japanese" in candidate) ||
                      candidate.japanese !== validatedJapanese
                    )
                      throw new Error("secondary_changed_japanese");
                  }
                  if (event.type === "audio") {
                    if (!tutorSeen)
                      throw new Error("audio_before_validated_tutor");
                    const audio = Buffer.from(event.audio, "base64");
                    if (
                      audio.subarray(0, 4).toString() !== "RIFF" ||
                      audio.subarray(8, 12).toString() !== "WAVE"
                    )
                      throw new Error("invalid_japanese_wav");
                    firstAudio ??= elapsedMs;
                    events.push({
                      type: "audio",
                      index: event.index,
                      bytes: audio.length,
                      elapsedMs,
                    });
                  } else events.push({ ...event, elapsedMs });
                },
              });
              if (!tutorSeen || firstAudio === undefined)
                throw new Error("validated_japanese_audio_required");
              row.status = "complete";
            } catch {
              row.status = "failed";
              row.failure = "inference-or-contract-failed";
              if (!provider.ready() || stop.signal.aborted)
                throw new Error("engines_stopped");
            } finally {
              row.firstJapaneseAudioEmittedMs = firstAudio ?? null;
              row.responseCompleteMs = rounded(performance.now() - runAt);
              row.events = events;
              contractResults.push(row);
              save();
              process.stdout.write(
                `contract ${item.id} profile=${profile} round=${round} status=${row.status}\n`,
              );
            }
          }
    }

    if (scope !== "contracts") {
      const asrWarmAt = performance.now();
      await asr.transcribe(prepared[1]!.pcm, {
        language: "auto",
        partial: true,
        signal: stop.signal,
      });
      warmups.push({
        kind: "separate-asr",
        ms: rounded(performance.now() - asrWarmAt),
      });
      const selected = [prepared[1]!, prepared[3]!, prepared[5]!];
      const transcribe = async (
        item: Prepared,
        origin: number,
      ): Promise<AsrSample> => {
        const startMs = performance.now() - origin;
        const result = await asr.transcribe(item.pcm, {
          language: "auto",
          partial: true,
          signal: stop.signal,
        });
        const endMs = performance.now() - origin;
        return {
          startMs: rounded(startMs),
          endMs: rounded(endMs),
          roundtripMs: rounded(endMs - startMs),
          metrics: result.metrics,
          transcript: result.text,
          uncertain: result.uncertain,
        };
      };
      for (let round = 0; round < rounds; round++)
        for (const [caseIndex, item] of selected.entries())
          for (const profile of contentionProfiles)
            for (const cadence of ordered(
              [-1, 1000, 0],
              caseIndex + round,
              round % 2 === 1,
            )) {
              assertRunning();
              const origin = performance.now(),
                samples: AsrSample[] = [];
              let loadStopped = false,
                maxReached = false,
                loadFailed = false;
              const sleepStop = new AbortController();
              const load =
                cadence < 0
                  ? Promise.resolve()
                  : (async () => {
                      const loadAt = performance.now();
                      while (
                        !loadStopped &&
                        !stop.signal.aborted &&
                        samples.length < 40 &&
                        performance.now() - loadAt < 20_000
                      ) {
                        const sample = await transcribe(item, origin);
                        samples.push(sample);
                        if (loadStopped || stop.signal.aborted) break;
                        if (cadence > 0)
                          await sleep(
                            Math.max(
                              0,
                              origin +
                                sample.startMs +
                                cadence -
                                performance.now(),
                            ),
                            undefined,
                            { signal: sleepStop.signal },
                          ).catch(() => undefined);
                      }
                      maxReached = !loadStopped && !stop.signal.aborted;
                    })().catch(() => {
                      loadFailed = true;
                      loadStopped = true;
                    });
              const qwenStart = performance.now() - origin;
              const metrics: Record<string, number> = {};
              let output: TutorReply | undefined;
              let failure: string | undefined;
              try {
                output = await timingContext.run(metrics, () =>
                  provider.labTurn(inputFor(item), profile),
                );
              } catch {
                failure = "inference-or-contract-failed";
              }
              const qwenEnd = performance.now() - origin;
              loadStopped = true;
              sleepStop.abort();
              await load; // No abandoned ASR or queued requests may leak into the next cell.
              if (loadFailed) failure = "asr-load-failed";
              const window = { startMs: qwenStart, endMs: qwenEnd };
              const covered = samples.reduce(
                (sum, sample) => sum + overlap(window, sample),
                0,
              );
              const idleSamples: AsrSample[] = [];
              // Match the observed number of ASR calls, without Qwen. Kept separate:
              // post-load order and thermal/cache effects are not randomized away.
              for (
                let index = 0;
                !loadFailed && index < samples.length;
                index++
              ) {
                assertRunning();
                idleSamples.push(await transcribe(item, origin));
              }
              contentionResults.push({
                id: item.id,
                round,
                profile,
                cadenceMs: cadence < 0 ? null : cadence,
                condition:
                  cadence < 0
                    ? "qwen-only"
                    : cadence
                      ? "asr-cadenced-during-qwen"
                      : "asr-continuous-stress-during-qwen",
                status: failure ? "failed" : "complete",
                failure,
                generationOnlyMs: rounded(qwenEnd - qwenStart),
                qwenWindow: {
                  startMs: rounded(qwenStart),
                  endMs: rounded(qwenEnd),
                },
                metrics,
                tutor: output,
                asrRequestWindows: samples,
                asrOnlyMatchedWindows: idleSamples,
                asrRequestCount: samples.length,
                asrOverlappingRequests: samples.filter(
                  (sample) => overlap(window, sample) > 0,
                ).length,
                requestOverlapMs: rounded(covered),
                requestOverlapFraction:
                  qwenEnd > qwenStart
                    ? Math.round((covered / (qwenEnd - qwenStart)) * 1000) /
                      1000
                    : 0,
                asrWithQwen: summary(
                  samples
                    .filter((sample) => overlap(window, sample) > 0)
                    .map((sample) => sample.roundtripMs),
                ),
                asrWithoutQwen: summary(
                  idleSamples.map((sample) => sample.roundtripMs),
                ),
                loadMaxReached: maxReached,
                loadLimits: { calls: 40, ms: 20_000 },
                pendingAsrAtCellEnd: 0,
              });
              save();
              process.stdout.write(
                `contention ${item.id} profile=${profile} round=${round} cadence=${cadence} asr=${samples.length}\n`,
              );
              if (!provider.ready() || stop.signal.aborted || loadFailed)
                throw new Error("engines_stopped");
            }
    }
    status = "complete";
    save();
  } catch {
    status = "incomplete";
    save();
    throw new Error("benchmark_incomplete");
  } finally {
    process.removeListener("SIGINT", stopEngines);
    process.removeListener("SIGTERM", stopEngines);
    stopEngines();
  }
}
void main().catch(() => {
  // Private paths, generated text, tokens and low-level exceptions stay out of logs.
  process.stderr.write(
    "Benchmark not completed. Check arguments and the private report, if created.\n",
  );
  process.exitCode = 1;
});
