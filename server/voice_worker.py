"""VOICEVOX local, protocole JSONL sur stdin/stdout ; aucun service système."""
import base64
import json
import os
from pathlib import Path
import sys

from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile


def create_synthesizer():
    root = Path(os.environ.get("VOICEVOX_ROOT", ".local/voicevox/runtime"))
    libraries = list((root / "onnxruntime/lib").glob("*voicevox*"))
    if not libraries:
        raise RuntimeError("VOICEVOX ONNX Runtime absent")
    synth = Synthesizer(
        Onnxruntime.load_once(filename=str(libraries[0])),
        OpenJtalk(str(root / "dict/open_jtalk_dic_utf_8-1.11")),
        acceleration_mode="CPU",
        cpu_num_threads=2,
    )
    for model_id in (0, 4):
        path = root / f"models/vvms/{model_id}.vvm"
        if path.exists():
            with VoiceModelFile.open(str(path)) as model:
                synth.load_voice_model(model)
    return synth


def synthesize(synth, text, style):
    if style not in (10, 11) or not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
        raise ValueError("Requête vocale invalide")
    query = synth.create_audio_query(text.strip(), style)
    query.speed_scale = 1.0
    query.pitch_scale = 0.0
    query.intonation_scale = 1.0
    return synth.synthesis(query, style)


def main():
    synth = create_synthesizer()
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            wav = synthesize(synth, request["text"], request.get("style", 10))
            response = {"id": request["id"], "audio": base64.b64encode(wav).decode("ascii")}
        except Exception:
            response = {"id": request.get("id"), "error": "La synthèse vocale locale a échoué."}
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
