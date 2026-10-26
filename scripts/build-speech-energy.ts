import { readFileSync, writeFileSync } from "node:fs";
import {
  speechEnergyFromWav,
  type SpeechEnergy,
} from "../src/lib/speech-energy";
const manifest = JSON.parse(
  readFileSync("assets/speech/manifest.json", "utf8"),
) as { phrases: Record<string, string> };
const values: Record<string, SpeechEnergy> = {};
for (const [text, filename] of Object.entries(manifest.phrases)) {
  const energy = speechEnergyFromWav(
    readFileSync(`assets/speech/${filename}`).toString("base64"),
  );
  if (!energy) throw new Error(`Format vocal non analysable : ${filename}`);
  values[text] = energy;
}
writeFileSync(
  "src/data/recorded-energy.ts",
  `// Généré depuis les WAV existants ; aucun audio ni texte modifié.\nimport type { SpeechEnergy } from "../lib/speech-energy";\nexport const recordedEnergy: Readonly<Record<string, SpeechEnergy>> = ${JSON.stringify(values)};\n`,
);
console.log(`${Object.keys(values).length} enveloppes vocales calculées.`);
