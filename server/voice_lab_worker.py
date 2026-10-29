"""Isolated PCM snapshot ASR; no microphone, files, download or teaching side effect."""
import base64
from contextlib import redirect_stdout
import json
import math
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
LOCAL = Path(os.environ.get("SENSEI_LOCAL_ROOT", ROOT / ".local/conversation"))
os.environ.setdefault("HF_HOME", str(LOCAL / "hf"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("NUMBA_CACHE_DIR", str(LOCAL / "numba"))


def pcm_samples(raw):
    import numpy as np
    if not isinstance(raw, bytes) or len(raw) % 2 or not 3200 <= len(raw) <= 1_440_000:
        raise ValueError("invalid_pcm")
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def signal_metrics(audio):
    import numpy as np
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.max(np.abs(audio)))
    frames = [float(np.sqrt(np.mean(part ** 2))) for part in np.array_split(audio[:len(audio)//320*320], len(audio)//320)]
    voiced = [i for i, level in enumerate(frames) if level >= 0.008]
    return {
        "samples": len(audio), "duration_ms": len(audio) / 16,
        "rms_db_below_full_scale": -max(-100, 20 * math.log10(max(rms, 1e-5))),
        "peak": peak, "clipped_fraction": float(np.mean(np.abs(audio) >= 0.999)),
        "leading_energy_ms": voiced[0] * 20 if voiced else len(audio) / 16,
        "trailing_energy_ms": (len(frames) - 1 - voiced[-1]) * 20 if voiced else len(audio) / 16,
    }


def main():
    with redirect_stdout(sys.stderr):
        import mlx.core as mx
        import mlx_whisper
        from mlx_whisper.transcribe import ModelHolder
        from conversation_worker import recognized_utterance
        model = Path(os.environ.get("SENSEI_LAB_WHISPER_MODEL", LOCAL / "models/whisper")).resolve()
        if not (model / "config.json").is_file():
            raise ValueError("local_model_required")
        ModelHolder.get_model(str(model), mx.float16)
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if request.get("language") not in ("ja", "auto"):
                raise ValueError("invalid_language")
            decode = time.monotonic()
            audio = pcm_samples(base64.b64decode(request["pcm"], validate=True))
            metrics = signal_metrics(audio)
            metrics["pcm_decode"] = (time.monotonic() - decode) * 1000
            text, uncertain = "", False
            if metrics["rms_db_below_full_scale"] <= 60:
                started = time.monotonic()
                with redirect_stdout(sys.stderr):
                    result = mlx_whisper.transcribe(
                        audio, path_or_hf_repo=str(model),
                        language=None if request["language"] == "auto" else "ja",
                        temperature=0, condition_on_previous_text=False,
                        initial_prompt=None, verbose=None,
                    )
                recognized = recognized_utterance(result.get("segments", []))
                text, uncertain = recognized["text"], recognized["uncertain"]
                metrics["asr"] = (time.monotonic() - started) * 1000
            response = {"id": request["id"], "text": text[:1500], "uncertain": uncertain,
                        "metrics": {key: round(value, 3) for key, value in metrics.items()}}
        except Exception:
            # Never echo audio, transcript, filenames or exception payloads.
            response = {"id": request.get("id"), "error": "asr_failed"}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
