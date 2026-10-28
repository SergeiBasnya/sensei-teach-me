import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from linguistic_support import answer_guidance, requested_explanation, correction_explanation
from pedagogic_romaji import PedagogicRomanizer
from conversation_feedback import parse_feedback

class LinguisticSupportTests(unittest.TestCase):
    def test_answer_guidance_follows_actual_intention(self):
        self.assertIn('suki ja nai',answer_guidance('コーヒーが好きじゃないです。'))
        self.assertIn('ni sunde imasu',answer_guidance('リヨンに住んでいます。'))
        self.assertNotIn('kara',answer_guidance('リヨンに住んでいます。'))
        self.assertIsNone(answer_guidance('来年フランスから来ます。'))
    def test_word_explanations_preserve_scope(self):
        self.assertIn('origine',requested_explanation('どこから来ましたか？','Pourquoi kara ?'))
        self.assertIn('heure',requested_explanation('十時からです。','Pourquoi kara ?'))
        self.assertNotIn('origine',requested_explanation('十時からです。','Pourquoi kara ?'))
        self.assertEqual(requested_explanation('どんな町ですか？','Explique machi'),'Machi veut dire ville.')
        self.assertIsNone(requested_explanation('お名前は？','Pourquoi kara ?'))
    def test_checked_explanation_requires_matching_error(self):
        self.assertIn('kara',correction_explanation('私はフランスを来ました。','私はフランスから来ました。'))
        self.assertIn('mashita',correction_explanation('フランスから来ますでした。','フランスから来ました。'))
        self.assertNotIn('kara',correction_explanation('フランスから来ますでした。','フランスから来ました。'))
    def test_correction_guard_rejects_fact_mutation_and_orthography(self):
        romanize=PedagogicRomanizer()
        cases=[('ベルギーから来ました。','フランスから来ました。'),('三百円です。','四百円です。'),('にほんごがすきです。','日本語が好きです。'),('コーヒーが好きじゃないです。','コーヒーが好きです。'),('フランスです。','私はフランスです。'),('コーヒーをください。','お茶をください。'),('コーヒーが嫌いです。','コーヒーが好きです。')]
        for original,corrected in cases:
            with self.subTest(original=original):
                payload=json.dumps({'correction':{'corrected':corrected,'french':'Une traduction.','explanation':'Une explication.'}})
                self.assertIsNone(parse_feedback(payload,original,romanize,romanize.correction_is_safe))
        self.assertTrue(romanize.correction_is_safe('私はフランスを来ました。','私はフランスから来ました。'))
        self.assertTrue(romanize.correction_is_safe('日本語を好きです。','日本語が好きです。'))

class ConversationLedgerTests(unittest.TestCase):
    def test_only_current_explicit_choices_update_the_ledger(self):
        from conversation_context import conversation_details
        history=[{'role':'user','content':'コーヒーを二杯ください。'},{'role':'assistant','content':'三百五十円です。'},{'role':'user','content':'やっぱりコーヒーじゃなくて、お茶をください。'}]
        facts=conversation_details(history,'何杯頼みましたか？','cafe')
        self.assertEqual(facts['ordered_quantity'],'二杯')
        self.assertEqual(facts['ordered_drink'],'お茶')
        self.assertEqual(facts['stated_price'],'三百五十円')
        self.assertNotIn('mastery',facts)
    def test_both_ticket_choices_in_a_question_do_not_overwrite_answer(self):
        from conversation_context import conversation_details
        self.assertEqual(conversation_details([{'role':'user','content':'片道を一枚ください。'}],'片道ですか、往復ですか？','station')['ticket_choice'],'片道')
    def test_native_quantity_spelling_does_not_discard_real_grammar_correction(self):
        r=PedagogicRomanizer()
        self.assertTrue(r.correction_is_safe('コーヒーを2つくださいです。','コーヒーをふたつください。'))
        self.assertTrue(r.correction_is_safe('二人は来ますでした。','ふたりは来ました。'))

