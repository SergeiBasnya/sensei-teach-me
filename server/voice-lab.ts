import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  VOICE_LAB,
  voiceLabClientSchema,
  voiceLabReplySchema,
  type VoiceLabLanguage,
  type VoiceLabReplyEvent,
  type VoiceLabScenario,
  type VoiceLabServerEvent,
} from "../shared/voice-lab";

type Transcript = {
  text: string;
  uncertain: boolean;
  metrics: Record<string, number>;
};
export type VoiceLabAsr = (
  pcm: Buffer,
  options: {
    language: VoiceLabLanguage;
    partial: boolean;
    signal: AbortSignal;
  },
) => Promise<Transcript>;
export type VoiceLabRespond = (input: {
  text: string;
  turn: number;
  language: VoiceLabLanguage;
  scenario: VoiceLabScenario;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  emit: (event: VoiceLabReplyEvent) => void;
}) => Promise<void>;
type Turn = {
  id: number;
  language: VoiceLabLanguage;
  scenario: VoiceLabScenario;
  respond: boolean;
  keepSample: boolean;
  stage: "listening" | "recognizing" | "complete" | "paused";
  chunks: Buffer[];
  bytes: number;
  sequence: number;
  requestedBytes: number;
  partialPending: boolean;
  partialCount: number;
  requestedAt: number;
  started: number;
  controller: AbortController;
};
type Job = {
  run: () => Promise<void>;
  signal: AbortSignal;
};
const MAX_TURN_BYTES = (VOICE_LAB.maxTurnMs / 1000) * 32_000;
const TICKET_TTL = 30_000 as const;
const MAX_CLIENTS = 2;
const safeMetrics = (raw: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(raw)
      .filter(
        ([key, value]) =>
          /^[a-z_]{1,40}$/.test(key) &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 3_600_000,
      )
      .slice(0, 20),
  );

/** Separate laboratory: no learning-memory writes or production turns.
 * The optional sample sink is invoked only after an explicit opt-in and finish.
 */
