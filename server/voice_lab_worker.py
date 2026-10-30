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
    if not isinstance(raw, bytes) or len(raw) % 2 or not 2560 <= len(raw) <= 1_440_000:
        raise ValueError("invalid_pcm")
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def signal_metrics(audio):
    import numpy as np
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.max(np.abs(audio)))
    # Keep the same -60 dBFS gate, evaluated over 100 ms windows instead of
    # diluting a brief utterance across the whole capture and its silent tail.
    window_rms = max(float(np.sqrt(np.mean(audio[index:index+1600] ** 2)))
                     for index in range(0, len(audio), 1600))
    frames = [float(np.sqrt(np.mean(part ** 2))) for part in np.array_split(audio[:len(audio)//320*320], len(audio)//320)]
    voiced = [i for i, level in enumerate(frames) if level >= 0.008]
    return {
        "samples": len(audio), "duration_ms": len(audio) / 16,
        "rms_db_below_full_scale": -max(-100, 20 * math.log10(max(rms, 1e-5))),
        "window_rms_db_below_full_scale": -max(-100, 20 * math.log10(max(window_rms, 1e-5))),
        "peak": peak, "clipped_fraction": float(np.mean(np.abs(audio) >= 0.999)),
        "leading_energy_ms": voiced[0] * 20 if voiced else len(audio) / 16,
        "trailing_energy_ms": (len(frames) - 1 - voiced[-1]) * 20 if voiced else len(audio) / 16,
    }


def transcribe_request(request, *, model, transcribe, recognize):
    """Process one snapshot; dependencies make the boundary testable without MLX.

    Optional diagnostics are memory-only response fields, never files or logs.
    The full PCM is passed unchanged to Whisper; its own 30 s mel padding also
    supports the server's 80 ms minimum (not a claim of short-speech accuracy).
    """
    if request.get("language") not in ("ja", "auto"):
        raise ValueError("invalid_language")
    if type(request.get("diagnostic", False)) is not bool or type(request.get("partial", False)) is not bool:
        raise ValueError("invalid_diagnostic_request")
    diagnostic = request.get("diagnostic") is True and request.get("partial") is not True
    decode = time.monotonic()
    raw = base64.b64decode(request["pcm"], validate=True)
    if len(raw) % 2 or len(raw) > 1_440_000:
        raise ValueError("invalid_pcm")
    if len(raw) < 2560:
        response = {"id": request["id"], "text": "", "uncertain": True,
                    "metrics": {"duration_ms": len(raw) / 32, "samples": len(raw) // 2,
                                "pcm_decode": round((time.monotonic() - decode) * 1000, 3)}}
        if diagnostic:
            response["diagnostic"] = {"rawText": "", "detectedLanguage": "unknown",
                                      "acceptedSegments": 0, "rejectedSegments": 0, "signalGate": "too_short"}
        return response
    audio = pcm_samples(raw)
    metrics = signal_metrics(audio)
    metrics["pcm_decode"] = (time.monotonic() - decode) * 1000
    text, uncertain = "", False
    raw_text, language, accepted_count, rejected_count = "", "unknown", 0, 0
    gate = "quiet"
    if metrics["window_rms_db_below_full_scale"] <= 60:
        gate = "decoded"
        started = time.monotonic()
        with redirect_stdout(sys.stderr):
            result = transcribe(
                audio, path_or_hf_repo=str(model),
                language=None if request["language"] == "auto" else "ja",
                temperature=0, condition_on_previous_text=False,
                initial_prompt=None, verbose=None,
            )
        segments = result.get("segments", [])
        recognized = recognize(segments)
        text, uncertain = recognized["text"], recognized["uncertain"]
        metrics["asr"] = (time.monotonic() - started) * 1000
        if diagnostic:
            raw_text = result.get("text", "")
            if not isinstance(raw_text, str):
                raise ValueError("invalid_raw_text")
            detected = result.get("language")
            language = detected if detected in ("ja", "fr") else "other" if isinstance(detected, str) and detected else "unknown"
            # Mirror recognized_utterance's unchanged acceptance predicate.
            accepted_count = sum(s.get("no_speech_prob", 0) < 0.7 and s.get("avg_logprob", 0) > -1.2 for s in segments)
            rejected_count = len(segments) - accepted_count
    response = {"id": request["id"], "text": text[:1500], "uncertain": uncertain,
                "metrics": {key: round(value, 3) for key, value in metrics.items()}}
    if diagnostic:
        response["diagnostic"] = {"rawText": raw_text[:1000], "detectedLanguage": language,
                                  "acceptedSegments": accepted_count, "rejectedSegments": rejected_count,
                                  "signalGate": gate}
    return response


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
            response = transcribe_request(request, model=model, transcribe=mlx_whisper.transcribe,
                                          recognize=recognized_utterance)
        except Exception:
            # Never echo audio, transcript, filenames or exception payloads.
            response = {"id": request.get("id"), "error": "asr_failed"}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
