import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { localOrigins } from "./local-origins";

const directory = resolve(".local/conversation");
mkdirSync(directory, { recursive: true });
const path = resolve(directory, "access-token");
if (!existsSync(path))
  writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600 });
process.env.SENSEI_ACCESS_TOKEN = readFileSync(path, "utf8").trim();
process.env.SENSEI_PROVIDER = "local";
if (process.argv.includes("--voice-lab")) process.env.SENSEI_VOICE_LAB = "1";
process.env.HOST = process.argv.includes("--lan") ? "0.0.0.0" : "127.0.0.1";
process.env.PORT = "8787";
process.env.SENSEI_LOCAL_PREVIEW = "1";
process.env.ALLOWED_ORIGINS = localOrigins(process.argv.includes("--lan")).join(
  ",",
);
void import("../server/index").catch(() => {
  process.stderr.write(
    "Le serveur local n’a pas pu démarrer. Vérifie les moteurs et le port 8787.\n",
  );
  process.exitCode = 1;
});
