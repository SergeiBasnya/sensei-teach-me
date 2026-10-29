"""Opt-in, private WAV comparison. No inference occurs on import or by default."""
from __future__ import annotations

import argparse
from array import array
from contextlib import redirect_stderr, redirect_stdout
import hashlib
from importlib import metadata
import io
import json
import math
import os
from pathlib import Path
import platform
import resource
import statistics
import subprocess
import sys
import time
import unicodedata
import wave

ROOT = Path(__file__).resolve().parents[1]
BILINGUAL_PROMPT = "日本語とフランス語の会話。こんにちは。Je ne sais pas. Peux-tu m’aider ?"
PROFILES = {
    "small-auto-prompt": {"language": None, "initial_prompt": BILINGUAL_PROMPT},
    "small-ja-prompt": {"language": "ja", "initial_prompt": BILINGUAL_PROMPT},
    "small-auto-no-prompt": {"language": None, "initial_prompt": None},
    "small-ja-no-prompt": {"language": "ja", "initial_prompt": None},
}
HUMAN_ANNOTATION_FIELDS = (
    "intentError", "pedagogicalError", "normalizedSpokenError",
    "cutoffObserved", "unjustifiedRepeat",
)


class ComparisonError(ValueError):
    """Safe error code only: never echo private paths, audio or reference text."""


def private_path(path: Path) -> Path:
    """Accept outside Git or ignored/untracked paths; reject publishable locations."""
    path = path.expanduser().resolve()
    parent = path.parent
    while not parent.exists() and parent != parent.parent:
        parent = parent.parent
    try:
        result = subprocess.run(
            ["git", "-C", str(parent), "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=False,
        )
    except FileNotFoundError as error:
        raise ComparisonError("git-privacy-check-unavailable") from error
    if result.returncode == 0:
        repo = Path(result.stdout.strip()).resolve()
        relative = str(path.relative_to(repo))
        tracked = subprocess.run(["git", "-C", str(repo), "ls-files", "--error-unmatch", "--", relative], capture_output=True)
        ignored = subprocess.run(["git", "-C", str(repo), "check-ignore", "--quiet", "--", relative], capture_output=True)
        if tracked.returncode == 0 or ignored.returncode != 0:
            raise ComparisonError("private-file-must-be-outside-git-or-ignored")
    return path


def read_json(path: Path):
    private_path(path)
    try:
        if path.stat().st_size > 5_000_000:
            raise ComparisonError("json-too-large")
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ComparisonError("invalid-private-json") from error


def inspect_pcm(path: Path) -> tuple[dict, bytes]:
    private_path(path)
    try:
        with wave.open(str(path), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, "NONE"):
                raise ComparisonError("require-pcm16-mono-16000hz")
            frames = audio.getnframes()
            if not 1 <= frames <= 60 * 16000:
                raise ComparisonError("wav-duration-outside-0-to-60-seconds")
            data = audio.readframes(frames)
            if len(data) != frames * 2:
                raise ComparisonError("truncated-pcm")
    except (OSError, EOFError, wave.Error) as error:
        raise ComparisonError("invalid-wav") from error
    samples = array("h")
    samples.frombytes(data)
    if sys.byteorder != "little":
        samples.byteswap()
    rms = math.sqrt(sum(value * value for value in samples) / frames) / 32768
    window = max(1, min(160, frames))
    edge_rms = lambda values: math.sqrt(sum(v * v for v in values) / len(values)) / 32768
    return {
        "sampleRate": 16000, "channels": 1, "sampleWidthBytes": 2,
        "durationMs": frames / 16,
        "pcmSha256": hashlib.sha256(data).hexdigest(),
        "rmsDbfs": round(20 * math.log10(rms), 2) if rms else None,
        "peakDbfs": round(20 * math.log10(max(abs(v) for v in samples) / 32768), 2) if any(samples) else None,
        "clippedSampleFraction": sum(abs(v) >= 32760 for v in samples) / frames,
        "first10msRms": edge_rms(samples[:window]),
        "last10msRms": edge_rms(samples[-window:]),
        "productionGateWouldSkip": frames < 3200 or rms < 0.001,
    }, data


def load_manifest(path: Path) -> list[dict]:
    payload = read_json(path)
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ComparisonError("invalid-manifest-schema")
    if payload.get("humanValidated") is not True or payload.get("captureType") != "human" or payload.get("consentToLocalEvaluation") is not True:
        raise ComparisonError("pending-human-reference-validation")
    cases = payload.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 200:
        raise ComparisonError("require-1-to-200-cases")
    result, seen = [], set()
    for item in cases:
        if not isinstance(item, dict) or item.get("humanValidated") is not True:
            raise ComparisonError("pending-human-reference-validation")
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier.isascii() or not identifier.replace("-", "").replace("_", "").isalnum() or identifier in seen:
            raise ComparisonError("invalid-or-duplicate-anonymous-case-id")
        seen.add(identifier)
        reference = item.get("reference")
        kind = item.get("kind", "speech")
        if not isinstance(reference, str) or len(reference) > 1500 or kind not in ("speech", "silence") or (kind == "speech" and not reference.strip()) or (kind == "silence" and reference.strip()):
            raise ComparisonError("invalid-reference")
        if item.get("language") not in ("ja", "fr", "mixed", "none"):
            raise ComparisonError("invalid-reference-language")
        if (kind == "silence") != (item["language"] == "none"):
            raise ComparisonError("reference-language-kind-mismatch")
        tags = item.get("tags", [])
        if not isinstance(tags, list) or len(tags) > 16 or any(not isinstance(tag, str) or not tag.isascii() or not tag.replace("-", "").replace("_", "").isalnum() for tag in tags):
            raise ComparisonError("invalid-anonymous-tags")
        if not isinstance(item.get("audio"), str) or not item["audio"]:
            raise ComparisonError("missing-wav")
        audio_path = private_path(path.parent / item["audio"])
        audio, _ = inspect_pcm(audio_path)
        bounds = item.get("speechBounds")
        if bounds is not None:
            if not isinstance(bounds, dict) or any(type(bounds.get(key)) not in (int, float) or not math.isfinite(bounds[key]) for key in ("startMs", "endMs")) or not 0 <= bounds["startMs"] < bounds["endMs"] <= audio["durationMs"]:
                raise ComparisonError("invalid-human-speech-bounds")
            audio["humanLeadingPaddingMs"] = bounds["startMs"]
            audio["humanTrailingPaddingMs"] = audio["durationMs"] - bounds["endMs"]
        result.append({**item, "audioPath": audio_path, "audioDiagnostics": audio})
    return result


def normalized_characters(text: str) -> str:
    # No kana/kanji folding, grammatical repair, numeral replacement or filler removal.
    value = unicodedata.normalize("NFKC", text).casefold()
    return "".join(c for c in value if not c.isspace() and not unicodedata.category(c).startswith("P"))


def distance(reference: str, hypothesis: str) -> int:
    previous = list(range(len(hypothesis) + 1))
    for index, expected in enumerate(reference, 1):
        current = [index]
        for column, observed in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, previous[column] + 1, previous[column - 1] + (expected != observed)))
        previous = current
    return previous[-1]


