"""Synthetic fixture tests only; these never validate a human voice or run ASR."""
import importlib.util
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import wave

SOURCE = Path(__file__).resolve().parents[1] / "scripts/compare-human-asr.py"
SPEC = importlib.util.spec_from_file_location("asr_comparison", SOURCE)
asr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(asr)


def wav(path, values=None, rate=16000, channels=1, width=2):
    values = values if values is not None else [1200] * 1600 + [0] * 1600
    with wave.open(str(path), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(width)
        target.setframerate(rate)
        target.writeframes(b"".join(struct.pack("<h", v) for v in values) if width == 2 else bytes([128] * len(values)))


class PcmTests(unittest.TestCase):
    def test_pcm_validation_and_signal_diagnostics(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.wav"
            wav(path)
            metrics, pcm = asr.inspect_pcm(path)
            self.assertEqual(len(pcm), 6400)
            self.assertEqual(metrics["durationMs"], 200)
            self.assertFalse(metrics["productionGateWouldSkip"])
            self.assertGreater(metrics["first10msRms"], 0)
            self.assertEqual(metrics["last10msRms"], 0)
            self.assertEqual(metrics["clippedSampleFraction"], 0)

    def test_wrong_rate_channels_and_width_are_not_silently_converted(self):
        with tempfile.TemporaryDirectory() as folder:
            for number, options in enumerate(({"rate": 48000}, {"channels": 2}, {"width": 1})):
                path = Path(folder) / f"fixture-{number}.wav"
                wav(path, **options)
                with self.subTest(options=options), self.assertRaisesRegex(asr.ComparisonError, "pcm16"):
                    asr.inspect_pcm(path)

    def test_truncated_pcm_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.wav"
            wav(path)
            path.write_bytes(path.read_bytes()[:-20])
            with self.assertRaises(asr.ComparisonError):
                asr.inspect_pcm(path)

    def test_silence_clipping_and_zero_length_are_explicit(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.wav"
            wav(path, [0] * 3200)
            metrics, _ = asr.inspect_pcm(path)
            self.assertIsNone(metrics["rmsDbfs"])
            self.assertTrue(metrics["productionGateWouldSkip"])
            wav(path, [32767] * 3200)
            self.assertEqual(asr.inspect_pcm(path)[0]["clippedSampleFraction"], 1)
            wav(path, [])
            with self.assertRaises(asr.ComparisonError):
                asr.inspect_pcm(path)


class ReferenceTests(unittest.TestCase):
    def manifest(self, folder):
        path = Path(folder) / "manifest.json"
        wav(Path(folder) / "fixture.wav")
        payload = {
            "schemaVersion": 1, "captureType": "human", "consentToLocalEvaluation": True,
            "humanValidated": True,
            "cases": [{"id": "unit-fixture", "kind": "speech", "audio": "fixture.wav", "reference": "フランスです。", "language": "ja", "tags": ["unit-fixture"], "humanValidated": True, "speechBounds": {"startMs": 10, "endMs": 100}}],
        }
        # Flags exercise a validator contract, not a claim of real human recording.
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path, payload

    def test_requires_human_attestation_at_root_and_each_reference(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = self.manifest(folder)
            cases = asr.load_manifest(path)
            self.assertEqual(cases[0]["audioDiagnostics"]["humanTrailingPaddingMs"], 100)
            for location in (payload, payload["cases"][0]):
                location["humanValidated"] = False
                path.write_text(json.dumps(payload), encoding="utf-8")
                with self.assertRaisesRegex(asr.ComparisonError, "pending-human"):
                    asr.load_manifest(path)
                location["humanValidated"] = True

    def test_bounds_and_empty_speech_reference_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = self.manifest(folder)
            payload["cases"][0]["speechBounds"]["endMs"] = 9999
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(asr.ComparisonError, "bounds"):
                asr.load_manifest(path)
            payload["cases"][0]["speechBounds"] = None
            payload["cases"][0]["reference"] = ""
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(asr.ComparisonError, "reference"):
                asr.load_manifest(path)

    def test_private_paths_are_outside_git_or_ignored_and_never_tracked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True, capture_output=True)
            (root / ".gitignore").write_text("private/\n")
            with self.assertRaises(asr.ComparisonError):
                asr.private_path(root / "publishable.json")
            self.assertEqual(asr.private_path(root / "private/data.json"), (root / "private/data.json").resolve())
            (root / "private").mkdir()
            tracked = root / "private/data.json"
            tracked.write_text("{}")
            subprocess.run(["git", "-C", str(root), "add", "--force", "private/data.json"], check=True, capture_output=True)
            with self.assertRaises(asr.ComparisonError):
                asr.private_path(tracked)

    def test_absent_corpus_never_calls_a_model_and_writes_no_text(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(asr, "run_local", side_effect=AssertionError("must not load")) as model:
            destination = Path(folder) / "summary.json"
            output = io.StringIO()
            with redirect_stdout(output):
                code = asr.main(["--report", str(destination)])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(output.getvalue())["comparisonStatus"], "pending-corpus")
            model.assert_not_called()
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                asr.write_private(destination, {})


class ComparisonTests(unittest.TestCase):
    def test_profiles_isolate_language_and_prompt_without_changing_weights(self):
        self.assertEqual(len(asr.PROFILES), 4)
        self.assertIsNone(asr.PROFILES["small-auto-prompt"]["language"])
        self.assertEqual(asr.PROFILES["small-ja-prompt"]["language"], "ja")
        self.assertIsNone(asr.PROFILES["small-auto-no-prompt"]["initial_prompt"])

    def test_character_error_preserves_real_differences_and_empty_reference(self):
        self.assertEqual(asr.distance("abc", "adc"), 1)
        self.assertEqual(asr.character_error("フランスです。", "フランス です", True)["cer"], 0)
        self.assertGreater(asr.character_error("フランスです。", "フランス です", False)["cer"], 0)
        self.assertGreater(asr.character_error("私は", "私わ", True)["cer"], 0)
        self.assertGreater(asr.character_error("日本語", "にほんご", True)["cer"], 0)
        self.assertGreater(asr.character_error("ええとフランス", "フランス", True)["cer"], 0)
        silence = asr.character_error("", "こんにちは", True)
        self.assertIsNone(silence["cer"])
        self.assertEqual(silence["emptyReferenceInsertionChars"], 5)

    def test_filter_reproduces_uncertainty_without_a_pronunciation_score(self):
        segments = [{"text": "フランス", "no_speech_prob": 0.1, "avg_logprob": -0.6}, {"text": "noise", "no_speech_prob": 0.9, "avg_logprob": -2}]
        value = asr.production_candidate({"segments": segments}, False)
        self.assertEqual(value["text"], "フランス")
        self.assertTrue(value["uncertain"])
        self.assertTrue(value["productionWouldAskRepeat"])
        self.assertEqual(value["discardedSegments"], 1)
        self.assertEqual(asr.production_candidate({"segments": segments}, True)["text"], "")

    def test_human_intent_and_teaching_annotations_are_independent_of_cer(self):
        cases = [{"id": "unit", "reference": "フランス", "language": "ja", "audioDiagnostics": {}}]
        row = {"caseId": "unit", "profile": "small-auto-prompt", "repeat": 0, "transcript": "フランス", "candidateText": "フランス", "asrMs": 25, "humanAnnotation": {"humanValidated": True, "intentError": True, "pedagogicalError": None}}
        rows = asr.validate_observations({"schemaVersion": 1, "observations": [row]}, cases)
        report = asr.build_report(cases, rows, "unit-test-only")
        result = report["profiles"][row["profile"]]
        self.assertEqual(result["cer"]["transcriptNormalized"]["cer"], 0)
        self.assertEqual(result["humanAnnotations"]["intentError"]["rate"], 1)
        self.assertIsNone(result["humanAnnotations"]["pedagogicalError"]["rate"])
        self.assertEqual(report["recommendation"]["status"], "pending-human")
        self.assertNotIn("フランス", json.dumps(report, ensure_ascii=False))
        row["humanAnnotation"]["humanValidated"] = False
        with self.assertRaisesRegex(asr.ComparisonError, "annotation"):
            asr.validate_observations({"schemaVersion": 1, "observations": [row]}, cases)

    def test_observations_cannot_fake_duplicate_or_negative_timings(self):
        cases = [{"id": "unit"}]
        row = {"caseId": "unit", "profile": "small-ja-prompt", "transcript": "", "candidateText": "", "asrMs": -1}
        with self.assertRaisesRegex(asr.ComparisonError, "measurement"):
            asr.validate_observations({"schemaVersion": 1, "observations": [row]}, cases)
        row["asrMs"] = None
        with self.assertRaisesRegex(asr.ComparisonError, "duplicate"):
            asr.validate_observations({"schemaVersion": 1, "observations": [row, row]}, cases)

    def test_new_human_annotations_have_separate_nullable_denominators(self):
        cases = [{"id": "unit", "reference": "フランス", "language": "ja", "audioDiagnostics": {}}]
        base = {"caseId": "unit", "profile": "small-auto-prompt", "transcript": "フランス", "candidateText": "フランス", "asrMs": 20}
        rows = [
            {**base, "repeat": 0, "humanAnnotation": {"humanValidated": True, "normalizedSpokenError": True, "cutoffObserved": None, "unjustifiedRepeat": False}},
            {**base, "repeat": 1, "humanAnnotation": {"humanValidated": True, "normalizedSpokenError": None, "cutoffObserved": True, "unjustifiedRepeat": None}},
            {**base, "repeat": 2, "humanAnnotation": None},
        ]
        checked = asr.validate_observations({"schemaVersion": 1, "observations": rows}, cases)
        profile = asr.build_report(cases, checked, "unit-only")["profiles"][base["profile"]]
        self.assertEqual(profile["cer"]["transcriptNormalized"]["cer"], 0)
        annotations = profile["humanAnnotations"]
        self.assertEqual(annotations["normalizedSpokenError"], {"reviewed": 1, "errors": 1, "rate": 1, "pending": 2})
        self.assertEqual(annotations["cutoffObserved"], {"reviewed": 1, "errors": 1, "rate": 1, "pending": 2})
        self.assertEqual(annotations["unjustifiedRepeat"], {"reviewed": 1, "errors": 0, "rate": 0, "pending": 2})
        self.assertEqual(annotations["intentError"]["reviewed"], 0)
        self.assertIsNone(annotations["pedagogicalError"]["rate"])

    def test_new_human_annotations_reject_non_booleans_without_inferring_from_audio(self):
        cases = [{"id": "unit"}]
        row = {"caseId": "unit", "profile": "small-ja-prompt", "transcript": "", "candidateText": "", "humanAnnotation": {"humanValidated": True}}
        for field in ("normalizedSpokenError", "cutoffObserved", "unjustifiedRepeat"):
            for invalid in (1, "yes", [], {}):
                with self.subTest(field=field, invalid=invalid), self.assertRaisesRegex(asr.ComparisonError, "annotation"):
                    asr.validate_observations({"schemaVersion": 1, "observations": [{**row, "humanAnnotation": {"humanValidated": True, field: invalid}}]}, cases)


if __name__ == "__main__":
    unittest.main()
