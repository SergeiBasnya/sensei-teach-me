"""Enregistre les phrases déjà présentes, sans réécriture, avec une voix officielle."""
import hashlib
import json
import os
from pathlib import Path
import sys
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from voice_worker import create_synthesizer, synthesize

synth = create_synthesizer()
style = 10
credit = {10: "VOICEVOX:雨晴はう", 11: "VOICEVOX:玄野武宏"}[style]
folder = Path("assets/speech")
folder.mkdir(parents=True, exist_ok=True)
manifest = {}
for text in json.loads(Path(".local/voicevox/phrases.json").read_text()):
    key = hashlib.sha256(f"voicevox-0.17.1|vvm-0.17.0|{style}|1.0|{text}".encode()).hexdigest()[:20]
    path = folder / f"{key}.wav"
    if not path.exists():
        path.write_bytes(synthesize(synth, text, style))
    with wave.open(str(path)) as wav:
        if wav.getnframes() < 100 or wav.getnchannels() != 1:
            raise ValueError(f"Audio invalide : {key}")
    manifest[text] = path.name
lines = ["// Généré par npm run voice:assets. Textes inchangés ; débit, hauteur et intonation à 1×.", "export const recordedSpeech: Readonly<Record<string, number>> = {"]
for text, filename in manifest.items():
    lines.append(f"  {json.dumps(text, ensure_ascii=False)}: require({json.dumps('../../assets/speech/' + filename)}),")
lines.extend(["};", f"export const voiceCredit = {json.dumps(credit, ensure_ascii=False)};", ""])
Path("src/data/recorded-speech.ts").write_text("\n".join(lines))
Path("assets/speech/manifest.json").write_text(json.dumps({"engine": "VOICEVOX CORE 0.17.1", "model": "0.17.0", "credit": credit, "style": style, "speed": 1.0, "pitch": 0.0, "intonation": 1.0, "phrases": manifest}, ensure_ascii=False, indent=2) + "\n")
print(f"{len(manifest)} phrases enregistrées ; {credit} ; vitesse normale.")
