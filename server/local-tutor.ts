import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { tutorReplySchema, helpResponseSchema } from "../shared/contracts";
import type { TutorProvider } from "./app";
import { getLesson } from "../shared/learning-plan";

export type LocalTutor = TutorProvider & {
  ready: () => boolean;
  close: () => void;
};
const responseSchema = z.object({
  id: z.number(),
  result: z.unknown().optional(),
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
      pending.set(id, { resolve: resolveResult, reject, timer });
      child.stdin.write(JSON.stringify({ ...body, id }) + "\n", (error) => {
        if (error) fail();
      });
    });
  };
  start();
  return {
    ready: () => ready,
    async turn(input) {
      return tutorReplySchema.parse(
        await call({
          kind: "turn",
          ...input,
          objective: getLesson(input.lessonId)?.focus,
        }),
      );
    },
    async transcribe(input) {
      return z
        .string()
        .max(1500)
        .parse(await call({ kind: "transcribe", ...input }));
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
