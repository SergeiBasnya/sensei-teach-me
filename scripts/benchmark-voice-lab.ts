// Opt-in synthetic comparison. Importing factories does not start this experiment;
// the CLI below must be invoked explicitly with a destination argument.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { WebSocket } from "ws";
import { createApp, type TutorProvider } from "../server/app";
import { createLocalTutor } from "../server/local-tutor";
import { createLocalSpeech } from "../server/local-speech";
import { createVoiceLab } from "../server/voice-lab";
import { createVoiceLabAsr } from "../server/voice-lab-asr";
import { createVoiceLabResponse } from "../server/voice-lab-response";
import { pcmWav } from "../server/voice-lab-samples";
import {
  VOICE_LAB,
  voiceLabServerSchema,
  voiceLabTicketSchema,
  type VoiceLabServerEvent,
} from "../shared/voice-lab";
import {
  oralResponseSchema,
  type LessonId,
  type ScenarioId,
} from "../shared/contracts";

type Fixture = {
  id: string;
  scenario: ScenarioId;
  lessonId: LessonId;
  question: string;
  file: string;
};
const fixtures: readonly Fixture[] = [
  {
    id: "identity",
    scenario: "meet",
    lessonId: "meet-name",
    question: "お名前は？",
    file: "cb0412a327921b1a150b.wav",
  },
  {
    id: "origin",
    scenario: "meet",
    lessonId: "meet-origin",
    question: "どこから来ましたか？",
    file: "109e155eca21856c868a.wav",
  },
  {
    id: "likes",
    scenario: "meet",
    lessonId: "meet-likes",
    question: "日本語は好きですか？",
    file: "cdbbfef81b23fcb88885.wav",
  },
  {
    id: "order",
    scenario: "cafe",
    lessonId: "cafe-order",
    question: "何にしますか？",
    file: "fc48f4733aae10f420d6.wav",
  },
  {
    id: "temperature",
    scenario: "cafe",
    lessonId: "cafe-choice",
    question: "ホットですか、アイスですか？",
    file: "a39332e0aafc35578065.wav",
  },
  {
    id: "destination",
    scenario: "station",
    lessonId: "station-destination",
    question: "どちらまでですか？",
    file: "2d738f422a192c578a24.wav",
  },
];
const pause = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, Math.max(0, ms)));

function requirePrivateOutput(destination: string) {
  let parent = dirname(destination);
  while (!existsSync(parent) && parent !== dirname(parent))
    parent = dirname(parent);
  const root = spawnSync(
    "git",
    ["-C", parent, "rev-parse", "--show-toplevel"],
    { encoding: "utf8" },
  );
  if (root.error) throw new Error("Git privacy check unavailable");
  if (root.status !== 0) return;
  const repo = root.stdout.trim(),
    path = relative(repo, destination);
  const tracked = spawnSync("git", [
    "-C",
    repo,
    "ls-files",
    "--error-unmatch",
    "--",
    path,
  ]);
  const ignored = spawnSync("git", [
    "-C",
    repo,
    "check-ignore",
    "--quiet",
    "--",
    path,
  ]);
  if (tracked.status === 0 || ignored.status !== 0)
    throw new Error("Choose an ignored or external private output path");
}

function prepare(item: Fixture) {
  const original = readFileSync(`assets/speech/${item.file}`);
  // One conversion per fixture, reused byte-for-byte by both paths. No new model.
  const pcm = execFileSync(
    process.env.VOICEVOX_PYTHON || resolve(".venv/bin/python"),
    [
      "-c",
      [
        "import subprocess,sys,imageio_ffmpeg",
        "source=sys.stdin.buffer.read()",
        "result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-v','error','-i','pipe:0','-ac','1','-ar','16000','-f','s16le','-acodec','pcm_s16le','pipe:1'],input=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=15)",
        "sys.stdout.buffer.write(result.stdout)",
      ].join("\n"),
    ],
    { input: original, maxBuffer: 2_000_000, timeout: 20_000 },
  );
  const wav = pcmWav(pcm);
  return {
    ...item,
    pcm,
    wav,
    audioMs: pcm.length / 32,
    originalSha256: createHash("sha256").update(original).digest("hex"),
    pcmSha256: createHash("sha256").update(pcm).digest("hex"),
  };
}
type Prepared = ReturnType<typeof prepare>;

