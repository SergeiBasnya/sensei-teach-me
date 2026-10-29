import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from beginner_dialogue import controlled_dialogue, constrain_preference_question
from lab_conversation import lab_dialogue_state, validate_lab_conversation


def a(content):
    return {'role': 'assistant', 'content': content}


def u(content):
    return {'role': 'user', 'content': content}


def request(text, scenario='station', history=None):
    return {'text': text, 'scenario': scenario, 'history': history or []}


class BeginnerDialogueTests(unittest.TestCase):
    def reply(self, data):
        result = controlled_dialogue(data)
        self.assertIsNotNone(result)
        validate_lab_conversation(result['japanese'], data)
        return result

    def test_ticket_quantity_is_wanted_not_possessed(self):
        data = request('片道です。', history=[u('京都までお願いします。'), a('片道ですか、往復ですか？')])
        result = self.reply(data)
        self.assertEqual(result['japanese'], '片道ですね。切符は何枚ですか？')
        self.assertIn('veux-tu', result['french'])
        self.assertNotIn('持', result['japanese'])

    def test_complete_request_then_destination_and_count_change(self):
        history = [a('練習の駅です。大阪行きは五番線です。どこまでですか？')]
        cases = [
            ('京都まで、片道で二枚お願いします。', '京都まで、片道で二枚ですね。', '2 billets aller simple pour Kyoto'),
            ('あ、京都じゃなくて、大阪までお願いします。', '大阪まで、片道で二枚ですね。', '2 billets aller simple pour Osaka'),
            ('二枚じゃなくて、一枚です。', '大阪まで、片道で一枚ですね。', 'Un billet aller simple pour Osaka'),
            ('何番線ですか？', '5番線です。', 'voie 5'),
        ]
        for text, japanese, french in cases:
            data = request(text, history=history)
            result = self.reply(data)
            self.assertEqual(result['japanese'], japanese)
            self.assertIn(french, result['french'])
            history.extend([u(text), a(japanese)])

    def test_platform_of_another_destination_is_not_reused(self):
        data = request('何番線ですか？', history=[a('大阪行きは五番線です。'), u('京都までお願いします。')])
        result = self.reply(data)
        self.assertNotIn('5', result['japanese'])
        self.assertEqual(result['intent'], 'unknown_platform')

    def test_questions_and_examples_are_not_service_facts(self):
        for line in ('大阪行きは五番線ですか？', '例えば、大阪行きは五番線です。'):
            data = request('何番線ですか？', history=[a(line), u('大阪までお願いします。')])
            self.assertEqual(self.reply(data)['intent'], 'unknown_platform')

    def test_tea_replacement_temperature_quantity_and_unit_price(self):
        history = [a('練習の店です。紅茶は一つ四百円です。何にしますか？')]
        cases = [
            ('紅茶を二つください。', '紅茶二つですね。ホットですか、アイスですか？', '2 thés noirs'),
            ('アイスで。', 'アイスの紅茶二つですね。', '2 thés noirs glacés'),
            ('二つじゃなくて、一つでお願いします。', 'アイスの紅茶一つですね。', 'Un thé noir glacé'),
            ('紅茶はいくらですか？', '一つ400円です。', '400 yens l’unité'),
        ]
        for text, japanese, french in cases:
            data = request(text, 'cafe', history)
            result = self.reply(data)
            self.assertEqual(result['japanese'], japanese)
            self.assertIn(french, result['french'])
            history.extend([u(text), a(japanese)])

    def test_repair_does_not_order_two_waters_or_negated_beer(self):
        data = request('水を二つ、いえ、一つください。', 'cafe')
        result = self.reply(data)
        self.assertEqual(result['japanese'], '水一つですね。')
        self.assertNotIn('ホット', result['japanese'])
        history = [u(data['text']), a(result['japanese'])]
        result = self.reply(request('ビールは飲みません。水で。', 'cafe', history))
        self.assertEqual(result['japanese'], '水一つですね。')
        self.assertNotIn('ビール', result['japanese'])

    def test_changed_drink_resets_temperature_but_changed_count_does_not(self):
        history = [u('コーヒーを一つください。'), a('ホットですか、アイスですか？'), u('ホットで。')]
        result = self.reply(request('お茶を二つください。', 'cafe', history))
        self.assertEqual(result['japanese'], 'お茶二つですね。ホットですか、アイスですか？')

    def test_unknown_price_does_not_borrow_price_of_another_drink(self):
        data = request('このお茶はいくらですか？', 'cafe', [a('コーヒーは三百円です。')])
        self.assertEqual(self.reply(data)['intent'], 'unknown_price')

    def test_identity_is_short_without_human_biography(self):
        data = request('モチさんもベルギーから来ましたか？', 'meet')
        result = self.reply(data)
        self.assertEqual(result['japanese'], '私はAIです。日本語を話しましょう。')
        self.assertEqual(result['french'], 'Je suis une IA. Parlons japonais.')

    def test_opening_facts_use_short_questions_but_likes_remain_generative(self):
        h = [a('お名前は？')]
        for text, question in [('えっと…アレックスです。', 'はじめまして。どこから来ましたか？'),
                               ('ベルギーです。', 'どこに住んでいますか？'),
                               ('ブリュッセルに住んでいます。', '日本語は好きですか？')]:
            result = self.reply(request(text, 'meet', h))
            self.assertEqual(result['japanese'], question)
            h.extend([u(text), a(question)])
        self.assertIsNone(controlled_dialogue(request('はい、日本語が好きです。', 'meet', h)))

    def test_open_conversation_help_and_multiple_orders_remain_outside_planner(self):
        cases = [request('どんな映画が好きですか？', 'free'),
                 request('Je ne sais pas. Aide-moi.', 'cafe'),
                 request('コーヒーとお茶を一つずつください。', 'cafe'),
                 request('日本語が好きです。', 'meet'),
                 request('例えば、コーヒーを一つください。', 'cafe')]
        for data in cases:
            self.assertIsNone(controlled_dialogue(data))

    def test_multiple_and_additive_orders_do_not_collapse_on_the_next_short_answer(self):
        for text in ('コーヒーとお茶を一つずつください。', 'お茶も一つください。',
                     'もう一つください。', 'コーヒーをもう一つください。', '一つ追加してください。'):
            h = [u('コーヒーを一つください。'), a('ホットのコーヒー一つですね。'),
                 u(text), a('ホットですか、アイスですか？')]
            data = request('ホットで。', 'cafe', h)
            self.assertTrue(lab_dialogue_state(data)['unsupported_order'])
            self.assertIsNone(controlled_dialogue(data))

    def test_open_preference_followup_is_simplified_with_the_same_subject_before_speech(self):
        data = request('えっと…コーヒー…じゃなくて、お茶が好きです。', 'free')
        value = constrain_preference_question('お茶が好きなんですね。どんなお茶が好きですか？', data)
        self.assertEqual(value['japanese'], 'お茶を毎日飲みますか？')
        self.assertEqual(value['french'], 'Bois-tu du thé tous les jours ?')
        self.assertIn('nomimasu', value['coaching'])
        self.assertIsNone(constrain_preference_question('ホットですか、アイスですか？', data))
        self.assertIsNone(constrain_preference_question('どんなお茶が好きですか？', request('お茶が好きですか？', 'free')))

    def test_bill_or_menu_request_does_not_confirm_the_previous_drink_again(self):
        history = [u('水を一つください。'), a('水一つですね。')]
        result = self.reply(request('お会計をお願いします。', 'cafe', history))
        self.assertEqual(result['intent'], 'bill_request')
        self.assertNotIn('水', result['japanese'])
        for text in ('メニューをください。', 'ちょっと待ってください。'):
            self.assertIsNone(controlled_dialogue(request(text, 'cafe', history)))


if __name__ == '__main__':
    unittest.main()
