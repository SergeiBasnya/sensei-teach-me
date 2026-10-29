import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";

export function pcmWav(pcm: Buffer) {
  if (pcm.length % 2 || pcm.length > 1_440_000 || pcm.length < 3200)
    throw new Error("Invalid PCM");
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
type Sample = {
  id: string;
  audio: string;
  reference: string;
  humanValidated: false;
  kind: "speech";
  language: string;
  tags: string[];
  speechBounds: null;
};
/** Called only after explicit per-start consent, never from normal conversations. */
export function createVoiceLabSampleStore(root = resolve(".local/voice-lab")) {
  let serialized: Promise<unknown> = Promise.resolve();
  return async (
    pcm: Buffer,
    { language, signal }: { language: "auto" | "ja"; signal: AbortSignal },
  ) => {
    const result = serialized.then(async () => {
      if (signal.aborted) throw new Error("Sample cancelled");
      const directory = join(root, "samples");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const id = randomBytes(12).toString("hex");
      const path = join(root, "manifest-template.json");
      let cases: Sample[] = [];
      try {
        const manifest: unknown = JSON.parse(await readFile(path, "utf8"));
        if (
          !manifest ||
          typeof manifest !== "object" ||
          !("cases" in manifest) ||
          !Array.isArray(manifest.cases)
        )
          throw new Error("Invalid sample index");
        cases = manifest.cases as Sample[];
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
      }
      if (cases.length >= 100) throw new Error("Sample limit reached");
      const audio = `samples/${id}.wav`;
      if (signal.aborted) throw new Error("Sample cancelled");
      await writeFile(join(root, audio), pcmWav(pcm), {
        flag: "wx",
        mode: 0o600,
      });
      cases.push({
        id,
        audio,
        reference: "",
        humanValidated: false,
        kind: "speech",
        language: language === "ja" ? "ja" : "mixed",
        tags: ["phone-lab", "review-required"],
        speechBounds: null,
      });
      const manifest = {
        schemaVersion: 1,
        captureType: "human",
        consentToLocalEvaluation: true,
        humanValidated: false,
        cases,
      };
      const temp = path + ".tmp";
      await writeFile(temp, JSON.stringify(manifest, null, 2) + "\n", {
        mode: 0o600,
      });
      await rename(temp, path);
      return { id };
    });
    serialized = result.catch(() => {});
    return result;
  };
}