async function classic(base: string, token: string, item: Prepared) {
  const encodedAt = performance.now();
  const body = JSON.stringify({
    scenario: item.scenario,
    lessonId: item.lessonId,
    history: [{ role: "assistant", content: item.question }],
    format: "wav",
    audio: item.wav.toString("base64"),
  });
  const encodingMs = performance.now() - encodedAt;
  const started = performance.now();
  const response = await fetch(`${base}/api/oral-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body,
    signal: AbortSignal.timeout(180_000),
  });
  const headersAt = performance.now();
  const text = await response.text();
  const data: unknown = JSON.parse(text);
  const ended = performance.now();
  if (!response.ok)
    return {
      mode: "classic-http",
      status: response.status,
      requestMs: Math.round(ended - started),
      error: "HTTP turn failed",
    };
  const value = oralResponseSchema.parse(data);
  return {
    mode: "classic-http",
    status: response.status,
    requestMs: Math.round(ended - started),
    completeHttpAllLanguagesMs: Math.round(ended - started),
    firstJapaneseAudioAvailableMs: value.heard
      ? Math.round(ended - started)
      : null,
    firstJapaneseAudioDefinition:
      "Base64 Japanese becomes accessible after complete JSON parsing; HTTP may include French too.",
    headersMs: Math.round(headersAt - started),
    bodyTransferAndParseMs: Math.round(ended - headersAt),
    encodingMs: Math.round(encodingMs),
    requestBodyBytes: Buffer.byteLength(body),
    responseBodyBytes: Buffer.byteLength(text),
    timing: response.headers.get("server-timing"),
    inputAudioMs: item.audioMs,
    heard: value.heard,
    ...(value.heard
      ? {
          transcript: value.transcript,
          tutor: value.tutor,
          coachingUnavailable: value.coachingUnavailable,
          japaneseAudioBytes: Buffer.from(value.audio, "base64").length,
        }
      : { reason: value.reason }),
  };
}

async function streamed(base: string, token: string, item: Prepared) {
  const began = performance.now();
  const ticketResponse = await fetch(`${base}/api/voice-lab/session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!ticketResponse.ok) throw new Error("Laboratory ticket unavailable");
  const capability = voiceLabTicketSchema.parse(await ticketResponse.json());
  // Never serialize this URL, the ticket, authorization headers, or raw socket errors.
  const socket = new WebSocket(
    `${base.replace("http:", "ws:")}${capability.path}?ticket=${capability.ticket}`,
  );
  let failed: string | undefined;
  let ready = false,
    listening = false,
    complete = false,
    responseDone = false;
  let firstAudioAt: number | undefined, firstPartialAt: number | undefined;
  let captureAt: number | undefined, finishAt: number | undefined;
  let sentBytes = 0,
    receivedBytes = 0,
    audioBytes = 0,
    partials = 0,
    partialsBeforeFinish = 0;
  let final: Extract<VoiceLabServerEvent, { type: "final" }> | undefined;
  let tutor: Extract<VoiceLabServerEvent, { type: "tutor" }> | undefined;
  const events: unknown[] = [];
  socket.on("error", () => {
    failed = "Laboratory socket failed";
  });
  socket.on("close", () => {
    if (!complete) failed ||= "Laboratory socket closed before completion";
  });
  socket.on("message", (raw) => {
    const bytes = Array.isArray(raw)
      ? Buffer.concat(raw)
      : raw instanceof ArrayBuffer
        ? Buffer.from(raw)
        : raw;
    receivedBytes += bytes.length;
    let event: VoiceLabServerEvent;
    try {
      event = voiceLabServerSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      failed = "Invalid laboratory event";
      return;
    }
    const now = performance.now();
    if (event.type === "ready") ready = true;
    if (event.type === "state" && event.state === "listening") listening = true;
    if (event.type === "state" && event.state === "complete") complete = true;
    if (event.type === "error") failed = `Laboratory error: ${event.code}`;
    if (event.type === "partial") {
      partials++;
      firstPartialAt ??= now;
      if (finishAt === undefined) partialsBeforeFinish++;
    }
    if (event.type === "final") final = event;
    if (event.type === "tutor") tutor = event;
    if (event.type === "response_done") responseDone = true;
    if (event.type === "audio") {
      if (finishAt === undefined) {
        failed = "Japanese audio emitted before finish";
        return;
      }
      firstAudioAt ??= now;
      audioBytes += Buffer.from(event.audio, "base64").length;
      events.push({
        type: event.type,
        index: event.index,
        elapsedMs: Math.round(now - began),
        decodedBytes: Buffer.from(event.audio, "base64").length,
      });
    } else events.push({ ...event, elapsedMs: Math.round(now - began) });
  });
  const until = async (condition: () => boolean) => {
    while (!condition()) {
      if (failed) throw new Error(failed);
      if (performance.now() - began > 180_000)
        throw new Error("Laboratory run timeout");
      await pause(10);
    }
    if (failed) throw new Error(failed);
  };
  const send = (data: string | Buffer) =>
    new Promise<void>((done, reject) => {
      if (socket.readyState !== WebSocket.OPEN)
        return reject(new Error("Laboratory socket unavailable"));
      sentBytes += Buffer.byteLength(data);
      socket.send(data, (error) =>
        error ? reject(new Error("Laboratory send failed")) : done(),
      );
    });
  try {
    await until(() => ready);
    await send(
      JSON.stringify({
        type: "start",
        turn: 1,
        language: "auto",
        scenario: item.scenario,
        respond: true,
        keepSample: false,
      }),
    );
    await until(() => listening);
    captureAt = performance.now();
    let sequence = 0;
    for (
      let offset = 0;
      offset < item.pcm.length;
      offset += VOICE_LAB.maxChunkBytes
    ) {
      const piece = item.pcm.subarray(offset, offset + VOICE_LAB.maxChunkBytes);
      // A 200 ms packet is available only after its final synthetic sample.
      await pause(captureAt + (offset + piece.length) / 32 - performance.now());
      if (failed) throw new Error(failed);
      const frame = Buffer.alloc(VOICE_LAB.frameHeaderBytes + piece.length);
      frame.writeUInt32LE(1, 0);
      frame.writeUInt32LE(sequence++, 4);
      piece.copy(frame, VOICE_LAB.frameHeaderBytes);
      await send(frame);
    }
    finishAt = performance.now();
    await send(JSON.stringify({ type: "finish", turn: 1 }));
    await until(() => complete && responseDone);
    const ended = performance.now();
    return {
      mode: "laboratory-websocket",
      language: "auto",
      keepSample: false,
      firstJapaneseAudioAvailableMs:
        firstAudioAt === undefined ? null : Math.round(firstAudioAt - finishAt),
      firstJapaneseAudioDefinition:
        "First validated Japanese WAV segment received over WS after explicit finish; no playback measured.",
      finishToCompleteMs: Math.round(ended - finishAt),
      totalWithRealtimeCaptureAndTicketMs: Math.round(ended - began),
      capturePacingMs: Math.round(finishAt - captureAt),
      inputAudioMs: item.audioMs,
      firstPartialDuringCaptureMs:
        firstPartialAt === undefined
          ? null
          : Math.round(firstPartialAt - captureAt),
      partials,
      partialsBeforeFinish,
      wsPayloadBytesSent: sentBytes,
      wsPayloadBytesReceived: receivedBytes,
      japaneseAudioBytes: audioBytes,
      byteDefinition:
        "Application payload only; excludes TCP/WebSocket headers. WS response contains Japanese audio only.",
      final,
      tutor: tutor?.tutor,
      events,
    };
  } finally {
    // Completion was observed before close; no overlap with the next fixture.
    socket.terminate();
  }
}