def character_error(reference: str, hypothesis: str, normalized: bool) -> dict:
    transform = normalized_characters if normalized else lambda value: unicodedata.normalize("NFC", value)
    expected, observed = transform(reference), transform(hypothesis)
    edits = distance(expected, observed)
    return {"edits": edits, "referenceChars": len(expected), "cer": edits / len(expected) if expected else None, "emptyReferenceInsertionChars": len(observed) if not expected else 0}


def production_candidate(result: dict, quiet: bool) -> dict:
    segments = result.get("segments", [])
    accepted = [s for s in segments if s.get("no_speech_prob", 0) < 0.7 and s.get("avg_logprob", 0) > -1.2]
    uncertain = len(accepted) != len(segments) or any(s.get("avg_logprob", 0) < -0.55 or s.get("no_speech_prob", 0) > 0.4 or s.get("compression_ratio", 0) > 2.4 for s in accepted)
    text = "" if quiet else "".join(s["text"] for s in accepted).strip()
    return {"text": text, "uncertain": uncertain if not quiet else False, "discardedSegments": len(segments) - len(accepted), "productionWouldAskRepeat": quiet or uncertain or not bool(text)}


def validate_observations(payload, cases: list[dict]) -> list[dict]:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("observations"), list):
        raise ComparisonError("invalid-observations-schema")
    ids = {item["id"] for item in cases}
    rows, seen = [], set()
    for item in payload["observations"]:
        if not isinstance(item, dict) or item.get("caseId") not in ids or item.get("profile") not in PROFILES:
            raise ComparisonError("unknown-case-or-profile")
        repeat = item.get("repeat", 0)
        key = (item["caseId"], item["profile"], repeat)
        if type(repeat) is not int or repeat < 0 or key in seen:
            raise ComparisonError("invalid-or-duplicate-observation")
        seen.add(key)
        for field in ("transcript", "candidateText"):
            if not isinstance(item.get(field), str) or len(item[field]) > 5000:
                raise ComparisonError("invalid-transcript")
        for field in ("asrMs", "processRssHighWaterBytes"):
            value = item.get(field)
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
                raise ComparisonError("invalid-measurement")
        annotation = item.get("humanAnnotation")
        if annotation is not None:
            if not isinstance(annotation, dict) or annotation.get("humanValidated") is not True or any(annotation.get(field) is not None and type(annotation[field]) is not bool for field in HUMAN_ANNOTATION_FIELDS):
                raise ComparisonError("invalid-human-annotation")
        rows.append(item)
    return rows