export function createVoiceLab({
  transcribe,
  respond,
  ready = () => true,
  retainSample,
  now = Date.now,
  partialEveryMs = 1000,
  tickMs = 250,
}: {
  transcribe: VoiceLabAsr;
  respond?: VoiceLabRespond;
  ready?: () => boolean;
  retainSample?: (
    pcm: Buffer,
    options: { turn: number; language: VoiceLabLanguage; signal: AbortSignal },
  ) => Promise<{ id: string }>;
  now?: () => number;
  partialEveryMs?: number;
  tickMs?: number;
}) {
  const tickets = new Map<string, number>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: VOICE_LAB.maxChunkBytes + VOICE_LAB.frameHeaderBytes,
    perMessageDeflate: false,
  });
  let closed = false;
  let attached: Server | undefined;
  let detach: (() => void) | undefined;
  let busy = false;
  const finalJobs: Job[] = [];
  const partialJobs: Job[] = [];
  const drain = async () => {
    if (busy) return;
    busy = true;
    try {
      for (;;) {
        const job = finalJobs.shift() || partialJobs.shift();
        if (!job) break;
        if (!job.signal.aborted) await job.run();
      }
    } finally {
      busy = false;
    }
  };
  const enqueue = (job: Job, partial: boolean) => {
    // Each of the two sockets owns at most one partial and one final request.
    for (const jobs of [finalJobs, partialJobs]) {
      for (let index = jobs.length - 1; index >= 0; index--)
        if (jobs[index]!.signal.aborted) jobs.splice(index, 1);
    }
    (partial ? partialJobs : finalJobs).push(job);
    void drain();
  };

  wss.on("connection", (socket) => {
    const connected = now();
    let lastActivity = connected;
    let current: Turn | undefined;
    let previousId = 0;
    let burstAt = connected;
    let burstBytes = 0;
    let burstCommands = 0;
    let burstFrames = 0;
    let history: { role: "user" | "assistant"; content: string }[] = [];
    let historyScenario: VoiceLabScenario | undefined;
    const active = (turn: Turn) =>
      current === turn && !turn.controller.signal.aborted;
    const send = (event: VoiceLabServerEvent) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const message = JSON.stringify(event);
      if (
        socket.bufferedAmount + Buffer.byteLength(message) >
        VOICE_LAB.maxBufferedBytes
      ) {
        current?.controller.abort();
        socket.close(1008, "backpressure");
        return;
      }
      socket.send(message);
    };
    const fail = (
      code: Extract<VoiceLabServerEvent, { type: "error" }>["code"],
      message: string,
    ) => {
      current?.controller.abort();
      if (current) current.chunks = [];
      send({
        type: "error",
        ...(current ? { turn: current.id } : {}),
        code,
        message,
      });
      socket.close(1008, code);
    };
    const complete = (turn: Turn) => {
      if (!active(turn)) return;
      turn.stage = "complete";
      send({ type: "state", turn: turn.id, state: "complete" });
    };
    const requestAsr = (turn: Turn, partial: boolean) => {
      const pcm = Buffer.concat(turn.chunks, turn.bytes);
      const queuedAt = now();
      if (partial) {
        turn.partialPending = true;
        turn.requestedBytes = turn.bytes;
        turn.requestedAt = queuedAt;
      }
      enqueue(
        {
          signal: turn.controller.signal,
          async run() {
            if (!active(turn)) return;
            const begin = now();
            try {
              let sampleSaveMs = 0;
              if (!partial && turn.keepSample && retainSample) {
                const sampleStarted = now();
                const sample = await retainSample(pcm, {
                  turn: turn.id,
                  language: turn.language,
                  signal: turn.controller.signal,
                });
                if (!active(turn)) return;
                if (!/^[A-Za-z0-9_-]{1,60}$/.test(sample.id))
                  throw new Error("invalid_sample_id");
                sampleSaveMs = Math.max(0, now() - sampleStarted);
                send({ type: "sample_saved", turn: turn.id, id: sample.id });
              }
              const asrStarted = now();
              const result = await transcribe(pcm, {
                language: turn.language,
                partial,
                signal: turn.controller.signal,
              });
              if (!active(turn) || (partial && turn.stage !== "listening"))
                return;
              const text =
                typeof result.text === "string"
                  ? result.text.slice(0, 1000)
                  : "";
              const uncertain =
                !text.trim() ||
                result.uncertain !== false ||
                result.text.length > 1000 ||
                text.includes("\ufffd");
              const metrics = {
                ...safeMetrics(result.metrics),
                asr_queue: Math.max(0, begin - queuedAt),
                asr_roundtrip: Math.max(0, now() - asrStarted),
                audio_ms: Math.round(pcm.length / 32),
                sample_save: sampleSaveMs,
              };
              if (partial) {
                turn.partialCount++;
                send({
                  type: "partial",
                  turn: turn.id,
                  text,
                  uncertain,
                  provisional: true,
                  metrics,
                });
                return;
              }
              send({
                type: "final",
                turn: turn.id,
                text,
                uncertain,
                metrics: {
                  ...metrics,
                  chunks: turn.sequence,
                  partials: turn.partialCount,
                },
              });
              turn.chunks = [];
              if (!uncertain && turn.respond && respond) {
                const inputHistory = history.map((item) => ({ ...item }));
                let tutor:
                  Extract<VoiceLabReplyEvent, { type: "tutor" }> | undefined;
                let responseDone = false;
                let nextAudio = 0;
                const finishResponse = () => {
                  if (!active(turn) || responseDone) return;
                  responseDone = true;
                  if (tutor)
                    history = [
                      ...history,
                      { role: "user", content: text },
                      {
                        role: "assistant",
                        content: [
                          tutor.tutor.coaching,
                          tutor.tutor.reply.japanese,
                        ]
                          .filter(Boolean)
                          .join("\n")
                          .slice(0, 2000),
                      },
                    ].slice(-12) as typeof history;
                  send({ type: "response_done", turn: turn.id });
                };
                await respond({
                  text,
                  turn: turn.id,
                  language: turn.language,
                  scenario: turn.scenario,
                  history: inputHistory,
                  signal: turn.controller.signal,
                  emit(event) {
                    if (!active(turn)) return;
                    const checked = voiceLabReplySchema.parse(event);
                    // Metadata can finish while this turn's validated audio plays.
                    // A new capture aborts the old turn; audio/tutor cannot reopen it.
                    if (
                      responseDone &&
                      checked.type !== "details" &&
                      checked.type !== "metrics"
                    )
                      return;
                    if (checked.type === "audio" && !tutor)
                      throw new Error("audio_before_validated_tutor");
                    if (
                      checked.type === "audio" &&
                      checked.index !== nextAudio++
                    )
                      throw new Error("invalid_audio_order");
                    if (checked.type === "tutor") {
                      if (tutor) throw new Error("duplicate_tutor");
                      tutor = checked;
                    }
                    if (checked.type === "details") {
                      if (
                        !tutor ||
                        nextAudio === 0 ||
                        tutor.tutor.correction ||
                        checked.coaching !== (tutor.tutor.coaching ?? null) ||
                        checked.japanese !== tutor.tutor.reply.japanese
                      )
                        throw new Error("invalid_secondary_target");
                      if (!responseDone)
                        tutor = {
                          type: "tutor",
                          tutor: {
                            ...tutor.tutor,
                            reply: {
                              ...tutor.tutor.reply,
                              french: checked.french,
                            },
                          },
                        };
                    }
                    if (checked.type === "response_done") finishResponse();
                    else send({ ...checked, turn: turn.id });
                  },
                });
                finishResponse();
              } else if (turn.respond)
                send({ type: "response_done", turn: turn.id });
              complete(turn);
            } catch {
              if (active(turn)) {
                send({
                  type: "error",
                  turn: turn.id,
                  code: "unavailable",
                  message:
                    "Le laboratoire vocal est indisponible. Mets en pause puis réessaie.",
                });
                turn.chunks = [];
                complete(turn);
                turn.controller.abort(); // Optional metadata cannot outlive a failed response.
              }
            } finally {
              if (partial) turn.partialPending = false;
            }
          },
        },
        partial,
      );
    };
    const timer = setInterval(() => {
      if (now() - connected > 20 * 60_000 || now() - lastActivity > 60_000) {
        socket.close(1000, "session_timeout");
        return;
      }
      const turn = current;
      if (!turn || turn.stage !== "listening") return;
      if (now() - turn.started > VOICE_LAB.maxTurnMs + 5000) {
        fail(
          "limit",
          "Cette prise de parole a dépassé la durée du laboratoire.",
        );
        return;
      }
      if (
        !turn.partialPending &&
        turn.bytes >= 25_600 &&
        turn.bytes > turn.requestedBytes &&
        now() - turn.requestedAt >= partialEveryMs
      )
        requestAsr(turn, true);
    }, tickMs);
    timer.unref();
    socket.on("message", (data: RawData, binary) => {
      lastActivity = now();
      if (lastActivity - burstAt >= 1000) {
        burstAt = lastActivity;
        burstBytes = burstCommands = 0;
        burstFrames = 0;
      }
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      if (binary) {
        burstBytes += bytes.length;
        if (burstBytes > 128_000 || ++burstFrames > 100)
          return fail(
            "limit",
            "Le flux audio arrive trop vite. Relance la capture.",
          );
        const turn = current;
        if (
          !turn ||
          turn.stage !== "listening" ||
          bytes.length <= 8 ||
          bytes.length > VOICE_LAB.maxChunkBytes + 8 ||
          (bytes.length - 8) % 2
        )
          return fail(
            "invalid_audio",
            "Le flux PCM reçu est invalide. Relance la capture.",
          );
        if (
          bytes.readUInt32LE(0) !== turn.id ||
          bytes.readUInt32LE(4) !== turn.sequence
        )
          return fail(
            "sequence_gap",
            "Un fragment audio manque. Reprends la capture.",
          );
        if (
          turn.bytes + bytes.length - 8 > MAX_TURN_BYTES ||
          turn.sequence >= 5000
        )
          return fail(
            "limit",
            "Cette prise de parole a dépassé la durée du laboratoire.",
          );
        turn.sequence++;
        turn.chunks.push(Buffer.from(bytes.subarray(8)));
        turn.bytes += bytes.length - 8;
        return;
      }
      if (++burstCommands > 20 || bytes.length > 1024)
        return fail("limit", "Trop de commandes. Relance le laboratoire.");
      let value: unknown;
      try {
        value = JSON.parse(bytes.toString("utf8"));
      } catch {
        return fail("invalid_message", "La commande reçue est invalide.");
      }
      const parsed = voiceLabClientSchema.safeParse(value);
      if (!parsed.success)
        return fail("invalid_message", "La commande reçue est invalide.");
      const command = parsed.data;
      if (command.type === "close") return socket.close(1000, "user_close");
      if (command.type === "start") {
        if (command.turn <= previousId)
          return fail(
            "invalid_message",
            "La prise de parole est périmée. Reconnecte le laboratoire.",
          );
        current?.controller.abort();
        if (current) current.chunks = [];
        if (historyScenario !== command.scenario) history = [];
        historyScenario = command.scenario;
        previousId = command.turn;
        current = {
          id: command.turn,
          language: command.language,
          scenario: command.scenario,
          respond: command.respond,
          keepSample: command.keepSample,
          stage: "listening",
          chunks: [],
          bytes: 0,
          sequence: 0,
          requestedBytes: 0,
          partialPending: false,
          partialCount: 0,
          requestedAt: now(),
          started: now(),
          controller: new AbortController(),
        };
        send({ type: "state", turn: current.id, state: "listening" });
        return;
      }
      const turn = current;
      if (!turn || command.turn !== turn.id) return; // Late control cannot cancel a newer turn.
      if (command.type === "pause") {
        turn.controller.abort();
        turn.chunks = [];
        turn.stage = "paused";
        send({ type: "state", turn: turn.id, state: "paused" });
        return;
      }
      if (turn.stage !== "listening") return;
      turn.stage = "recognizing";
      send({ type: "state", turn: turn.id, state: "recognizing" });
      if (turn.bytes < 2560) {
        turn.chunks = [];
        send({
          type: "final",
          turn: turn.id,
          text: "",
          uncertain: true,
          metrics: {
            audio_ms: Math.round(turn.bytes / 32),
            chunks: turn.sequence,
            partials: turn.partialCount,
          },
        });
        if (turn.respond) send({ type: "response_done", turn: turn.id });
        complete(turn);
      } else requestAsr(turn, false);
    });
    socket.on("error", () => {}); // Do not log frames, transcripts, URLs or credentials.
    socket.once("close", () => {
      clearInterval(timer);
      current?.controller.abort();
      if (current) current.chunks = [];
      history = [];
    });
    send({ type: "ready", sampleRate: 16_000 });
  });
  return {
    issueTicket() {
      for (const [ticket, expires] of tickets)
        if (expires <= now()) tickets.delete(ticket);
      if (
        closed ||
        !ready() ||
        tickets.size >= 8 ||
        wss.clients.size >= MAX_CLIENTS
      )
        return null;
      const ticket = randomBytes(32).toString("hex");
      tickets.set(ticket, now() + TICKET_TTL);
      return { ticket, expiresInMs: TICKET_TTL, path: VOICE_LAB.path };
    },
    attach(server: Server, { origins }: { origins: string[] }) {
      if (attached) throw new Error("voice_lab_already_attached");
      attached = server;
      const onUpgrade = (
        request: import("node:http").IncomingMessage,
        socket: import("node:stream").Duplex,
        head: Buffer,
      ) => {
        let url: URL;
        try {
          url = new URL(request.url || "/", "http://voice-lab.invalid");
        } catch {
          socket.destroy();
          return;
        }
        if (url.pathname !== VOICE_LAB.path) {
          socket.destroy();
          return;
        }
        const origin = request.headers.origin;
        const ticket = url.searchParams.get("ticket") || "";
        const expires = tickets.get(ticket);
        tickets.delete(ticket); // One attempt consumes the capability, successful or otherwise.
        if (
          closed ||
          !ready() ||
          (origin && !origins.includes(origin)) ||
          !expires ||
          expires <= now() ||
          wss.clients.size >= MAX_CLIENTS ||
          [...url.searchParams.keys()].some((key) => key !== "ticket")
        ) {
          socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (client) =>
          wss.emit("connection", client, request),
        );
      };
      server.on("upgrade", onUpgrade);
      detach = () => server.off("upgrade", onUpgrade);
    },
    close() {
      closed = true;
      tickets.clear();
      detach?.();
      for (const socket of wss.clients) socket.terminate();
      finalJobs.length = partialJobs.length = 0;
      wss.close();
    },
  };
}
export type VoiceLab = ReturnType<typeof createVoiceLab>;
