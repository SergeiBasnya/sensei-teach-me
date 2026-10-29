"""Synthetic files and typed-input doubles only; no actual human validation."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import stat
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import wave

SOURCE = Path(__file__).resolve().parents[1] / "scripts/review-human-voice.py"
SPEC = importlib.util.spec_from_file_location("human_voice_review", SOURCE)
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)


def fixture(folder):
    path = Path(folder) / "manifest.json"
    audio = Path(folder) / "fixture.wav"
    with wave.open(str(audio), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(struct.pack("<h", 1000) * 8000)
    payload = {"schemaVersion": 1, "captureType": "human", "consentToLocalEvaluation": True, "humanValidated": False,
               "cases": [{"id": "unit-only", "audio": "fixture.wav", "reference": "", "kind": "speech", "language": "mixed", "tags": [], "humanValidated": False, "speechBounds": None}]}
    # These flags exercise a format contract and do not certify the synthetic file.
    path.write_text(json.dumps(payload), encoding="utf8")
    return path, payload


def answers(values):
    values = iter(values)
    return lambda _: next(values)


def reference_answers(confirm="JE CONFIRME", final=False):
    values = ["", "フランスを…いや、フランスから来ました。", "speech", "ja", "android,self-correction", "10,480", "?", confirm]
    if confirm == "JE CONFIRME":
        values += ["oui" if final else "", "VALIDER LE CORPUS"] if final else [""]
    return values


class ReferenceReviewTests(unittest.TestCase):
    def test_no_corpus_default_has_no_model_audio_content_or_side_effect(self):
        with tempfile.TemporaryDirectory() as folder, patch("sys.stdout", new_callable=io.StringIO) as out:
            missing = Path(folder) / "missing.json"
            self.assertEqual(review.main(["--manifest", str(missing)]), 0)
            value = json.loads(out.getvalue())
            self.assertEqual(value["cases"], 0)
            self.assertEqual(value["status"], "pending-human")
            self.assertFalse(value["modelLaunched"])
            self.assertFalse(value["audioPlayed"])
            self.assertFalse(missing.exists())
            self.assertNotIn(str(folder), out.getvalue())

    def test_unconfirmed_input_does_not_write_or_validate(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            before = copy.deepcopy(payload)
            writes = []
            result = review.review_references(payload, path, answers(reference_answers(confirm="")), lambda _: None, lambda value: writes.append(copy.deepcopy(value)))
            self.assertEqual(writes, [])
            self.assertEqual(payload, before)
            self.assertFalse(result["cases"][0]["humanValidated"])
            self.assertFalse(result["humanValidated"])

    def test_confirmed_verbatim_preserves_error_and_still_requires_root_attestation(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            writes, display = [], []
            result = review.review_references(payload, path, answers(reference_answers()), display.append, lambda value: writes.append(copy.deepcopy(value)))
            case = result["cases"][0]
            self.assertEqual(case["reference"], "フランスを…いや、フランスから来ました。")
            self.assertTrue(case["humanValidated"])
            self.assertFalse(result["humanValidated"])
            self.assertEqual(case["speechBounds"], {"startMs": 10, "endMs": 480})
            self.assertIsNone(case["referenceReview"]["cutoffObserved"])
            self.assertEqual(len(writes), 1)
            self.assertFalse(payload["humanValidated"])
            self.assertFalse(any("Hypothèse ASR" in line for line in display))

    def test_full_confirmation_allows_existing_comparator_without_running_it(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            destination = Path(folder) / "reviewed.json"
            checkpoint = review.Checkpoint(path, destination)
            result = review.review_references(payload, path, answers(reference_answers(final=True)), lambda _: None, checkpoint)
            self.assertTrue(result["humanValidated"])
            self.assertEqual(len(review.ASR.load_manifest(destination)), 1)
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o600)
            self.assertFalse(json.loads(path.read_text())["humanValidated"])

    def test_moved_private_manifest_keeps_audio_identity_and_incomplete_attestation_is_pending(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            payload["humanValidated"] = True
            self.assertEqual(review.inventory(payload)["status"], "pending-human")
            destination = Path(folder) / "separate-private-folder/reviewed.json"
            checkpoint = review.Checkpoint(path, destination)
            review.review_references(payload, path, answers(reference_answers(final=True)), lambda _: None, checkpoint)
            cases = review.ASR.load_manifest(destination)
            self.assertEqual(cases[0]["audioPath"], (Path(folder) / "fixture.wav").resolve())

    def test_silence_and_bounds_are_not_inferred(self):
        original = {"id": "unit-only"}
        case = review.reviewed_case(original, "", "silence", "none", "silence", "", 500, "non")
        self.assertIsNone(case["speechBounds"])
        self.assertFalse(case["referenceReview"]["cutoffObserved"])
        for values in [("", "speech", "ja", "", ""), ("はい", "silence", "none", "", ""), ("はい", "speech", "none", "", ""), ("はい", "speech", "ja", "", "0,999"), ("はい", "speech", "ja", "nom-personnel-écrit", "")]:
            with self.subTest(values=values), self.assertRaises(review.ReviewError):
                review.reviewed_case(original, *values, 500, "?")

    def test_exclusion_is_explicit_and_does_not_remove_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            writes = []
            result = review.review_references(payload, path, answers(["x", "EXCLURE"]), lambda _: None, lambda value: writes.append(copy.deepcopy(value)))
            self.assertEqual(result["cases"], [])
            self.assertFalse(result["humanValidated"])
            self.assertEqual(len(result["excludedCases"]), 1)
            self.assertTrue((Path(folder) / "fixture.wav").exists())
            self.assertEqual(len(writes), 1)

    def test_malformed_exclusion_draft_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            payload["excludedCases"] = "not-a-list"
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(review.ReviewError, "excluded"):
                review.draft_manifest(path)

    def test_piped_or_automated_confirmation_is_refused(self):
        with tempfile.TemporaryDirectory() as folder, patch("sys.stdin.isatty", return_value=False), patch("sys.stdout", new_callable=io.StringIO) as out:
            path, _ = fixture(folder)
            destination = Path(folder) / "reviewed.json"
            self.assertEqual(review.main(["--manifest", str(path), "--review", "--output", str(destination)]), 2)
            self.assertIn("interactive-terminal-required", out.getvalue())
            self.assertFalse(destination.exists())

    def test_checkpoints_reject_original_existing_publishable_and_external_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            path, payload = fixture(folder)
            with self.assertRaises(review.ReviewError):
                review.Checkpoint(path, path)
            output = Path(folder) / "reviewed.json"
            checkpoint = review.Checkpoint(path, output)
            checkpoint(payload)
            with self.assertRaises(review.ReviewError):
                review.Checkpoint(path, output)
            output.write_text("human edited this file")
            with self.assertRaises(review.ReviewError):
                checkpoint(payload)
            repo = Path(folder) / "repo"
            subprocess.run(["git", "init", "--quiet", str(repo)], check=True, capture_output=True)
            with self.assertRaises(review.ASR.ComparisonError):
                review.Checkpoint(path, repo / "public.json")


class ObservationReviewTests(unittest.TestCase):
    def cases(self):
        return [{"id": "unit-only", "reference": "フランスを来ました。", "language": "ja", "audioDiagnostics": {}}]

    def row(self):
        return {"caseId": "unit-only", "profile": "small-auto-prompt", "repeat": 0, "transcript": "フランスから来ました。", "candidateText": "フランスから来ました。", "asrMs": 10, "humanAnnotation": None}

    def test_hypotheses_are_revealed_only_in_the_explicit_observation_stage(self):
        payload = {"schemaVersion": 1, "observations": [self.row()]}
        display, writes = [], []
        result = review.review_observations(payload, self.cases(), answers(["", "non", "?", "oui", "?", "non", "JE CONFIRME"]), display.append, lambda value: writes.append(copy.deepcopy(value)))
        annotation = result["observations"][0]["humanAnnotation"]
        self.assertTrue(annotation["humanValidated"])
        self.assertFalse(annotation["intentError"])
        self.assertIsNone(annotation["pedagogicalError"])
        self.assertTrue(annotation["normalizedSpokenError"])
        self.assertIsNone(annotation["cutoffObserved"])
        self.assertFalse(annotation["unjustifiedRepeat"])
        self.assertTrue(any("Hypothèse ASR" in line for line in display))
        self.assertIsNone(payload["observations"][0]["humanAnnotation"])
        self.assertEqual(len(writes), 1)

    def test_skipped_or_unconfirmed_observation_has_no_annotation(self):
        payload = {"schemaVersion": 1, "observations": [self.row()]}
        display, writes = [], []
        result = review.review_observations(payload, self.cases(), answers(["p"]), display.append, writes.append)
        self.assertIsNone(result["observations"][0]["humanAnnotation"])
        self.assertFalse(any("Hypothèse ASR" in line for line in display))
        self.assertEqual(writes, [])
        result = review.review_observations(payload, self.cases(), answers(["", "?", "?", "?", "?", "?", ""]), display.append, writes.append)
        self.assertIsNone(result["observations"][0]["humanAnnotation"])


if __name__ == "__main__":
    unittest.main()
