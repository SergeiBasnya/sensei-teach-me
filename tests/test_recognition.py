"""Offline metadata tests; no model or human recognition accuracy claim."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from conversation_worker import recognized_utterance

class RecognitionTests(unittest.TestCase):
    def test_clear_fragment_is_not_marked_wrong(self):
        result = recognized_utterance([dict(text='フランスです。',avg_logprob=-0.2,no_speech_prob=0.01,compression_ratio=1)])
        self.assertEqual(result, {'text':'フランスです。','uncertain':False})
    def test_borderline_segment_is_not_safe_to_grade(self):
        for signal in [dict(avg_logprob=-0.8), dict(no_speech_prob=0.5), dict(compression_ratio=3)]:
            self.assertTrue(recognized_utterance([dict(text='フランスを来ました。',**signal)])['uncertain'])
    def test_discarded_segment_is_not_silently_graded_as_complete(self):
        result=recognized_utterance([dict(text='私は',avg_logprob=-2),dict(text='フランスです。',avg_logprob=-0.1)])
        self.assertEqual(result['text'],'フランスです。')
        self.assertTrue(result['uncertain'])
    def test_empty_segments_do_not_invent_speech(self):
        self.assertEqual(recognized_utterance([])['text'],'')

class QuestionTests(unittest.TestCase):
    def test_french_coaching_never_enters_japanese_audio(self):
        from conversation_worker import japanese_question
        self.assertEqual(japanese_question('Pour dire ton origine. フランスから来ました。'), 'フランスから来ました。')
        self.assertEqual(japanese_question('Pour dire ton origine.\nどこから来ましたか？'), 'どこから来ましたか？')
