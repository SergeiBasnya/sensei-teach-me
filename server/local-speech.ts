import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { z } from "zod";

export type SpeechProvider = {
  speak: (text: string) => Promise<Buffer>;
  close: () => void;
};
const resultSchema = z.object({
  id: z.number().int(),
  audio: z.string().max(4_000_000).optional(),
  error: z.string().optional(),
});
export function createLocalSpeech(): SpeechProvider | undefined {
  const python =
    process.env.VOICEVOX_PYTHON ||
    resolve(
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
  const root = resolve(process.env.VOICEVOX_ROOT || ".local/voicevox/runtime");
  if (!existsSync(python) || !existsSync(resolve(root, "models/vvms/0.vvm")))
    return undefined;
  let worker: ChildProcessWithoutNullStreams | undefined;
  let serial = 0;
  const pending = new Map<
    number,
    {
      resolve: (audio: Buffer) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const failAll = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(
        new Error("La voix locale est indisponible. Relance le serveur vocal."),
      );
    }
    pending.clear();
  };
  const start = () => {
    const child = spawn(python, [resolve("server/voice_worker.py")], {
      env: { ...process.env, VOICEVOX_ROOT: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    worker = child;
    // Les diagnostics du moteur ne contiennent pas les textes des requêtes.
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      const result = resultSchema.safeParse(raw);
      if (!result.success) return;
      const request = pending.get(result.data.id);
      if (!request) return;
      pending.delete(result.data.id);
      clearTimeout(request.timer);
      if (result.data.audio) {
        const audio = Buffer.from(result.data.audio, "base64");
        if (
          audio.subarray(0, 4).toString() === "RIFF" &&
          audio.subarray(8, 12).toString() === "WAVE"
        )
          request.resolve(audio);
        else
          request.reject(
            new Error("Le moteur a renvoyé un enregistrement invalide."),
          );
      } else request.reject(new Error("La synthèse vocale locale a échoué."));
    });
    child.once("error", failAll);
    child.once("close", () => {
      lines.close();
      if (worker === child) {
        worker = undefined;
        failAll();
      }
    });
    return child;
  };
  return {
    speak(text) {
      if (pending.size >= 4)
        return Promise.reject(
          new Error("Le moteur vocal est occupé. Réessaie dans un instant."),
        );
      const child = worker || start();
      const id = ++serial;
      return new Promise<Buffer>((resolveAudio, reject) => {
        const timer = setTimeout(() => {
          failAll();
          child.kill();
        }, 40_000);
        pending.set(id, { resolve: resolveAudio, reject, timer });
        child.stdin.write(
          JSON.stringify({
            id,
            text,
            style: 10,
          }) + "\n",
          (error) => {
            if (error) failAll();
          },
        );
      });
    },
    close() {
      failAll();
      worker?.kill();
      worker = undefined;
    },
  };
}
