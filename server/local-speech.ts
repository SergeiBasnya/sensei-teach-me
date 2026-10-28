import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { z } from "zod";

export type SpeechProvider = {
  speak: (text: string, language?: "ja" | "fr") => Promise<Buffer>;
  romanize?: (texts: string[]) => Promise<string[]>;
  close: () => void;
};
export class FrenchSpeechUnavailable extends Error {
  constructor() {
    super(
      "La voix française Vivienne est indisponible. Vérifie la connexion Internet du serveur, puis réessaie.",
    );
  }
}
const resultSchema = z.object({
  id: z.number().int(),
  audio: z.string().max(4_000_000).optional(),
  error: z.string().max(300).optional(),
  code: z.literal("french_speech_unavailable").optional(),
  readings: z.array(z.string().max(2000)).max(50).optional(),
});
const readingsRequestSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(50);
type SpeechLane = SpeechProvider & {
  romanize: (texts: string[]) => Promise<string[]>;
};
function createSpeechLane(): SpeechLane | undefined {
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
  let closed = false;
  const pending = new Map<
    number,
    {
      resolve: (result: typeof resultSchema._output) => void;
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
      if (result.data.error)
        request.reject(
          result.data.code === "french_speech_unavailable"
            ? new FrenchSpeechUnavailable()
            : new Error("La synthèse vocale locale a échoué."),
        );
      else request.resolve(result.data);
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
  const call = <T>(
    body: object,
    decode: (result: typeof resultSchema._output) => T,
  ): Promise<T> => {
    if (closed) return Promise.reject(new Error("Speech provider closed"));
    if (pending.size >= 4)
      return Promise.reject(
        new Error("Le moteur vocal est occupé. Réessaie dans un instant."),
      );
    const child = worker || start();
    const id = ++serial;
    return new Promise<T>((resolveResult, reject) => {
      const timer = setTimeout(() => {
        failAll();
        child.kill();
      }, 40_000);
      pending.set(id, {
        resolve: (result) => {
          try {
            resolveResult(decode(result));
          } catch {
            reject(new Error("Le moteur a renvoyé une réponse invalide."));
          }
        },
        reject,
        timer,
      });
      child.stdin.write(JSON.stringify({ ...body, id }) + "\n", (error) => {
        if (error) failAll();
      });
    });
  };
  return {
    speak(text, language = "ja") {
      return call({ kind: "speech", text, language, style: 10 }, (result) => {
        const audio = Buffer.from(result.audio || "", "base64");
        if (
          audio.subarray(0, 4).toString() !== "RIFF" ||
          audio.subarray(8, 12).toString() !== "WAVE"
        )
          throw new Error("invalid_audio");
        return audio;
      });
    },
    async romanize(texts) {
      if (closed) throw new Error("Speech provider closed");
      const safe = readingsRequestSchema.parse(texts);
      if (!safe.length) return [];
      return call(
        { kind: "readings", texts: safe, language: "ja" },
        (result) => {
          const readings = z
            .array(z.string().max(2000))
            .max(50)
            .parse(result.readings);
          if (readings.length !== safe.length)
            throw new Error("invalid_readings_count");
          return readings;
        },
      );
    },
    close() {
      closed = true;
      failAll();
      worker?.kill();
      worker = undefined;
    },
  };
}

// Same engines and JSONL protocol, independent failure domains. French network
// delays cannot occupy or kill the Japanese worker. Audio cache is RAM-only.
export function createLocalSpeech({
  cacheAudio = true,
}: { cacheAudio?: boolean } = {}): SpeechProvider | undefined {
  const japanese = createSpeechLane();
  const french = createSpeechLane();
  if (!japanese || !french) return;
  const cache = new Map<string, Buffer>();
  const inFlight = new Map<string, Promise<Buffer>>();
  let bytes = 0;
  let closed = false;
  return {
    romanize(texts) {
      if (closed) return Promise.reject(new Error("Speech provider closed"));
      return japanese.romanize(texts);
    },
    speak(text, language = "ja") {
      if (closed) return Promise.reject(new Error("Speech provider closed"));
      const key = `${language}:${text}`;
      const cached = cacheAudio ? cache.get(key) : undefined;
      if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return Promise.resolve(cached);
      }
      const existing = inFlight.get(key);
      if (existing) return existing;
      const result = (language === "fr" ? french : japanese)
        .speak(text, language)
        .then((audio) => {
          if (cacheAudio && !closed && audio.length <= 8_000_000) {
            while (
              cache.size &&
              (cache.size >= 32 || bytes + audio.length > 8_000_000)
            ) {
              const oldest = cache.keys().next().value!;
              bytes -= cache.get(oldest)!.length;
              cache.delete(oldest);
            }
            cache.set(key, audio);
            bytes += audio.length;
          }
          return audio;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, result);
      return result;
    },
    close() {
      closed = true;
      cache.clear();
      bytes = 0;
      japanese.close();
      french.close();
    },
  };
}
