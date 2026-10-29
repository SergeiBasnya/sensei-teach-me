import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from voice_lab_worker import pcm_samples, signal_metrics


class PcmTests(unittest.TestCase):
    def test_little_endian_and_full_scale_are_preserved(self):
        raw = np.array([-32768, 32767, 256, -256] * 800, dtype='<i2').tobytes()
        audio = pcm_samples(raw)
        self.assertEqual(audio[0], -1)
        self.assertAlmostEqual(float(audio[2]), 256/32768)
        self.assertEqual(signal_metrics(audio)['duration_ms'], 200)
        self.assertEqual(signal_metrics(audio)['clipped_fraction'], .5)

    def test_silence_stays_silence_and_invalid_lengths_are_rejected(self):
        self.assertEqual(signal_metrics(pcm_samples(bytes(6400)))['rms_db_below_full_scale'], 100)
        for raw in [bytes(3199), bytes(6401), bytes(1440002)]:
            with self.assertRaises(ValueError): pcm_samples(raw)

    def test_signal_edge_metrics_do_not_claim_word_boundaries(self):
        raw = np.concatenate([np.zeros(1600), np.ones(3200)*.1, np.zeros(3200)])
        metrics = signal_metrics(raw.astype(np.float32))
        self.assertEqual(metrics['leading_energy_ms'], 100)
        self.assertEqual(metrics['trailing_energy_ms'], 200)
        self.assertNotIn('transcript', metrics)
