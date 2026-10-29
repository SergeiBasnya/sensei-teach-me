from types import SimpleNamespace
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from llm_stream_trace import collect_stream


class StreamTraceTests(unittest.TestCase):
    def test_chunks_are_collected_exactly_without_speaking_or_repair(self):
        raw = ['{"jap', 'anese":"こんにちは。",', '"french":"Bonjour.","coaching":null}']
        times = iter([0, .01, .02, .04])
        metrics = {}
        result = collect_stream([SimpleNamespace(text=x) for x in raw], metrics, lambda: next(times))
        self.assertEqual(result, ''.join(raw))
        self.assertEqual(metrics['first_token'], 10)
        self.assertEqual(metrics['japanese_field_complete'], 20)
        self.assertEqual(metrics['json_gate_wait'], 20)

    def test_invalid_json_is_not_repaired_and_has_no_authorization(self):
        metrics = {}
        self.assertEqual(collect_stream([SimpleNamespace(text='{oops')], metrics), '{oops')
        self.assertNotIn('japanese_field_complete', metrics)
        self.assertNotIn('validated', metrics)