class SafeCoachingTests(unittest.TestCase):
    def test_no_grammar_lesson_on_a_statement_or_from_an_old_question(self):
        from linguistic_support import safe_conversation_coaching
        self.assertIsNone(safe_conversation_coaching('一つです。','Dis [nombre] dekimasu.','Un seul.',[]))
        self.assertIsNone(safe_conversation_coaching('今、お茶を注文しました。','Dis ima ni.','Tu as commandé du thé.',[]))
    def test_unknown_pattern_does_not_echo_unchecked_grammar(self):
        from linguistic_support import safe_conversation_coaching
        guidance=safe_conversation_coaching('一つでよろしいですか？','Dekiru veut dire pouvoir.','Un seul, d’accord ?',[])
        self.assertNotIn('dekiru',guidance.lower())
        self.assertIn('je ne sais pas',guidance)
    def test_known_direction_has_correct_french_and_japanese_pattern(self):
        from linguistic_support import safe_conversation_coaching
        guidance=safe_conversation_coaching('どちらへ行きますか？','[ton destination] e kimasu.','Où vas-tu ?',[])
        self.assertIn('e ikimasu',guidance)
        self.assertNotIn('ton destination',guidance)
    def test_checked_models_are_fictional_examples_that_answer_the_current_question(self):
        from linguistic_support import checked_help
        self.assertEqual(checked_help('どの町から来ましたか？'),('パリから来ました。','Je viens de Paris.'))
        self.assertEqual(checked_help('どこに住んでいますか？')[0],'パリに住んでいます。')
        self.assertIsNone(checked_help('どんな本が好きですか？'))

class ReviewerRegressions(unittest.TestCase):
    def test_negative_preferences_and_cancellations_do_not_become_orders(self):
        from conversation_context import conversation_details
        first=[{'role':'user','content':'お茶を一つください。'}]
        for text in ['コーヒーは好きじゃないです。','コーヒーは注文していません。','お茶は一つです。コーヒーではありません。']:
            with self.subTest(text=text):self.assertEqual(conversation_details(first,text,'cafe')['ordered_drink'],'お茶')
        self.assertEqual(conversation_details([{'role':'user','content':'片道を一枚ください。'}],'往復は要りません。','station')['ticket_choice'],'片道')
    def test_only_last_positive_contrast_updates_choice(self):
        from conversation_context import conversation_details
        value=conversation_details([{'role':'user','content':'コーヒーを二つください。'}],'一つじゃなくて二つください。','cafe')
        self.assertEqual(value['ordered_quantity'],'二つ')
        value=conversation_details([],'コーヒーじゃなくて、お茶をください。','cafe')
        self.assertEqual(value['ordered_drink'],'お茶')
    def test_checked_help_does_not_answer_a_different_question(self):
        from linguistic_support import checked_help,question_guidance
        for question in ['いつフランスから来ましたか？','どこから始めますか？','ホットはありません。アイスにしますか？']:
            self.assertIsNone(checked_help(question))
        self.assertNotIn('hai',question_guidance('現金ですか、カードですか？'))
    def test_kana_facts_allow_real_particle_corrections(self):
        r=PedagogicRomanizer()
        for source,target in [('にほんごをすきです。','日本語が好きです。'),('コーヒーをきらいです。','コーヒーが嫌いです。'),('こーひーを好きです。','コーヒーが好きです。')]:
            with self.subTest(source=source):self.assertTrue(r.correction_is_safe(source,target))

class ExactTranslationTests(unittest.TestCase):
    def test_price_translation_preserves_quantity_and_french_gender(self):
        from linguistic_support import checked_translation
        self.assertEqual(checked_translation('このコーヒーは三百五十円です。'),'Ce café coûte 350 yens.')
        self.assertEqual(checked_translation('この水は1円です。'),'Cette eau coûte 1 yen.')
        self.assertIsNone(checked_translation('このコーヒーは三百五十円ではありません。'))
        self.assertIsNone(checked_translation('このコーヒーは三百五十円ですか？'))
