"""Concrete language regressions, distinct from a human linguistic review."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import linguistic_support as support
from conversation_feedback import parse_feedback


class SharedLanguageStabilizationTests(unittest.TestCase):
    def test_negative_preference_preserves_speaker_and_object(self):
        for japanese in ('コーヒーが好きではありません。', 'コーヒーは好きじゃないです。',
                         '私はコーヒーが好きじゃないです。'):
            self.assertEqual(support.checked_translation(japanese), 'Je n’aime pas le café.')
        self.assertEqual(support.checked_requested_help('Je n’aime pas le café.'),
                         ('コーヒーは好きじゃないです。', 'Je n’aime pas le café.'))
        self.assertIsNone(support.checked_requested_help('Je ne veux pas de café.'))
        self.assertIsNone(support.checked_translation('田中さんはコーヒーが好きです。'))

    def test_description_question_keeps_description_intent(self):
        self.assertEqual(support.checked_translation('ベルギーはどんなところですか？'),
                         'À quoi ressemble la Belgique ?')
        self.assertIsNone(support.checked_translation('ベルギーはどんなところでしたか？'))

    def test_exact_questions_use_tu_and_keep_choices(self):
        self.assertEqual(support.checked_translation('ホットですか、アイスですか？'),
                         'Chaud ou glacé ?')
        self.assertEqual(support.checked_translation('何枚ですか？'),
                         'Combien ?')
        self.assertEqual(support.checked_translation('どのホームですか？'), 'Quel quai ?')

    def test_natural_short_answers_are_not_errors(self):
        history = [{'role': 'assistant', 'content': 'ホットですか、アイスですか？'}]
        for value in ('ホットで', 'アイスで。', 'ホットでお願いします。'):
            self.assertTrue(support.accepted_contextual_response(value, history))
        self.assertFalse(support.accepted_contextual_response('ホットを', history))
        self.assertFalse(support.accepted_contextual_response('ホットで', [
            {'role': 'assistant', 'content': 'どこから来ましたか？'}]))
        self.assertTrue(support.accepted_contextual_response('どのホームですか？', []))

    def test_self_correction_is_accepted_only_when_last_clause_is_checked(self):
        self.assertTrue(support.accepted_contextual_response(
            'フランスを…いや、フランスから来ました。', []))
        self.assertTrue(support.accepted_contextual_response(
            'えっと…コーヒー…じゃなくて、お茶が好きです。', []))
        self.assertFalse(support.accepted_contextual_response(
            'フランスを…いや、フランスを来ました。', []))
        self.assertTrue(support.accepted_contextual_response(
            'ホット…じゃなくて、アイスでお願いします。', [
                {'role': 'assistant', 'content': 'ホットですか、アイスですか？'}]))

    def test_politeness_rewrite_and_fragment_expansion_are_not_corrections(self):
        for original, target, history in (
                ('どのホームですか？', 'どちらのホームですか？', []),
                ('ホットで', 'ホットでお願いします。', [
                    {'role': 'assistant', 'content': 'ホットですか、アイスですか？'}])):
            raw = json.dumps({'correction': {'corrected': target, 'french': 'Une proposition.',
                                            'explanation': 'Utilise doreba (dorekara).'}})
            self.assertIsNone(parse_feedback(raw, original, lambda _: 'reading', history=history))

    def test_real_particle_error_keeps_checked_meaning_and_explanation(self):
        raw = json.dumps({'correction': {'corrected': '日本語が好きです。',
                                        'french': 'Tu aimes le français.',
                                        'explanation': 'Utilise doreba (dorekara).'}})
        result = parse_feedback(raw, '日本語を好きです。', lambda _: 'Nihongo ga suki desu.')
        self.assertEqual(result['french'], 'J’aime le japonais.')
        self.assertEqual(result['explanation'], 'Avec suki, utilise ga pour ce que tu aimes.')

    def test_unchecked_grammar_explanation_is_not_taught_as_a_rule(self):
        raw = json.dumps({'correction': {'corrected': '昨日、駅に行きました。',
                                        'french': 'Hier, je suis allé à la gare.',
                                        'explanation': 'Doreba signifie le passé.'}})
        self.assertIsNone(parse_feedback(raw, '昨日、駅を行きました。', lambda _: 'reading'))

    def test_original_grammar_regressions_still_have_checked_corrections(self):
        for original, corrected, french, term in (
                ('私はフランスを来ました。', '私はフランスから来ました。', 'Je viens de France.', 'kara'),
                ('フランスから来ますでした。', 'フランスから来ました。', 'Je viens de France.', 'mashita'),
                ('昨日、映画を見ますでした。', '昨日、映画を見ました。', 'Hier, j’ai regardé un film.', 'mashita')):
            with self.subTest(original=original):
                raw = json.dumps({'correction': {'corrected': corrected, 'french': 'Un français faux.',
                                                'explanation': 'Doreba veut dire le passé.'}})
                result = parse_feedback(raw, original, lambda _: 'reading')
                self.assertEqual(result['french'], french)
                self.assertIn(term, result['explanation'])

    def test_price_negation_is_not_normalized_into_a_positive_rule(self):
        self.assertIsNone(support.checked_translation('このお茶は三百円ではありません。'))
        self.assertIsNone(support.checked_translation('コーヒーはあまり好きじゃないです。'))
        self.assertFalse(support.accepted_contextual_response(
            '私は日本語を好きです。', []))


if __name__ == '__main__':
    unittest.main()
