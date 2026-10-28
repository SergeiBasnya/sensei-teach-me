"""Product reading convention, deterministic checks; specialist review still pending."""
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from pedagogic_romaji import PedagogicRomanizer, number_value

class RomanizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.romanize = PedagogicRomanizer()

    def test_reference_corpus(self):
        corpus = json.loads((Path(__file__).parent/'corpora/romaji.json').read_text())
        for item in corpus:
            with self.subTest(id=item['id'],category=item['category']):
                self.assertEqual(self.romanize(item['japanese']),item['expected'])

    def test_particle_rules_depend_on_morphology(self):
        self.assertEqual(self.romanize('葉は緑です。'), 'Ha wa midori desu.')
        self.assertEqual(self.romanize('母は花屋です。'),'Haha wa hanaya desu.')

    def test_long_vowels_do_not_change_verb_endings_or_all_ei(self):
        self.assertEqual(self.romanize('思います。'), 'Omoimasu.')
        self.assertEqual(self.romanize('学生です。'), 'Gakusei desu.')
        self.assertEqual(self.romanize('いいえ。'), 'Īe.')

    def test_number_parsing(self):
        for text,number in [('三百',300),('二千三百四十五',2345),('三〇〇',300),('300',300),('一万二千',12000)]:
            with self.subTest(text=text): self.assertEqual(number_value(text),number)
        self.assertIsNone(number_value('日本'))

    def test_no_accent_notation_and_no_arbitrary_auxiliary_spaces(self):
        for text in ['来ましたか？','住んでいます。','読んでいませんでした。']:
            result=self.romanize(text)
            self.assertNotRegex(result,r'[_/]|kima shita|sun de|imasuka')
            self.assertEqual(self.romanize(text),result)
