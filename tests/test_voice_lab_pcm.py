import base64
from contextlib import redirect_stdout, redirect_stderr
import io
import sys
from pathlib import Path
import unittest
from unittest.mock import Mock
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from voice_lab_worker import pcm_samples, signal_metrics, transcribe_request
from conversation_worker import recognized_utterance


class PcmTests(unittest.TestCase):
    def test_server_minimum_of_80ms_is_preserved_without_audio_padding(self):
        audio = pcm_samples(np.full(1280, 164, dtype='<i2').tobytes())
        self.assertEqual(len(audio), 1280)
        self.assertEqual(signal_metrics(audio)['duration_ms'], 80)

    def test_gate_signal_does_not_disappear_when_surrounded_by_silence(self):
        audio = np.zeros(88000, dtype=np.float32)
        audio[3200:6400] = .005
        metrics = signal_metrics(audio)
        self.assertGreater(metrics['rms_db_below_full_scale'], 60)
        gate_rms = metrics.get('window_rms_db_below_full_scale', metrics['rms_db_below_full_scale'])
        self.assertLessEqual(gate_rms, 60)

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


class RecognitionBoundaryTests(unittest.TestCase):
    @staticmethod
    def request(pcm, **options):
        return {'id': 1, 'language': 'auto', 'pcm': base64.b64encode(pcm).decode(), **options}

    @staticmethod
    def decoded():
        return {'text': '私はフランスを来ました。雑音', 'language': 'ja', 'segments': [
            {'text': '私はフランスを来ました。', 'avg_logprob': -.2, 'no_speech_prob': .1},
            {'text': '雑音', 'avg_logprob': -2, 'no_speech_prob': .9},
        ]}

    def transcribe(self, request, decoded=None):
        transcriber = Mock(return_value=decoded if decoded is not None else self.decoded())
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            response = transcribe_request(request, model='synthetic-model-label',
                                          transcribe=transcriber, recognize=recognized_utterance)
        self.assertEqual(stdout.getvalue(), '')
        self.assertEqual(stderr.getvalue(), '')
        return response, transcriber

    def test_weak_signal_reaches_transcriber_in_full_with_original_samples(self):
        pcm = np.zeros(88000, dtype='<i2')
        pcm[3200:6400] = 164
        response, transcriber = self.transcribe(self.request(pcm.tobytes()))
        self.assertEqual(response['text'], '私はフランスを来ました。')
        audio = transcriber.call_args.args[0]
        np.testing.assert_array_equal(audio, pcm.astype(np.float32) / 32768)
        self.assertEqual(len(audio), 88000)
        self.assertEqual(transcriber.call_args.kwargs, {
            'path_or_hf_repo': 'synthetic-model-label', 'language': None, 'temperature': 0,
            'condition_on_previous_text': False, 'initial_prompt': None, 'verbose': None,
        })
        self.assertNotIn('diagnostic', response)

    def test_80ms_is_forwarded_without_boost_crop_or_local_padding(self):
        pcm = np.full(1280, 164, dtype='<i2')
        response, transcriber = self.transcribe(self.request(pcm.tobytes(), language='ja'))
        np.testing.assert_array_equal(transcriber.call_args.args[0], pcm.astype(np.float32) / 32768)
        self.assertEqual(response['metrics']['duration_ms'], 80)
        self.assertEqual(transcriber.call_args.kwargs['language'], 'ja')

    def test_final_opt_in_separates_raw_filtered_and_uncertainty_without_repair(self):
        response, _ = self.transcribe(self.request(np.full(3200, 1000, dtype='<i2').tobytes(), diagnostic=True))
        self.assertEqual(response['diagnostic'], {
            'rawText': '私はフランスを来ました。雑音', 'detectedLanguage': 'ja',
            'acceptedSegments': 1, 'rejectedSegments': 1, 'signalGate': 'decoded',
        })
        self.assertEqual(response['text'], '私はフランスを来ました。')
        self.assertTrue(response['uncertain'])

    def test_partial_never_exposes_diagnostic_even_if_requested(self):
        response, _ = self.transcribe(self.request(np.full(3200, 1000, dtype='<i2').tobytes(), partial=True, diagnostic=True))
        self.assertNotIn('diagnostic', response)

    def test_diagnostic_text_is_bounded_and_language_is_sanitized(self):
        output = {'text': 'a' * 1500, 'language': 'de', 'segments': []}
        response, _ = self.transcribe(self.request(np.full(3200, 1000, dtype='<i2').tobytes(), diagnostic=True), output)
        self.assertEqual(len(response['diagnostic']['rawText']), 1000)
        self.assertEqual(response['diagnostic']['detectedLanguage'], 'other')

    def test_quiet_and_too_short_are_distinct_and_do_not_invoke_whisper(self):
        for pcm, expected in [(bytes(6400), 'quiet'), (bytes(640), 'too_short')]:
            with self.subTest(gate=expected):
                response, transcriber = self.transcribe(self.request(pcm, diagnostic=True))
                self.assertEqual(response['diagnostic'], {
                    'rawText': '', 'detectedLanguage': 'unknown', 'acceptedSegments': 0,
                    'rejectedSegments': 0, 'signalGate': expected,
                })
                transcriber.assert_not_called()
                default, _ = self.transcribe(self.request(pcm))
                self.assertNotIn('diagnostic', default)

    def test_uncertainty_thresholds_stay_unchanged_for_accepted_segment(self):
        output = {'text': 'はい。', 'language': 'ja', 'segments': [
            {'text': 'はい。', 'avg_logprob': -.6, 'no_speech_prob': .1}
        ]}
        response, _ = self.transcribe(self.request(np.full(3200, 1000, dtype='<i2').tobytes(), diagnostic=True), output)
        self.assertEqual(response['text'], 'はい。')
        self.assertTrue(response['uncertain'])
        self.assertEqual(response['diagnostic']['rejectedSegments'], 0)
