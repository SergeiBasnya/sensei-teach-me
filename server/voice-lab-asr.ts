import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { z } from "zod";

const resultSchema = z.object({
  id: z.number().int(),
  text: z.string().max(1500),
  uncertain: z.boolean(),
  metrics: z.record(z.string().regex(/^[a-z_]{1,40}$/), z.number().finite()),
});
export function createVoiceLabAsr({
  python = process.env.VOICEVOX_PYTHON || resolve(".venv/bin/python"),
  script = resolve("server/voice_lab_worker.py"),
}: { python?: string; script?: string } = {}) {
  let worker: ChildProcessWithoutNullStreams | undefined;
  let loading: Promise<void> | undefined;
  let ready = false;
  let closed = false;
  let serial = 0;
  let busy = false;
  let current:
    | {
        id: number;
        resolve: (result: z.infer<typeof resultSchema>) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  const fail = () => {
    current?.reject(
      new Error("La reconnaissance du laboratoire est indisponible."),
    );
    current = undefined;
  };
  function start() {
    if (loading) return loading;
    loading = new Promise<void>((resolveReady, rejectReady) => {
      const child = spawn(python, [script], {
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      worker = child;
      child.stderr.resume();
      const lines = createInterface({ input: child.stdout });
      const timer = setTimeout(() => {
        child.kill();
        rejectReady(
          new Error("Le laboratoire met trop de temps à se préparer."),
        );
      }, 30_000);
      lines.on("line", (line) => {
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          return;
        }
        if (z.object({ ready: z.literal(true) }).safeParse(raw).success) {
          ready = true;
          clearTimeout(timer);
          resolveReady();
          return;
        }
        const parsed = resultSchema.safeParse(raw);
        if (parsed.success && current?.id === parsed.data.id) {
          const pending = current;
          current = undefined;
          pending.resolve(parsed.data);
        } else if (
          raw &&
          typeof raw === "object" &&
          "id" in raw &&
          raw.id === current?.id
        )
          fail();
      });
      const stopped = () => {
        clearTimeout(timer);
        lines.close();
        if (worker === child) {
          worker = undefined;
          loading = undefined;
          ready = false;
          fail();
        }
        rejectReady(
          new Error("Le laboratoire ne peut pas charger le moteur local."),
        );
      };
      child.once("error", stopped);
      child.once("close", stopped);
    });
    return loading;
  }
  return {
    ready: () => ready,
    async transcribe(
      pcm: Buffer,
      options: {
        language: "auto" | "ja";
        partial: boolean;
        signal: AbortSignal;
      },
    ) {
      if (closed || options.signal.aborted)
        throw new Error("Laboratoire arrêté.");
      if (busy)
        throw new Error("Le laboratoire traite déjà une reconnaissance.");
      busy = true;
      try {
        await start();
        if (closed || options.signal.aborted || !worker)
          throw new Error("Laboratoire arrêté.");
        const child = worker;
        const id = ++serial;
        const result = await new Promise<z.infer<typeof resultSchema>>(
          (resolveResult, reject) => {
            const abort = () => {
              if (current?.id === id) {
                fail();
                if (worker === child) {
                  worker = undefined;
                  loading = undefined;
                  ready = false;
                }
                child.kill();
              }
            };
            const timer = setTimeout(abort, 15_000);
            const cleanup = () => {
              clearTimeout(timer);
              options.signal.removeEventListener("abort", abort);
            };
            current = {
              id,
              resolve: (value) => {
                cleanup();
                resolveResult(value);
              },
              reject: (error) => {
                cleanup();
                reject(error);
              },
            };
            options.signal.addEventListener("abort", abort, { once: true });
            if (options.signal.aborted) {
              abort();
              return;
            }
            child.stdin.write(
              JSON.stringify({
                id,
                pcm: pcm.toString("base64"),
                language: options.language,
              }) + "\n",
              (error) => {
                if (error) fail();
              },
            );
          },
        );
        return {
          text: result.text,
          uncertain: result.uncertain,
          metrics: result.metrics,
        };
      } finally {
        busy = false;
      }
    },
    close() {
      closed = true;
      fail();
      worker?.kill();
      worker = undefined;
      ready = false;
    },
  };
}
