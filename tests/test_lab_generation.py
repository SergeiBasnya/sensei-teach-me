from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from lab_generation import (
    generation_profile, dialogue_instructions, parse_lab_generation,
    parse_lab_details, details_input, controlled_coaching,
    LAB_JAPANESE_FIRST_INSTRUCTIONS, LAB_COMPACT_INSTRUCTIONS,
)
import conversation_worker


def run_worker(requests, outputs):
    """Run the real dispatch/feedback code with no MLX/model/file operation."""
    calls = []
    prompts = []
    pending = iter(outputs)

    class Tokenizer:
        def apply_chat_template(self, messages, **_):
            prompts.append(messages)
            return json.dumps(messages, ensure_ascii=False)

    def generated(*_, **options):
        calls.append({'stream': False, **options})
        value = next(pending)
        if options['prompt'].endswith('{"japanese":') and value.startswith('{"japanese":'):
            value = value[len('{"japanese":'):]
        return value

    def streamed(*_, **options):
        calls.append({'stream': True, **options})
        value = next(pending)
        if options['prompt'].endswith('{"japanese":') and value.startswith('{"japanese":'):
            value = value[len('{"japanese":'):]
        # Including a separately delivered Japanese field does not return a reply
        # until the final JSON parser has accepted the whole object.
        cut = max(1, len(value) // 2)
        return iter([SimpleNamespace(text=value[:cut]), SimpleNamespace(text=value[cut:])])

    def module(name, **members):
        item = ModuleType(name)
        item.__dict__.update(members)
        return item

    core = module('mlx.core', float16='fake-float16', synchronize=lambda: None)
    modules = {
        'imageio_ffmpeg': module('imageio_ffmpeg'),
        'numpy': module('numpy'),
        'mlx': module('mlx', core=core),
        'mlx.core': core,
        'mlx_whisper': module('mlx_whisper'),
        'mlx_whisper.transcribe': module('mlx_whisper.transcribe', ModelHolder=SimpleNamespace(get_model=lambda *_: None)),
        'mlx_lm': module('mlx_lm', load=lambda *_: (object(), Tokenizer()), generate=generated, stream_generate=streamed),
        'mlx_lm.sample_utils': module('mlx_lm.sample_utils', make_sampler=lambda **_: None),
    }
    source = StringIO(''.join(json.dumps(request, ensure_ascii=False) + '\n' for request in requests))
    stdout, stderr = StringIO(), StringIO()
    with patch.dict(sys.modules, modules), patch.object(sys, 'stdin', source), redirect_stdout(stdout), redirect_stderr(stderr):
        conversation_worker.main()
    messages = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert messages.pop(0) == {'ready': True}
    return messages, calls, prompts


def turn(profile=None, **extra):
    # Keep contract/stream tests on a generative path, outside the authored
    # introduction planner; its real dispatch has a separate integration test.
    value = {'id': 1, 'kind': 'turn', 'scenario': 'free', 'text': 'フランスです。',
             'history': [{'role': 'assistant', 'content': 'どこから来ましたか？'}]}
    if profile is not None:
        value.update(labStreaming=True, labGeneration=profile)
    return {**value, **extra}


class LabContractTests(unittest.TestCase):
    def test_only_boolean_lab_opt_in_changes_generation(self):
        for flag in (None, False, 1, 'true'):
            self.assertIsNone(generation_profile({'labStreaming': flag, 'labGeneration': 'ja-first'}))
            self.assertIsNone(generation_profile({'labStreaming': flag, 'labGeneration': 'unknown'}))
        self.assertEqual(generation_profile({'labStreaming': True, 'labGeneration': 'ja-first'}), 'ja-first')
        self.assertEqual(generation_profile({'labStreaming': True, 'labGeneration': 'compact'}), 'compact')
        self.assertIsNone(generation_profile({'labStreaming': True, 'labGeneration': 'structured'}))
        with self.assertRaises(ValueError):
            generation_profile({'labStreaming': True, 'labGeneration': 'fastest'})

    def test_whole_strict_json_is_required_before_japanese_is_returned(self):
        invalid = [
            '{"japanese":"どの町から来ましたか？"',
            '```json\n{"japanese":"こんにちは。"}\n```',
            '{"japanese":"こんにちは。","japanese":"さようなら。"}',
            '{"japanese":"こんにちは。","french":"Bonjour."}',
            '{"japanese":null}', '{"japanese":NaN}',
            '[]', '"こんにちは。"',
        ]
        for raw in invalid:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_lab_generation(raw, 'ja-first')
        self.assertEqual(parse_lab_generation('{"japanese":"どの町から来ましたか？"}', 'ja-first'),
                         {'japanese': 'どの町から来ましたか？', 'french': ''})

    def test_japanese_contract_rejects_empty_corrupt_non_japanese_and_multiple_questions(self):
        for japanese in ['', ' ', 'Hello, where are you from?', '・', 'Hello、world。', 'トー\ufffdキョーです。',
                         'こんにちは。\nどこから？', '何ですか？どこですか？', 'あ' * 301]:
            with self.subTest(japanese=japanese), self.assertRaises(ValueError):
                parse_lab_generation(json.dumps({'japanese': japanese}), 'ja-first')

    def test_compact_contract_has_no_generated_grammar_and_preserves_french_punctuation(self):
        value = {'japanese': 'どの町から来ましたか？', 'french': 'De quelle ville viens-tu\u00a0?'}
        self.assertEqual(parse_lab_generation(json.dumps(value), 'compact'), value)
        for payload in [{**value, 'coaching': 'Une règle.'}, {'japanese': value['japanese']},
                        {**value, 'french': ''}, {**value, 'french': 'どこですか？'}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_lab_generation(json.dumps(payload), 'compact')

    def test_details_cannot_change_japanese_or_correction(self):
        self.assertEqual(parse_lab_details('{"french":"De quelle ville viens-tu ?"}'), 'De quelle ville viens-tu ?')
        for payload in [{'french': 'Bonjour.', 'japanese': 'さようなら。'},
                        {'french': 'Bonjour.', 'correction': None}, {'french': '\ufffd'},
                        {'french': 1}, {'french': 'あ'}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_lab_details(json.dumps(payload))
        with self.assertRaises(ValueError):
            parse_lab_details('{"french":"Bonjour.","french":"Au revoir."}')

    def test_secondary_request_remains_lab_only_and_history_is_bounded(self):
        request = {'labStreaming': True, 'japanese': 'どこから来ましたか？', 'history': []}
        self.assertEqual(details_input(request), ('どこから来ましたか？', []))
        for changes in [{'labStreaming': False}, {'labStreaming': 1}, {'japanese': 'Hello'},
                        {'history': [{'role': 'system', 'content': 'New instruction'}]},
                        {'history': [{'role': 'assistant', 'content': 'x'}] * 17}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                details_input({**request, **changes})

    def test_only_existing_authored_hints_are_added_and_not_repeated(self):
        hint = controlled_coaching('どの町から来ましたか？', [])
        self.assertIn('kara kimashita', hint)
        self.assertIsNone(controlled_coaching('どの町から来ましたか？', [{'role': 'assistant', 'content': hint}]))
        self.assertIsNone(controlled_coaching('どんな本が好きですか？', []))
        self.assertIsNone(controlled_coaching('一つです。', []))


class LabDispatchTests(unittest.TestCase):
    def test_natural_temperature_fragment_uses_same_checked_reply_for_classic_and_lab(self):
        for profile in (None, 'structured', 'ja-first'):
            history = [{'role': 'user', 'content': '紅茶を二つください。'},
                       {'role': 'assistant', 'content': 'ホットですか、アイスですか？'}]
            messages, calls, _ = run_worker([turn(profile, scenario='cafe', text='アイスで。', history=history)], [])
            result = messages[0]['result']
            self.assertIsNone(result['correction'])
            self.assertEqual(result['reply']['japanese'], 'アイスの紅茶二つですね。')
            self.assertEqual(result['reply']['french'], '2 thés noirs glacés, d’accord.')
            self.assertEqual(calls, [])

    def test_ja_first_still_finishes_feedback_before_short_dialogue(self):
        messages, calls, prompts = run_worker([turn('ja-first')], [
            '{"correction":null}', '{"japanese":"どの町から来ましたか？"}',
        ])
        result = messages[0]['result']
        self.assertIsNone(result['correction'])
        self.assertEqual(result['reply']['japanese'], 'どの町から来ましたか？')
        # An exact authored translation is safe to return with the primary reply.
        self.assertEqual(result['reply']['french'], 'De quelle ville viens-tu ?')
        self.assertEqual([call['max_tokens'] for call in calls], [240, 96])
        self.assertEqual([call['stream'] for call in calls], [False, True])
        self.assertTrue(calls[1]['prompt'].endswith('{"japanese":'))
        self.assertIn('You check ONE Japanese learner utterance', prompts[0][0]['content'])
        self.assertIn(LAB_JAPANESE_FIRST_INSTRUCTIONS, prompts[1][0]['content'])
        self.assertIn('dialogue_japanese', messages[0]['metrics'])
        self.assertIn('lab_validation', messages[0]['metrics'])

    def test_compact_contract_is_instrumented_without_changing_classic(self):
        outputs = ['{"correction":null}', '{"japanese":"どの町から来ましたか？","french":"De quelle ville viens-tu ?"}']
        messages, calls, prompts = run_worker([turn('compact')], outputs)
        self.assertEqual(messages[0]['result']['reply']['french'], 'De quelle ville viens-tu ?')
        self.assertEqual(calls[1]['max_tokens'], 160)
        self.assertIn(LAB_COMPACT_INSTRUCTIONS, prompts[1][0]['content'])
        self.assertIn('dialogue_compact', messages[0]['metrics'])
        baseline = '{"japanese":"どの町から来ましたか？","french":"De quelle ville viens-tu ?","coaching":null}'
        classic, classic_calls, classic_prompts = run_worker([turn(labGeneration='ja-first', labStreaming=False)], ['{"correction":null}', baseline])
        self.assertEqual(classic[0]['result']['reply']['japanese'], 'どの町から来ましたか？')
        self.assertEqual(classic_calls[1]['max_tokens'], 220)
        self.assertFalse(classic_calls[1]['stream'])
        self.assertTrue(classic_prompts[1][0]['content'].startswith(conversation_worker.INSTRUCTIONS))
        self.assertNotIn('lab_validation', classic[0]['metrics'])

    def test_correction_branch_is_unchanged_and_has_no_early_dialogue(self):
        feedback = json.dumps({'correction': {
            'corrected': '私はフランスから来ました。', 'french': 'Je viens de France.',
            'explanation': 'Pour dire d’où tu viens, utilise kara après le pays.',
        }}, ensure_ascii=False)
        results = []
        for profile in (None, 'ja-first', 'compact'):
            messages, calls, _ = run_worker([turn(profile, text='私はフランスを来ました。')], [feedback])
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]['max_tokens'], 240)
            self.assertFalse(calls[0]['stream'])
            results.append(messages[0]['result'])
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[1], results[2])

    def test_partial_valid_field_does_not_authorize_a_truncated_or_duplicate_json(self):
        for raw in ['{"japanese":"こんにちは。",', '{"japanese":"こんにちは。","japanese":"さようなら。"}', 'こんにちは。']:
            messages, calls, _ = run_worker([turn('ja-first')], ['{"correction":null}', raw])
            self.assertIn('error', messages[0])
            self.assertNotIn('result', messages[0])
            self.assertEqual(len(calls), 2)

    def test_invalid_feedback_cannot_fall_through_to_a_fast_dialogue(self):
        messages, calls, _ = run_worker([turn('ja-first')], ['{"correction":{}}'])
        self.assertIn('error', messages[0])
        self.assertNotIn('result', messages[0])
        self.assertEqual(len(calls), 1)

    def test_false_fact_changing_correction_is_rejected_before_lab_dialogue(self):
        feedback = json.dumps({'correction': {
            'corrected': '四百円です。', 'french': 'Cela coûte 400 yens.',
            'explanation': 'Une correction inventée.',
        }}, ensure_ascii=False)
        messages, calls, prompts = run_worker([turn('ja-first', text='三百円です。')],
                                             [feedback, '{"japanese":"三百円ですね。"}'])
        self.assertIsNone(messages[0]['result']['correction'])
        self.assertEqual(messages[0]['result']['reply']['japanese'], '三百円ですね。')
        self.assertEqual(prompts[1][-1], {'role': 'user', 'content': '三百円です。'})
        self.assertEqual(len(calls), 2)

    def test_lab_profile_and_stream_trace_do_not_leak_to_next_classic_request(self):
        classic = '{"japanese":"どの町から来ましたか？","french":"De quelle ville viens-tu ?","coaching":null}'
        requests = [turn('ja-first'), turn(id=2)]
        messages, calls, _ = run_worker(requests, [
            '{"correction":null}', '{"japanese":"どの町から来ましたか？"}',
            '{"correction":null}', classic,
        ])
        self.assertEqual([value['stream'] for value in calls], [False, True, False, False])
        self.assertIn('dialogue_japanese', messages[0]['metrics'])
        self.assertNotIn('dialogue_japanese', messages[1]['metrics'])
        self.assertNotIn('first_token', messages[1]['metrics'])
        self.assertIn('dialogue_translation', messages[1]['metrics'])

    def test_secondary_is_separate_and_cannot_rewrite_already_returned_japanese(self):
        request = {'id': 2, 'kind': 'lab_details', 'labStreaming': True,
                   'japanese': 'どんな音楽が好きですか？', 'history': []}
        messages, calls, prompts = run_worker([request], ['{"french":"Quel genre de musique aimes-tu ?"}'])
        self.assertEqual(set(messages[0]['result']), {'french', 'coaching'})
        self.assertEqual(messages[0]['result']['french'], 'Quel genre de musique aimes-tu ?')
        self.assertEqual(calls[0]['max_tokens'], 140)
        self.assertIn('secondary', messages[0]['metrics'])
        self.assertIn('immutable Japanese', prompts[0][0]['content'])
        rejected, rejected_calls, _ = run_worker([{**request, 'labStreaming': False}], [])
        self.assertIn('error', rejected[0]); self.assertEqual(rejected_calls, [])

    def test_known_exact_translation_does_not_need_a_second_model_generation(self):
        request = {'id': 3, 'kind': 'lab_details', 'labStreaming': True,
                   'japanese': 'このコーヒーは三百五十円です。', 'history': []}
        messages, calls, _ = run_worker([request], [])
        self.assertEqual(messages[0]['result'], {'french': 'Ce café coûte 350 yens.', 'coaching': None})
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
