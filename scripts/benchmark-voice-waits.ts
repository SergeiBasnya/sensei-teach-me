/** Fixed public audio, isolated workers/loopback transport; never a phone trial. */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { WebSocket } from "ws";
import type { TutorReply } from "../shared/contracts";
import type { TutorProvider } from "../server/app";
import type { LabTurnOptions } from "../server/local-tutor";
import type { VoiceLabDetailsProvider } from "../server/voice-lab-response";
import type { VoiceLabServerEvent } from "../shared/voice-lab";
import { VoiceLabEndpoint, voiceLabPacket } from "../src/lib/voice-lab-pcm";
import { wavDurationMs } from "../server/voice-lab-audio";

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((value) => value.replace(/^--/, "").split("=")),
  );
  const root = resolve(args.root || ".");
  const output = resolve(args.output || "");
  if (
    !args.run ||
    !args.output ||
    existsSync(output) ||
    !output.startsWith(resolve(".local/voice-lab") + "/")
  )
    throw Error("explicit_run_and_fresh_private_output_required");
  const assets = resolve("assets/speech");
  const load = (path: string) =>
    import(pathToFileURL(resolve(root, path)).href);
  const sha = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const round = (value: number) => Math.round(value * 10) / 10;
  const fixtures: {
    id: string;
    scenario: Parameters<TutorProvider["turn"]>[0]["scenario"];
    text: string;
    file: string;
    history: Parameters<TutorProvider["turn"]>[0]["history"];
  }[] = [
    {
      id: "controlled-short",
      scenario: "cafe",
      text: "コーヒーを一つください。",
      file: "fc48f4733aae10f420d6.wav",
      history: [
        { role: "user", content: "コーヒーを二つください。" },
        { role: "assistant", content: "ホットですか、アイスですか？" },
        { role: "user", content: "ホットで。" },
        { role: "assistant", content: "ほかに何かありますか？" },
      ],
    },
    {
      id: "controlled-long",
      scenario: "station",
      text: "京都までお願いします。",
      file: "2d738f422a192c578a24.wav",
      history: [{ role: "assistant", content: "どちらまでですか？" }],
    },
    {
      id: "generated-origin",
      scenario: "free",
      text: "フランスから来ました。",
      file: "109e155eca21856c868a.wav",
      history: [{ role: "assistant", content: "どこから来ましたか？" }],
    },
    {
      id: "generated-likes",
      scenario: "free",
      text: "はい、日本語が好きです。",
      file: "cdbbfef81b23fcb88885.wav",
      history: [{ role: "assistant", content: "日本語は好きですか？" }],
    },
  ];
  const python = resolve(".venv/bin/python");
  const pcm = fixtures.map((item) =>
    execFileSync(
      python,
      [
        "-c",
        "import imageio_ffmpeg,subprocess,sys;sys.stdout.buffer.write(subprocess.check_output([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-v','error','-i',sys.argv[1],'-ac','1','-ar','16000','-f','s16le','pipe:1']))",
        resolve(assets, item.file),
      ],
      { maxBuffer: 2_000_000 },
    ),
  );
  if (args.only && !fixtures.some((item) => item.id === args.only))
    throw Error("unknown_fixed_fixture");
  const files = [
    "server/conversation_worker.py",
    "server/beginner_dialogue.py",
    "server/voice-lab.ts",
    "server/voice-lab-response.ts",
    "server/local-speech.ts",
    "server/voice_worker.py",
    "src/lib/voice-lab-pcm.ts",
  ];
  const sources = files.map((path) => ({
    path,
    sha256: sha(readFileSync(resolve(root, path))),
  }));
  process.chdir(root);
  const [
    { createLocalTutor },
    { createLocalSpeech },
    { createVoiceLabAsr },
    { createVoiceLabResponse },
    { createVoiceLab },
    { createApp },
  ] = (await Promise.all([
    load("server/local-tutor.ts"),
    load("server/local-speech.ts"),
    load("server/voice-lab-asr.ts"),
    load("server/voice-lab-response.ts"),
    load("server/voice-lab.ts"),
    load("server/app.ts"),
  ])) as [
    typeof import("../server/local-tutor"),
    typeof import("../server/local-speech"),
    typeof import("../server/voice-lab-asr"),
    typeof import("../server/voice-lab-response"),
    typeof import("../server/voice-lab"),
    typeof import("../server/app"),
  ];
  const started = performance.now();
  const local = createLocalTutor();
  const speech = createLocalSpeech({ cacheAudio: args.cache === "on" });
  const asr = createVoiceLabAsr();
  if (!local || !speech) throw Error("local_engines_required");
  const rows: Record<string, unknown>[] = [];
  const secondary: Record<string, unknown>[] = [];
  let activeRow = 0;
  let input: (typeof fixtures)[number];
  const response = createVoiceLabResponse(local, speech, {
    turn: (
      value: Parameters<typeof local.labTurn>[0],
      options: LabTurnOptions,
    ) => local.labTurn(value, "ja-first", options),
    details: async (value: Parameters<VoiceLabDetailsProvider>[0]) => {
      const row = activeRow,
        at = performance.now();
      let abortedAt = 0;
      const abort = () => {
        abortedAt = performance.now();
      };
      value.signal.addEventListener("abort", abort, { once: true });
      try {
        const result = await local.labDetails(value, value.signal);
        secondary.push({
          row,
          ms: round(performance.now() - at),
          cancelled: false,
        });
        return result;
      } catch (error) {
        secondary.push({
          row,
          ms: round(performance.now() - at),
          cancelled: value.signal.aborted,
          cancelAckMs: abortedAt ? round(performance.now() - abortedAt) : null,
        });
        throw error;
      } finally {
        value.signal.removeEventListener("abort", abort);
      }
    },
  });
  const lab = createVoiceLab({
    transcribe: asr.transcribe,
    respond: (value: Parameters<typeof response>[0]) =>
      response({ ...value, history: input.history }),
  });
  const token = randomBytes(32).toString("hex");
  const server = createApp({ token, voiceLab: lab }).listen(0, "127.0.0.1");
  lab.attach(server, { origins: ["http://localhost:8787"] });
  const watchdog = setTimeout(() => {
    local.close();
    speech.close();
    asr.close();
    lab.close();
    server.close();
  }, 360_000);
  let socket: WebSocket | undefined;
  const normalize = (value: string) => value.replace(/[。、！？!?\s]/gu, "");
  function checkpoint(status: string) {
    writeFileSync(
      output,
      JSON.stringify(
        {
          schema: "sensei-voice-waits.v1",
          label: args.label,
          status,
          audioCache: args.cache === "on",
          sources,
          publicSyntheticOnly: true,
          physicalAndroid: false,
          personalRetention: false,
          activeDevelopmentServersLeftRunning: true,
          exclusiveGpu: false,
          startupToModelsReadyMs: readyMs,
          rows,
          secondary,
          limitations: [
            "One cold session per cache setting; two warm repetitions per fixture.",
            "Existing development workers remain loaded; external GPU activity is not controlled.",
            "Playback and microphone reopening on Android are not measured.",
            "Input history is fixed per fixture; this is not a naturality experiment.",
          ],
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  }
  let readyMs = 0;
  try {
    while (!local.ready()) {
      if (performance.now() - started > 80_000) throw Error("startup_timeout");
      await wait(25);
    }
    readyMs = round(performance.now() - started);
    await new Promise<void>((done) =>
      server.listening ? done() : server.once("listening", done),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("loopback_server_required");
    const ticket = (await fetch(
      `http://127.0.0.1:${address.port}/api/voice-lab/session`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    ).then((r) => r.json())) as { path: string; ticket: string };
    socket = new WebSocket(
      `ws://127.0.0.1:${address.port}${ticket.path}?ticket=${ticket.ticket}`,
      { origin: "http://localhost:8787" },
    );
    const events: { event: VoiceLabServerEvent; at: number }[] = [];
    socket.on("message", (raw) =>
      events.push({ event: JSON.parse(raw.toString()), at: performance.now() }),
    );
    socket.on("error", () => {});
    while (!events.some(({ event }) => event.type === "ready")) await wait(10);
    let turn = 0;
    for (let repetition = 0; repetition < 3; repetition++) {
      const indices = (
        args.cache === "off" ? [2, 3, 0, 1] : [0, 1, 2, 3]
      ).filter((index) => !args.only || fixtures[index]!.id === args.only);
      for (const index of indices) {
        input = fixtures[index]!;
        activeRow++;
        turn++;
        const at = performance.now();
        const row: Record<string, unknown> = {
          id: input.id,
          repetition,
          sessionFirstTurn: activeRow === 1,
          firstFixturePass: repetition === 0,
          expectedText: input.text,
          inputSha256: sha(JSON.stringify(input)),
          pcmSha256: sha(pcm[index]!),
          status: "failed",
          metrics: {},
        };
        rows.push(row);
        socket.send(
          JSON.stringify({
            type: "start",
            turn,
            scenario: input.scenario,
            language: "auto",
            respond: true,
            diagnostic: true,
          }),
        );
        const endpoint = new VoiceLabEndpoint(at, {
          question: input.history.at(-1)?.content,
        });
        let offset = 0,
          sequence = 0,
          finishAt = 0,
          pendingAt = 0,
          seen = events.length,
          nextPacketAt = at + 100;
        let firstWav = 0,
          finalAt = 0,
          responseAt = 0,
          waveMs = 0,
          listeningAt = 0;
        const metrics: Record<string, number> = {};
        for (;;) {
          const now = performance.now();
          for (const { event, at: received } of events.slice(seen)) {
            if (!("turn" in event) || event.turn !== turn) continue;
            if (event.type === "partial")
              endpoint.notePartial(event.text, event.uncertain);
            if (event.type === "final") {
              finalAt = received;
              row.transcript = event.text;
              row.uncertain = event.uncertain;
              Object.assign(metrics, event.metrics);
            }
            if (event.type === "metrics") Object.assign(metrics, event.metrics);
            if (event.type === "state" && event.state === "listening")
              listeningAt = received;
            if (event.type === "tutor") row.tutor = event.tutor;
            if (event.type === "details" && row.tutor)
              (row.tutor as TutorReply).reply.french = event.french;
            if (event.type === "audio") {
              if (!firstWav) firstWav = received;
              waveMs += wavDurationMs(Buffer.from(event.audio, "base64")) ?? 0;
            }
            if (event.type === "response_done") responseAt = received;
            if (event.type === "error") {
              row.failure = event.code;
              responseAt = received;
            }
          }
          seen = events.length;
          if (responseAt || now - at > 40_000) break;
          if (!finishAt && now >= nextPacketAt) {
            nextPacketAt = now + 100;
            const next = new Uint8Array(3200);
            const remaining = pcm[index]!.subarray(offset, offset + 3200);
            next.set(remaining);
            offset += remaining.length;
            socket.send(voiceLabPacket(turn, sequence++, next));
            const decision = endpoint.observe(next, now);
            if (decision === "finish" && !pendingAt) pendingAt = now + 150;
            if (pendingAt && !endpoint.canFinish(now)) pendingAt = 0;
            if (decision === "quiet" || decision === "limit") {
              row.failure = decision;
              break;
            }
          }
          if (!finishAt && pendingAt && now >= pendingAt) {
            finishAt = now;
            socket.send(JSON.stringify({ type: "finish", turn }));
          }
          await wait(10);
        }
        const lastEnergy = endpoint.lastDetectedVoiceAt;
        Object.assign(row, {
          metrics,
          captureToListeningMs: listeningAt ? round(listeningAt - at) : null,
          endpointWaitMs:
            finishAt && lastEnergy !== null
              ? round(finishAt - lastEnergy)
              : null,
          finishToFinalMs:
            finalAt && finishAt ? round(finalAt - finishAt) : null,
          finishToFirstWavMs:
            firstWav && finishAt ? round(firstWav - finishAt) : null,
          textToFirstWavMs:
            firstWav && finalAt ? round(firstWav - finalAt) : null,
          estimatedEnergyToFirstWavMs:
            firstWav && lastEnergy !== null
              ? round(firstWav - lastEnergy)
              : null,
          finishToResponseDoneMs:
            responseAt && finishAt ? round(responseAt - finishAt) : null,
          japaneseWaveMs: round(waveMs),
          sentSamples: offset / 2,
          expectedSamples: pcm[index]!.length / 2,
          androidPlayingEventMs: null,
          humanFirstSoundMs: null,
          androidMicrophoneReadyMs: null,
        });
        if (
          responseAt &&
          firstWav &&
          !row.failure &&
          row.uncertain === false &&
          normalize(String(row.transcript)) === normalize(input.text) &&
          offset >= pcm[index]!.length
        )
          row.status = "complete";
        socket.send(JSON.stringify({ type: "pause", turn }));
        checkpoint("running");
        process.stdout.write(
          `${args.label} cache=${args.cache} ${input.id} r=${repetition} ${row.status} finishWav=${row.finishToFirstWavMs}\n`,
        );
      }
    }
    checkpoint("complete");
  } finally {
    clearTimeout(watchdog);
    socket?.close();
    lab.close();
    asr.close();
    local.close();
    speech.close();
    await new Promise<void>((done) => server.close(() => done()));
  }
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
