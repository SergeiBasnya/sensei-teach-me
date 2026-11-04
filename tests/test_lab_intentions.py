"""CPU-only contracts and deliberately invalid candidates, never model scores."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from beginner_dialogue import safe_controlled_fallback
from lab_conversation import lab_dialogue_state, lab_turn_observation, validate_lab_conversation, validate_lab_translation
from lab_generation import dialogue_mode, dialogue_instructions, LAB_JAPANESE_FIRST_INSTRUCTIONS, LAB_COMPACT_INSTRUCTIONS


def request(text, scenario='cafe', history=None, **extra):
    return {'text': text, 'scenario': scenario, 'history': history or [], 'labStreaming': True, **extra}


def a(text):
    return {'role': 'assistant', 'content': text}


def u(text):
    return {'role': 'user', 'content': text}


class IntentGuidedLabTests(unittest.TestCase):
    def test_policy_is_opt_in_strict_in_lab_and_ignored_in_classic(self):
        for value in ('generative', 'hybrid', 'unknown', None):
            self.assertEqual(dialogue_mode(request('はい。', labStreaming=False, labDialogue=value)), 'hybrid')
        self.assertEqual(dialogue_mode(request('はい。', labStreaming=True)), 'hybrid')
        self.assertEqual(dialogue_mode(request('はい。', labStreaming=True, labDialogue='generative')), 'generative')
        for value in (None, 'unknown', 1, {}):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'invalid_lab_dialogue'):
                dialogue_mode(request('はい。', labStreaming=True, labDialogue=value))

    def test_default_prompts_do_not_change_and_generative_has_no_new_reply_fixture(self):
        self.assertEqual(dialogue_instructions('ja-first'), LAB_JAPANESE_FIRST_INSTRUCTIONS)
        self.assertEqual(dialogue_instructions('compact'), LAB_COMPACT_INSTRUCTIONS)
        text = dialogue_instructions('ja-first', 'generative')
        self.assertIn('explicit change of topic', text)
        self.assertIn('snapshot constrains facts', text)
        self.assertEqual(text.count('Example,'), LAB_JAPANESE_FIRST_INSTRUCTIONS.count('Example,'))
        with self.assertRaisesRegex(ValueError, 'invalid_lab_dialogue'):
            dialogue_instructions('ja-first', 'unknown')

    def test_classic_snapshot_keeps_its_previous_shape_and_interpretation(self):
        data = request('お茶を一つください。トイレはどこですか？',
                       history=[u('コーヒーを二つください。')], labStreaming=False, labDialogue='generative')
        self.assertEqual(lab_dialogue_state(data), {
            'learner_asserted': {'drink': 'コーヒー', 'quantity': '二つ'},
            'unsupported_order': False, 'quoted_service_values': {}, 'intent': 'answer_question',
        })

    def test_mixed_statement_question_updates_the_order_without_asserting_question(self):
        data = request('お茶を一つください。トイレはどこですか？', history=[u('コーヒーを二つください。')])
        self.assertEqual(lab_dialogue_state(data)['learner_asserted'], {'drink': 'お茶', 'quantity': '一つ'})
        data = request('ベルギーから来ました。今日は映画の話をしたいです。', 'meet')
        self.assertEqual(lab_dialogue_state(data)['learner_asserted']['from_place'], 'ベルギー')
        self.assertEqual(lab_dialogue_state(data)['intent'], 'topic_shift')
        self.assertIsNone(safe_controlled_fallback(data))

    def test_two_things_in_a_sentence_are_not_arbitrarily_flattened(self):
        data = request('コーヒーとお茶を一つずつください。')
        self.assertTrue(lab_dialogue_state(data)['unsupported_order'])
        self.assertIsNone(safe_controlled_fallback(data))

    def test_counterexamples_drink_count_and_noun_are_rejected(self):
        data = request('お茶を二つください。')
        for reply, error in [('お茶三つですね。', 'drink_quantity'),
                             ('コーヒー二つですね。', 'confirmed_drink'),
                             ('三つです。', 'drink_quantity')]:
            with self.subTest(reply=reply), self.assertRaisesRegex(ValueError, error):
                validate_lab_conversation(reply, data)
        validate_lab_conversation('お茶二つですね。', data)
        validate_lab_conversation('二つですか、三つですか？', request('お茶をください。'))

    def test_ticket_choice_count_destination_are_bound_to_latest_request(self):
        data = request('京都まで、片道で二枚お願いします。', 'station')
        for reply, error in [('京都まで、往復で二枚ですね。', 'ticket_choice'),
                             ('京都まで、片道で三枚ですね。', 'ticket_quantity'),
                             ('大阪まで、片道で二枚ですね。', 'destination')]:
            with self.subTest(reply=reply), self.assertRaisesRegex(ValueError, error):
                validate_lab_conversation(reply, data)
        validate_lab_conversation('京都まで、片道で二枚ですね。', data)
        validate_lab_conversation('二枚ですか、三枚ですか？', request('京都までお願いします。', 'station'))

    def test_rejected_drink_stays_rejected_until_a_new_explicit_order(self):
        data = request('コーヒーはいりません。')
        with self.assertRaisesRegex(ValueError, 'rejected_drink'):
            validate_lab_conversation('コーヒー一つですね。', data)
        data = request('コーヒーを一つください。', history=[u('コーヒーはいりません。')])
        self.assertNotIn('コーヒー', lab_dialogue_state(data)['rejected_drinks'])
        validate_lab_conversation('コーヒー一つですね。', data)

    def test_same_number_elsewhere_does_not_authorise_wrong_item_price_or_route_platform(self):
        history = [a('お茶は三百五十円です。コーヒーは五百円です。')]
        data = request('お茶はいくらですか？', history=history)
        for reply in ('お茶は五百円です。', '500円です。'):
            with self.subTest(reply=reply), self.assertRaisesRegex(ValueError, 'bound_service_value'):
                validate_lab_conversation(reply, data)
        validate_lab_conversation('350円です。', data)
        with self.assertRaisesRegex(ValueError, 'bound_service_value'):
            validate_lab_conversation('お茶は500円、コーヒーは350円です。', data)
        with self.assertRaisesRegex(ValueError, 'unbound_service_value'):
            validate_lab_conversation('ジュースは350円です。', data)
        data = request('何番線ですか？', 'station', [a('京都行きは三番線です。大阪行きは五番線です。'), u('京都までお願いします。')])
        with self.assertRaisesRegex(ValueError, 'bound_service_value'):
            validate_lab_conversation('5番線です。', data)
        validate_lab_conversation('3番線です。', data)

    def test_bound_service_examples_questions_and_negations_are_not_known_facts(self):
        for value in ('例えば、お茶は三百円です。', 'お茶は三百円ですか？', 'お茶は三百円ではありません。'):
            self.assertEqual(lab_dialogue_state(request('はい。', history=[a(value)]))['bound_service_values'], [])

    def test_question_about_another_route_does_not_change_the_current_journey(self):
        data = request('大阪行きは何番線ですか？', 'station', [
            a('京都行きは三番線です。大阪行きは五番線です。'), u('京都までお願いします。')])
        validate_lab_conversation('大阪行きは5番線です。', data)
        validate_lab_conversation('5番線です。', data)
        self.assertEqual(lab_dialogue_state(data)['learner_asserted']['destination'], '京都')

    def test_preferences_are_ephemeral_explicit_and_never_an_assisted_example(self):
        data = request('コーヒーは好きじゃないです。', 'free')
        with self.assertRaisesRegex(ValueError, 'preference_polarity'):
            validate_lab_conversation('コーヒーが好きです。', data)
        validate_lab_conversation('コーヒーは好きじゃないです。', data)
        self.assertEqual(lab_dialogue_state(request('例えば、コーヒーが好きです。', 'free'))['learner_preferences'], {})
        data = request('コーヒーが好きです。', 'free', [u('コーヒーは好きじゃないです。')])
        self.assertEqual(lab_dialogue_state(data)['learner_preferences'], {'コーヒー': 'like'})

    def test_temperature_is_not_replaced_in_a_confirmed_order(self):
        data = request('ホットで。', history=[u('お茶を一つください。'), a('ホットですか、アイスですか？')])
        with self.assertRaisesRegex(ValueError, 'drink_temperature'):
            validate_lab_conversation('アイスのお茶一つですね。', data)
        validate_lab_conversation('ホットのお茶一つですね。', data)

    def test_recovery_run01_facility_inventions_are_rejected_but_unknown_is_allowed(self):
        data = request('ホットでお願いします。トイレはどこですか？', history=[
            a('練習のカフェです。お茶は三百五十円、コーヒーは五百円です。何にしますか？'),
            u('お茶を二つください。'), a('お茶を二つですね。ホットですか、アイスですか？')])
        for reply in ('ホットですね。トイレは、カフェの奥にあるので、そちらへどうぞ。',
                      'トイレは右手のほうにあります。お茶のホットは大丈夫です。',
                      'トイレは右手の奥にあります。お茶のホットは350円です。何か他にご希望はありますか？'):
            with self.subTest(reply=reply), self.assertRaisesRegex(ValueError, 'invents_facility_location'):
                validate_lab_conversation(reply, data)
        validate_lab_conversation('ホットですね。トイレの場所はわかりません。', data)
        self.assertIsNone(safe_controlled_fallback(data))
        data['history'].insert(0, a('トイレは右にあります。'))
        validate_lab_conversation('トイレは右にあります。', data)

    def test_recovery_run01_coordinated_prices_are_bound_and_available_to_hybrid(self):
        data = request('お茶はいくらですか？', history=[
            a('練習のカフェです。お茶は三百五十円、コーヒーは五百円です。何にしますか？')])
        values = lab_dialogue_state(data)['bound_service_values']
        self.assertEqual({item['subject']: item['value'] for item in values}, {'お茶': '350円', 'コーヒー': '500円'})
        self.assertEqual(safe_controlled_fallback(data)['japanese'], '350円です。')
        with self.assertRaisesRegex(ValueError, 'bound_service_value'):
            validate_lab_conversation('お茶は500円です。', data)
        validate_lab_conversation('お茶は350円です。', data)

    def test_recovery_run01_count_change_keeps_temperature_for_the_same_product(self):
        history = [u('お茶を二つください。'), a('ホットですか、アイスですか？'),
                   u('ホットでお願いします。トイレはどこですか？'), a('トイレの場所はわかりません。')]
        data = request('やっぱり、お茶は一つでお願いします。', history=history)
        self.assertEqual(lab_dialogue_state(data)['learner_asserted'], {
            'drink': 'お茶', 'quantity': '一つ', 'temperature': 'ホット'})
        validate_lab_conversation('ホットのお茶一つですね。', data)
        self.assertEqual(safe_controlled_fallback(request('一つです。', history=history))['japanese'], 'ホットのお茶一つですね。')
        # A replacement product must still reset a previous temperature.
        changed = request('やっぱり、コーヒーを一つください。', history=history)
        self.assertNotIn('temperature', lab_dialogue_state(changed)['learner_asserted'])

    def test_translation_rejects_explicit_preference_polarity_and_count_contradictions(self):
        for japanese, french, error in [('コーヒーは好きじゃないです。', 'J’aime le café.', 'polarity'),
                                       ('お茶が好きです。', 'Je n’aime pas le thé.', 'polarity'),
                                       ('切符は二枚です。', 'Il y a trois billets.', 'quantity'),
                                       ('お茶二つですね。', 'Trois thés, d’accord.', 'quantity')]:
            with self.subTest(japanese=japanese), self.assertRaisesRegex(ValueError, error):
                validate_lab_translation(japanese, french)
        validate_lab_translation('コーヒーは好きじゃないです。', 'Je n’aime pas le café.')
        validate_lab_translation('切符は二枚です。', 'Deux billets.')
        validate_lab_translation('お茶二つですね。', '2 thés, d’accord.')

    def test_fallback_only_realises_complete_atomic_service_intent(self):
        data = request('お茶を二つください。')
        self.assertEqual(safe_controlled_fallback(data)['intent'], 'drink_temperature')
        for data in [request('お茶を二つください。映画の話をしたいです。'),
                     request('お茶を一つください。トイレはどこですか？'),
                     request('お茶について教えてください。'),
                     request('京都までお願いします。でも、今日は行きません。', 'station'),
                     request('ベルギーから来ました。', 'meet'),
                     request('コーヒーはいりません。')]:
            with self.subTest(text=data['text']):
                self.assertIsNone(safe_controlled_fallback(data))

    def test_observation_is_bounded_ephemeral_state_and_explicit_path(self):
        data = request('お茶を二つください。')
        self.assertEqual(lab_turn_observation(data, 'generated'), {
            'intent': 'continue_from_answer', 'path': 'generated',
            'facts': [{'name': 'drink', 'value': 'お茶'}, {'name': 'quantity', 'value': '二つ'}],
        })
        with self.assertRaisesRegex(ValueError, 'invalid_lab_turn_path'):
            lab_turn_observation(data, 'unknown')
        self.assertEqual(len(lab_turn_observation(data, 'fallback')['facts']), 2)
        history = [u(noun + 'が好きです。') for noun in
                   ('映画', '音楽', '本', '料理', '旅行', '散歩', '写真', '猫', '犬')]
        observation = lab_turn_observation(request('お茶を' + '1' * 90 + 'つください。', history=history), 'generated')
        self.assertEqual(len(observation['facts']), 8)
        self.assertTrue(all(len(item['value']) <= 80 for item in observation['facts']))


if __name__ == '__main__':
    unittest.main()