def build_report(cases: list[dict], rows: list[dict], origin: str) -> dict:
    by_id = {item["id"]: item for item in cases}
    summaries = {}
    for profile in PROFILES:
        observations = [row for row in rows if row["profile"] == profile]
        variants = {}
        for field in ("transcript", "candidateText"):
            for normalized in (False, True):
                values = [character_error(by_id[row["caseId"]]["reference"], row[field], normalized) for row in observations]
                denominator = sum(value["referenceChars"] for value in values)
                variants[field + ("Normalized" if normalized else "Strict")] = {
                    "edits": sum(value["edits"] for value in values), "referenceChars": denominator,
                    "cer": sum(value["edits"] for value in values) / denominator if denominator else None,
                    "emptyReferenceInsertionChars": sum(value["emptyReferenceInsertionChars"] for value in values),
                }
        annotations = {}
        for field in HUMAN_ANNOTATION_FIELDS:
            reviewed = [row["humanAnnotation"][field] for row in observations if isinstance(row.get("humanAnnotation"), dict) and row["humanAnnotation"].get("humanValidated") is True and type(row["humanAnnotation"].get(field)) is bool]
            annotations[field] = {"reviewed": len(reviewed), "errors": sum(reviewed), "rate": sum(reviewed) / len(reviewed) if reviewed else None, "pending": len(observations) - len(reviewed)}
        latency = [row["asrMs"] for row in observations if row.get("asrMs") is not None]
        language_metrics = {}
        for language in ("ja", "fr", "mixed", "none"):
            subset = [row for row in observations if by_id[row["caseId"]]["language"] == language]
            values = [character_error(by_id[row["caseId"]]["reference"], row["candidateText"], True) for row in subset]
            denominator = sum(value["referenceChars"] for value in values)
            language_metrics[language] = {"observations": len(subset), "normalizedCer": sum(value["edits"] for value in values) / denominator if denominator else None, "emptyReferenceInsertionChars": sum(value["emptyReferenceInsertionChars"] for value in values)}
        summaries[profile] = {"observations": len(observations), "caseCoverage": len({row["caseId"] for row in observations}), "cer": variants, "byLanguage": language_metrics, "humanAnnotations": annotations, "productionRepeatRequests": sum(row.get("productionWouldAskRepeat") is True for row in observations), "medianAsrMs": statistics.median(latency) if latency else None, "maxProcessRssHighWaterBytes": max((row.get("processRssHighWaterBytes") or 0 for row in observations), default=0) or None}
    return {
        "schemaVersion": 1, "status": "pending-human",
        "comparisonStatus": "asr-observed-human-review-required" if rows else "pending-asr" if cases else "pending-corpus",
        "recommendation": {"status": "pending-human", "promoteProfile": None},
        "provenance": origin, "humanReferenceValidation": "operator-attested" if cases else "absent",
        "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "profileConfiguration": {name: {"language": options["language"], "initialPrompt": "bilingual" if options["initial_prompt"] else "none", "temperature": 0, "conditionOnPreviousText": False} for name, options in PROFILES.items()},
        "profiles": summaries,
        "cases": [{"id": item["id"], "language": item["language"], "kind": item.get("kind", "speech"), "tags": item.get("tags", []), "audio": item["audioDiagnostics"]} for item in cases],
        "limits": ["CER is textual, not pronunciation or grammar assessment.", "No automatic intent or teaching-quality verdict.", "Normalized spoken errors, observed cutoffs and unjustified repeats are separate nullable human annotations, never inferred from CER or waveform energy.", "A cutoff requires an operator observation; the captured WAV alone cannot prove a missing syllable.", "Each human field uses its own reviewed denominator; missing or inapplicable observations stay null.", "candidateText is the segment-filtered text; uncertain candidates trigger repetition in production.", "The lab decodes silence too; productionGateWouldSkip describes the production precheck.", "RSS is process lifetime high-water, not GPU memory or per-profile allocation.", "ASR wall time is not end-of-speech to first audible response.", "Compare paired case coverage and languages before interpreting aggregate CER."],
    }


