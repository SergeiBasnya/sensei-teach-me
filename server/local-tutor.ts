import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { tutorReplySchema, helpResponseSchema } from "../shared/contracts";
import type { TutorProvider } from "./app";
import { getLesson } from "../shared/learning-plan";
import { reviewAssessmentSchema } from "../shared/learning-memory";
import { reviewPrompt } from "../shared/review-prompt";
import { learnerGuidance } from "../shared/learner-guidance";
import { conversationGuidance } from "../shared/conversation-curriculum";
import { addTiming, timingContext, type Timings } from "./timing";

export type LocalTutor = TutorProvider & {
  ready: () => boolean;
  close: () => void;
  labTurn: TutorProvider["turn"];
};
const responseSchema = z.object({
  id: z.number(),
  result: z.unknown().optional(),
  seconds: z.number().nonnegative().optional(),
  metrics: z
    .record(z.string().regex(/^[a-z_]{1,40}$/), z.number().nonnegative())
    .optional(),
  error: z.string().optional(),
  diagnostic: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,120}$/)
    .optional(),
});
export function createLocalTutor(): LocalTutor | undefined {
  const root = resolve(process.env.SENSEI_LOCAL_ROOT || ".local/conversation");
  const python = resolve(process.env.VOICEVOX_PYTHON || ".venv/bin/python");
  if (!existsSync(python) || !existsSync(`${root}/setup-receipt.json`)) return;
  try {
    const receipt: unknown = JSON.parse(
      readFileSync(`${root}/setup-receipt.json`, "utf8"),
    );
    if (
      !receipt ||
      typeof receipt !== "object" ||
      !("chat-qwen3-14b" in receipt)
    )
      return;
  } catch {
    return;
  }
  let worker: ChildProcessWithoutNullStreams | undefined;
  let serial = 0;
  let ready = false;
  let closed = false;
  const pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      timings?: Timings;
      started: number;
    }
  >();
  const fail = () => {
    ready = false;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(
        new Error(
          "Le moteur local est indisponible. Relance le serveur puis réessaie.",
        ),
      );
    }
    pending.clear();
  };
  const start = () => {
    const child = spawn(python, [resolve("server/conversation_worker.py")], {
      env: { ...process.env, SENSEI_LOCAL_ROOT: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    worker = child;
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      if (z.object({ ready: z.literal(true) }).safeParse(raw).success) {
        ready = true;
        return;
      }
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) return;
      const request = pending.get(parsed.data.id);
      if (!request) return;
      pending.delete(parsed.data.id);
      clearTimeout(request.timer);
      for (const [name, ms] of Object.entries(parsed.data.metrics || {}))
        addTiming(name, ms, request.timings);
      addTiming(
        "worker_roundtrip",
        performance.now() - request.started,
        request.timings,
      );
      if (parsed.data.seconds !== undefined)
        addTiming(
          "worker_queue",
          Math.max(
            0,
            performance.now() - request.started - parsed.data.seconds * 1000,
          ),
          request.timings,
        );
      if (parsed.data.error) {
        const category = /^[A-Za-z]+Error$/.test(parsed.data.error)
          ? parsed.data.error
          : "InferenceError";
        process.stderr.write(
          `Moteur local : ${category} ${parsed.data.diagnostic || ""}.\n`,
        );
        request.reject(
          new Error(
            "Mochi n’a pas pu traiter cette phrase. Réessaie en parlant plus simplement.",
          ),
        );
      } else request.resolve(parsed.data.result);
    });
    child.once("error", fail);
    child.once("close", () => {
      lines.close();
      if (worker === child) {
        worker = undefined;
        fail();
      }
    });
    return child;
  };
  const call = (body: object): Promise<unknown> => {
    if (closed || !ready)
      return Promise.reject(
        new Error(
          "Le moteur local se prépare. Réessaie dans quelques secondes.",
        ),
      );
    if (pending.size >= 2)
      return Promise.reject(
        new Error("Mochi traite déjà une conversation. Patiente un instant."),
      );
    const child = worker || start();
    const id = ++serial;
    return new Promise((resolveResult, reject) => {
      const timer = setTimeout(() => {
        fail();
        child.kill();
      }, 80_000);
      pending.set(id, {
        resolve: resolveResult,
        reject,
        timer,
        timings: timingContext.getStore(),
        started: performance.now(),
      });
      child.stdin.write(JSON.stringify({ ...body, id }) + "\n", (error) => {
        if (error) fail();
      });
    });
  };
  start();
  const turn = async (
    input: Parameters<TutorProvider["turn"]>[0],
    labStreaming = false,
  ) =>
    tutorReplySchema.parse(
      await call({
        kind: "turn",
        ...input,
        ...(labStreaming ? { labStreaming: true } : {}),
        objective: getLesson(input.lessonId)?.focus,
        learnerGuidance: learnerGuidance(input.learner),
        conversationGuidance: conversationGuidance(input.scenario),
      }),
    );
  return {
    ready: () => ready,
    async romanize(texts) {
      return z
        .array(z.string().max(2000))
        .length(texts.length)
        .parse(await call({ kind: "readings", texts }));
    },
    turn: (input) => turn(input),
    labTurn: (input) => turn(input, true),
    async transcribe(input) {
      return z
        .string()
        .max(1500)
        .parse(await call({ kind: "transcribe", ...input }));
    },
    async transcribeDetailed(input) {
      return z
        .object({ text: z.string().max(1500), uncertain: z.boolean() })
        .parse(await call({ kind: "transcribe", ...input, detailed: true }));
    },
    async question(input) {
      return tutorReplySchema.parse(await call({ kind: "question", ...input }));
    },
    async assessReview(input) {
      return reviewAssessmentSchema.parse(
        await call({
          kind: "review",
          ...input,
          instructions: reviewPrompt(input.target.skill),
        }),
      );
    },
    async help(input) {
      return helpResponseSchema.parse(await call({ kind: "help", ...input }));
    },
    close() {
      closed = true;
      fail();
      worker?.kill();
      worker = undefined;
    },
  };
}