async function main() {
  const destinationArgument = process.argv[2];
  if (!destinationArgument)
    throw new Error(
      "Output path required; this experiment starts local engines only when explicitly invoked",
    );
  const destination = resolve(destinationArgument);
  requirePrivateOutput(destination);
  if (existsSync(destination))
    throw new Error("Output already exists; choose a fresh run destination");
  // All synthetic PCM conversions finish before either engine starts.
  const prepared = fixtures.map(prepare);
  const sourceFiles = [
    "scripts/benchmark-voice-lab.ts",
    "server/app.ts",
    "server/local-tutor.ts",
    "server/conversation_worker.py",
    "server/conversation_feedback.py",
    "server/pedagogic_romaji.py",
    "server/linguistic_support.py",
    "server/conversation_context.py",
    "server/local-speech.ts",
    "server/voice_worker.py",
    "server/voice-lab.ts",
    "server/voice-lab-asr.ts",
    "server/voice_lab_worker.py",
    "server/voice-lab-response.ts",
    "server/llm_stream_trace.py",
    "shared/voice-lab.ts",
  ];
  const sourceHash = createHash("sha256")
    .update(
      sourceFiles
        .map((path) => `${path}\n${readFileSync(path, "utf8")}`)
        .join("\n"),
    )
    .digest("hex");
  const started = performance.now();
  const provider = createLocalTutor();
  const speech = createLocalSpeech({ cacheAudio: false });
  if (!provider || !speech) {
    provider?.close();
    speech?.close();
    throw new Error("Local engines required");
  }
  const asr = createVoiceLabAsr();
  let active: Prepared | undefined;
  const labProvider: TutorProvider = {
    ...provider,
    turn: (input) => {
      if (!active) throw new Error("Benchmark context missing");
      return provider.labTurn({ ...input, lessonId: active.lessonId });
    },
  };
  const respond = createVoiceLabResponse(labProvider, speech);
  const lab = createVoiceLab({
    transcribe: asr.transcribe,
    ready: provider.ready,
    respond: (input) => {
      if (!active) throw new Error("Benchmark context missing");
      // Same supplied initial question/objective as HTTP; each socket is a new case.
      return respond({
        ...input,
        history: [{ role: "assistant", content: active.question }],
      });
    },
  });
  const token = randomBytes(32).toString("hex");
  const server = createApp({
    token,
    provider,
    speech,
    voiceLab: lab,
    mode: "local",
    isReady: provider.ready,
  }).listen(0, "127.0.0.1");
  lab.attach(server, { origins: [] });
  const results: unknown[] = [];
  const save = (
    status: "running" | "complete" | "incomplete",
    readyMs?: number,
  ) => {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      JSON.stringify(
        {
          date: new Date().toISOString(),
          status,
          sourceHash,
          readyMs,
          audioCache: false,
          rounds: 2,
          fixtureCount: prepared.length,
          fixture:
            "Six synthetic VOICEVOX recordings from benchmark-oral-uncached; same derived PCM sent through both paths. No human or physical phone.",
          capture:
            "PCM16LE mono 16 kHz, 200 ms paced WS chunks; explicit finish after final sample.",
          comparability: [
            "HTTP requestMs waits for full JSON including optional French. WS firstJapaneseAudioAvailableMs waits only for the first Japanese segment after finish.",
            "Neither metric measures actual playback or a user's ear; no audible latency gain is calculated.",
            "WS total includes realtime capture; HTTP requestMs starts after the full file already exists.",
            "Lab uses its experimental labTurn and omits spoken French; histories/objectives and PCM are matched by this benchmark adapter.",
            "Warm state and model allocation differ; first measurements are not independent cold runs.",
            "One run is awaited to completion before the next; ASR and LLM inference are not launched concurrently by this driver.",
          ],
          fixtures: prepared.map(({ pcm, wav, ...item }) => item),
          results,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  };
  try {
    await new Promise<void>((done, reject) => {
      server.once("listening", done);
      server.once("error", () =>
        reject(new Error("Local benchmark HTTP server failed")),
      );
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Address unavailable");
    const base = `http://127.0.0.1:${address.port}`;
    while (!provider.ready()) {
      if (performance.now() - started > 120_000)
        throw new Error("Startup timeout");
      await pause(100);
    }
    const readyMs = Math.round(performance.now() - started);
    save("running", readyMs);
    for (let round = 0; round < 2; round++)
      for (const item of prepared) {
        active = item;
        // Alternate path order between passes rather than making all WS calls warm.
        for (const mode of round === 0
          ? ["classic", "lab"]
          : ["lab", "classic"]) {
          const result =
            mode === "classic"
              ? await classic(base, token, item)
              : await streamed(base, token, item);
          results.push({
            id: item.id,
            round,
            firstClassicInference:
              round === 0 && item.id === "identity" && mode === "classic",
            firstLaboratoryAsr:
              round === 0 && item.id === "identity" && mode === "lab",
            ...result,
          });
          save("running", readyMs);
          process.stdout.write(
            `${item.id} round=${round} mode=${mode} completed\n`,
          );
        }
      }
    save("complete", readyMs);
  } catch (error) {
    save("incomplete");
    throw error;
  } finally {
    lab.close();
    asr.close();
    provider.close();
    speech.close();
    await new Promise<void>((done) => server.close(() => done()));
  }
}
void main().catch((error: unknown) => {
  // No underlying network/model error can print a capability URL or credentials.
  process.stderr.write(
    error instanceof Error &&
      error.message ===
        "Output path required; this experiment starts local engines only when explicitly invoked"
      ? error.message + "\n"
      : "Synthetic voice laboratory benchmark incomplete. Inspect its saved status.\n",
  );
  process.exitCode = 1;
});
