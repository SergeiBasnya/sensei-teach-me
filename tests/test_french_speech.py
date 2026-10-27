"""Contrats hors réseau de la voix française et de la reprise du worker."""
import asyncio
import base64
import contextlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import french_speech
import voice_worker


class Stream:
    def __init__(self, chunks):
        self.chunks = chunks

    async def stream(self):
        for chunk in self.chunks:
            yield chunk


class FrenchSpeechTests(unittest.TestCase):
    def test_invalid_input_never_reaches_service(self):
        with patch.object(french_speech.edge_tts, "Communicate") as service:
            for text in (None, 12, " ", "x" * 501):
                with self.subTest(text_type=type(text).__name__), self.assertRaises(ValueError):
                    french_speech.synthesize_french(text)
            service.assert_not_called()

    def test_vivienne_stream_ignores_metadata_and_collects_audio(self):
        stream = Stream([{"type": "SentenceBoundary"}, {"type": "audio", "data": b"one"},
                         {"type": "audio", "data": b"two"}])
        with patch.object(french_speech.edge_tts, "Communicate", return_value=stream) as service:
            self.assertEqual(asyncio.run(french_speech.collect_audio("Bonjour")), b"onetwo")
        args, kwargs = service.call_args
        self.assertEqual(args, ("Bonjour", "fr-FR-VivienneMultilingualNeural"))
        self.assertEqual((kwargs["rate"], kwargs["pitch"]), ("+0%", "+0Hz"))

    def test_empty_and_oversized_streams_are_rejected(self):
        for chunks in ([], [{"type": "audio", "data": b"x" * (french_speech.MAX_MP3_BYTES + 1)}]):
            with patch.object(french_speech.edge_tts, "Communicate", return_value=Stream(chunks)):
                with self.assertRaises(ValueError):
                    asyncio.run(french_speech.collect_audio("Bonjour"))

    def test_total_timeout_cancels_network_wait(self):
        cancelled = []
        async def slow(_text):
            try:
                await asyncio.sleep(10)
            finally:
                cancelled.append(True)
        with patch.object(french_speech, "collect_audio", slow), \
                patch.object(french_speech, "FRENCH_TIMEOUT_SECONDS", 0.01):
            with self.assertRaises(TimeoutError):
                french_speech.synthesize_french("Bonjour")
        self.assertEqual(cancelled, [True])

    def test_french_failure_keeps_japanese_worker_usable(self):
        requests = '\n'.join(json.dumps(r) for r in [
            {"id": 1, "language": "fr", "text": "Bonjour"},
            {"id": 2, "language": "ja", "text": "こんにちは", "style": 10},
        ])
        output = io.StringIO()
        wav = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 40
        with patch.object(voice_worker, "create_synthesizer", return_value=object()), \
                patch.object(voice_worker, "synthesize", return_value=(wav, None)), \
                patch.object(french_speech, "synthesize_french", side_effect=OSError("private diagnostic")), \
                patch.object(sys, "stdin", io.StringIO(requests)), contextlib.redirect_stdout(output):
            voice_worker.main()
        results = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(results[0]["code"], "french_speech_unavailable")
        self.assertNotIn("private diagnostic", output.getvalue())
        self.assertEqual(base64.b64decode(results[1]["audio"]), wav)


if __name__ == "__main__":
    unittest.main()