def run_local(cases: list[dict], model: Path, repeats: int) -> tuple[list[dict], dict]:
    if not model.is_dir() or not (model / "config.json").is_file() or not any(model.glob("*.safetensors")) and not any(model.glob("*.npz")):
        raise ComparisonError("local-model-not-installed-no-download-performed")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    # All heavy imports are behind the explicit CLI flag and validated corpus.
    import numpy as np
    import mlx.core as mx
    import mlx_whisper
    from mlx_whisper.transcribe import ModelHolder
    started = time.perf_counter()
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        ModelHolder.get_model(str(model), mx.float16)
        mx.synchronize()
    load_ms = (time.perf_counter() - started) * 1000
    rows = []
    for repeat in range(repeats):
        for case in cases:
            diagnostics, pcm = inspect_pcm(case["audioPath"])
            audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
            profiles = list(PROFILES)
            shift = repeat % len(profiles)
            for profile in profiles[shift:] + profiles[:shift]:
                started = time.perf_counter()
                with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                    result = mlx_whisper.transcribe(audio, path_or_hf_repo=str(model), temperature=0, condition_on_previous_text=False, verbose=None, **PROFILES[profile])
                    mx.synchronize()
                elapsed = (time.perf_counter() - started) * 1000
                candidate = production_candidate(result, diagnostics["productionGateWouldSkip"])
                rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                rows.append({"caseId": case["id"], "profile": profile, "repeat": repeat, "transcript": result["text"].strip(), "candidateText": candidate["text"], "uncertain": candidate["uncertain"], "discardedSegments": candidate["discardedSegments"], "productionWouldAskRepeat": candidate["productionWouldAskRepeat"], "asrMs": elapsed, "firstInference": not rows, "processRssHighWaterBytes": rss if sys.platform == "darwin" else rss * 1024, "humanAnnotation": None})
    # Fingerprint after inference so this read does not prewarm weights before load.
    fingerprints = {}
    for path in sorted([model / "config.json", *model.glob("*.safetensors"), *model.glob("*.npz")]):
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        fingerprints[path.name] = digest.hexdigest()
    return rows, {"modelLoadMs": load_ms, "firstInferenceIsColdForAllProfiles": False, "platform": platform.system(), "machine": platform.machine(), "python": platform.python_version(), "packages": {name: metadata.version(name) for name in ("mlx", "mlx-whisper", "numpy")}, "modelFilesSha256": fingerprints}


def write_private(path: Path, payload):
    path = private_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as target:
        target.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--observations-in", type=Path)
    parser.add_argument("--observations-out", type=Path)
    parser.add_argument("--run-models", action="store_true", help="Explicitly load only the already installed local Whisper model; run alone, no production workers.")
    parser.add_argument("--model-dir", type=Path, default=ROOT / ".local/conversation/models/whisper")
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args(argv)
    if not 1 <= args.repeats <= 10 or args.run_models and args.observations_in:
        parser.error("Use 1-10 repeats and choose inference OR imported observations.")
    try:
        if args.run_models and not args.observations_out:
            raise ComparisonError("private-observations-output-required-for-human-review")
        for path in (args.report, args.observations_out):
            if path is not None:
                private_path(path)
                if path.exists():
                    raise ComparisonError("output-already-exists-choose-a-new-run")
        cases = load_manifest(args.manifest) if args.manifest and args.manifest.exists() else []
        rows, environment = [], None
        if args.observations_in:
            rows = validate_observations(read_json(args.observations_in), cases)
        elif args.run_models:
            if not cases:
                raise ComparisonError("pending-human-corpus")
            rows, environment = run_local(cases, args.model_dir.resolve(), args.repeats)
            validate_observations({"schemaVersion": 1, "observations": rows}, cases)
        report = build_report(cases, rows, "measured-locally" if args.run_models else "imported-private-observations" if args.observations_in else "no-inference")
        if environment:
            report["environment"] = environment
        if args.observations_out:
            write_private(args.observations_out, {"schemaVersion": 1, "observations": rows})
        if args.report:
            write_private(args.report, report)
        # No private paths, transcripts, references, speaker names or audio in stdout.
        print(json.dumps({"status": report["status"], "comparisonStatus": report["comparisonStatus"], "cases": len(cases), "observations": len(rows), "modelLaunched": args.run_models}))
        return 0
    except ComparisonError as error:
        print(json.dumps({"status": "pending-human", "error": str(error), "modelRunCompleted": False}))
        return 2
    except Exception as error:
        print(json.dumps({"status": "incomplete", "errorType": type(error).__name__}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
