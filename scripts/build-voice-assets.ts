import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { scenes, freeScene, dailyPhrase } from "../src/data/lessons";

const phrases = new Set([dailyPhrase.japanese, freeScene.ending.japanese]);
for (const scene of [...scenes, freeScene]) {
  phrases.add(scene.ending.japanese);
  for (const turn of scene.turns) {
    phrases.add(turn.tutor.japanese);
    phrases.add(turn.suggestion.japanese);
  }
}
mkdirSync(".local/voicevox", { recursive: true });
writeFileSync(".local/voicevox/phrases.json", JSON.stringify([...phrases]));
const python =
  process.env.VOICEVOX_PYTHON ||
  (process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python");
const result = spawnSync(python, ["scripts/render-voice-assets.py"], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
