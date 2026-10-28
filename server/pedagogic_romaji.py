"""Pedagogical Hepburn reading from morphology, never VOICEVOX accent notation.

Policy: particles separated, verb inflections attached, te + aspect separated
(sunde imasu), copula separated (suki desu ka), phonetic long vowels with macrons.
No model calls. Dictionary ambiguity/proper names still need human review.
"""
from functools import lru_cache
import re
import unicodedata
from janome.tokenizer import Tokenizer
import pykakasi

DIGITS = dict(zip('零〇一二三四五六七八九', [0,0,1,2,3,4,5,6,7,8,9]))
NUMBER = re.compile(r'[0-9零〇一二三四五六七八九十百千万]+\Z')
COUNTERS = {'人','枚','円','番','番線','年','月','日','時','分','歳','つ','個','杯','本','週','か月','ヶ月','カ月','箇月'}
COUNTER_READINGS = {'人':'ニン','枚':'マイ','円':'エン','番':'バン','番線':'バンセン','年':'ネン','月':'ガツ','日':'ニチ','時':'ジ','分':'フン','歳':'サイ','つ':'ツ','個':'コ','杯':'ハイ','本':'ホン','週':'シュー','か月':'カゲツ','ヶ月':'カゲツ','カ月':'カゲツ','箇月':'カゲツ'}
QUESTION_COUNTERS = {'人':'ナンニン','枚':'ナンマイ','番':'ナンバン','番線':'ナンバンセン','年':'ナンネン','月':'ナンガツ','日':'ナンニチ','時':'ナンジ','分':'ナンプン','歳':'ナンサイ','個':'ナンコ','杯':'ナンバイ','本':'ナンボン'}
SINGLES = ['ゼロ','イチ','ニ','サン','ヨン','ゴ','ロク','ナナ','ハチ','キュー']
DAYS = {1:'ツイタチ',2:'フツカ',3:'ミッカ',4:'ヨッカ',5:'イツカ',6:'ムイカ',7:'ナノカ',8:'ヨーカ',9:'ココノカ',10:'トーカ',14:'ジューヨッカ',20:'ハツカ',24:'ニジューヨッカ'}
NATIVE = {1:'ヒトツ',2:'フタツ',3:'ミッツ',4:'ヨッツ',5:'イツツ',6:'ムッツ',7:'ナナツ',8:'ヤッツ',9:'ココノツ',10:'トオ'}


def normalized_script(text):
    text = unicodedata.normalize('NFKC', text)
    # Hiragana loanword runs ending in ー otherwise split into spurious words.
    return re.sub(r'[ぁ-ゖ]+ー(?:[ぁ-ゖ]+ー)*', lambda match: ''.join(chr(ord(c)+0x60) if 'ぁ'<=c<='ゖ' else c for c in match[0]), text)


def number_value(surface):
    if not NUMBER.fullmatch(surface):
        return None
    if surface.isdecimal():
        return int(surface)
    if not any(c in surface for c in '十百千万'):
        return int(''.join(str(DIGITS[c]) for c in surface))
    total, section, digit = 0, 0, 0
    for char in surface:
        if char in DIGITS:
            digit = DIGITS[char]
        elif char == '万':
            total += (section + digit or 1) * 10000
            section, digit = 0, 0
        else:
            section += (digit or 1) * {'十':10,'百':100,'千':1000}[char]
            digit = 0
    return total + section + digit


def integer_kana(value):
    if not 0 <= value < 100000:
        return str(value)  # outside the checked beginner range: don't invent a reading
    if value == 0:
        return SINGLES[0]
    text = ''
    if value >= 10000:
        text += integer_kana(value // 10000) + 'マン '
        value %= 10000
    if value >= 1000:
        n, value = divmod(value, 1000)
        text += {1:'セン',3:'サンゼン',8:'ハッセン'}.get(n, SINGLES[n]+'セン') + ' '
    if value >= 100:
        n, value = divmod(value, 100)
        text += {1:'ヒャク',3:'サンビャク',6:'ロッピャク',8:'ハッピャク'}.get(n, SINGLES[n]+'ヒャク') + ' '
    if value >= 10:
        n, value = divmod(value, 10)
        text += (SINGLES[n] if n > 1 else '') + 'ジュー'
    return (text + (SINGLES[value] if value else '')).strip()


def counted_kana(value, counter, date=False):
    plain = integer_kana(value)
    if value == 0 and counter == '時':
        return 'レイジ'
    if not 0 < value < 100000:
        return plain + COUNTER_READINGS[counter]
    if counter == '人':
        if value in (1,2):
            return {1:'ヒトリ',2:'フタリ'}[value]
        return (integer_kana(value-4) if value > 4 else '')+'ヨニン' if value%10 == 4 else plain+'ニン'
    if counter == 'つ' and value in NATIVE:
        return NATIVE[value]
    if counter == '月' and value <= 12:
        return {4:'シガツ',7:'シチガツ',9:'クガツ'}.get(value, plain+'ガツ')
    if counter == '日':
        return DAYS.get(value, plain+'ニチ') if date or value != 1 else 'イチニチ'
    if counter == '時':
        if value%10 in (4,7,9):
            return (integer_kana(value-value%10) if value>=10 else '')+{4:'ヨジ',7:'シチジ',9:'クジ'}[value%10]
        return plain+'ジ'
    suffix = {'枚':'マイ','番':'バン','番線':'バンセン','年':'ネン','日':'ニチ','個':'コ'}
    if counter in suffix:
        return plain+suffix[counter]
    # Productive counter alternations; no relation to the three original errors.
    forms = {
        '分': {1:'イップン',3:'サンプン',4:'ヨンプン',6:'ロップン',8:'ハップン',0:'ジュップン'},
        '歳': {1:'イッサイ',8:'ハッサイ',0:'ジュッサイ'},
        '杯': {1:'イッパイ',3:'サンバイ',6:'ロッパイ',8:'ハッパイ',0:'ジュッパイ'},
        '本': {1:'イッポン',3:'サンボン',6:'ロッポン',8:'ハッポン',0:'ジュッポン'},
        '週': {1:'イッシュー',8:'ハッシュー',0:'ジュッシュー'},
        'か月': {1:'イッカゲツ',6:'ロッカゲツ',8:'ハッカゲツ',0:'ジュッカゲツ'},
    }
    if counter in ('ヶ月','カ月','箇月'):
        counter = 'か月'
    if counter == '歳' and value == 20:
        return 'ハタチ'
    default = dict(COUNTER_READINGS)
    if counter in forms:
        tail = value % 10
        if tail in forms[counter]:
            prefix = integer_kana(value-tail) if tail and value >= 10 else ''
            if tail == 0 and value > 10:
                if not plain.endswith('ジュー'):
                    return str(value) + default[counter]  # outside checked alternations
                prefix = plain[:-3]
            return prefix + forms[counter][tail]
        return plain + default[counter]
    return plain + counter


class PedagogicRomanizer:
    def __init__(self):
        self.tokenizer = Tokenizer()
        self.kakasi = pykakasi.kakasi()

    def kana(self, value):
        # Use explicit long-vowel marks from the dictionary's phonetic reading.
        # Do not turn every orthographic ou/ei/ii into a long vowel.
        output = ''
        for i, part in enumerate(value.split('ー')):
            if i and output:
                output = output[:-1] + {'a':'ā','i':'ī','u':'ū','e':'ē','o':'ō'}.get(output[-1], output[-1])
            output += ''.join(p['hepburn'] for p in self.kakasi.convert(part))
        return output

    @lru_cache(maxsize=256)
    def facts(self, text):
        tokens = list(self.tokenizer.tokenize(normalized_script(text)))
        entities = tuple(sorted(self(token.surface).lower() for token in tokens if token.part_of_speech.startswith('名詞,固有名詞')))
        numbers = []
        index = 0
        while index < len(tokens):
            if NUMBER.fullmatch(tokens[index].surface):
                end = index + 1
                while end < len(tokens) and NUMBER.fullmatch(tokens[end].surface):
                    end += 1
                numbers.append(number_value(''.join(token.surface for token in tokens[index:end])))
                index = end
            else:
                native_counts = {**{value:key for key,value in NATIVE.items()}, 'ヒトリ':1, 'フタリ':2}
                if tokens[index].reading in native_counts:
                    numbers.append(native_counts[tokens[index].reading])
                index += 1
        negative = bool(re.search(r'ません|ない|なかった', text))
        drink_readings = {'kōhī','ocha','kōcha','mizu','omizu','bīru','jūsu','gyūnyū'}
        drinks = tuple(self(t.surface).lower().replace('omizu','mizu') for t in tokens if self(t.surface).lower() in drink_readings)
        tastes = tuple(self(t.surface).lower() for t in tokens if self(t.surface).lower() in ('suki','kirai','daisuki'))
        return entities, tuple(numbers), negative, drinks, tastes

    def correction_is_safe(self, original, corrected):
        normalize = lambda value: re.sub(r"[\s。、！？.!?]", '', value).lower()
        if normalize(self(original)) == normalize(self(corrected)):
            return False  # orthography/kana/kanji/punctuation alone is not a mistake
        if self.facts(original) != self.facts(corrected):
            return False  # never let correction rewrite supplied names, numbers or polarity
        source, target = normalize(original), normalize(corrected)
        if target == '私は' + source or target == source + 'です':
            return False  # a fragment is not wrong merely because it omits a subject/copula
        return True

    @lru_cache(maxsize=256)
    def __call__(self, original):
        tokens = list(self.tokenizer.tokenize(normalized_script(original)))
        groups, previous = [], None
        i = 0
        while i < len(tokens):
            token = tokens[i]
            pos = token.part_of_speech.split(',')
            following = tokens[i+1] if i+1 < len(tokens) else None
            if token.surface == '何' and following and following.surface in COUNTERS and following.surface != '円':
                groups.append(QUESTION_COUNTERS.get(following.surface, 'ナン'+following.phonetic))
                previous, i = following, i+2
                continue
            if pos[0] == '名詞' and pos[1] == '数' and NUMBER.fullmatch(token.surface):
                end = i+1
                while end < len(tokens) and NUMBER.fullmatch(tokens[end].surface) and tokens[end].part_of_speech.startswith('名詞,数'):
                    end += 1
                value = number_value(''.join(t.surface for t in tokens[i:end]))
                counter = tokens[end].surface if end < len(tokens) else ''
                duration = counter.endswith('間') and counter[:-1] in COUNTERS
                core_counter = counter[:-1] if duration else counter
                if core_counter in COUNTERS and core_counter != '円':
                    date = not duration and core_counter == '日' and (any('月' in t.surface for t in tokens[:i]) or bool(re.search(r'今日(?:は)?一日(?:です|だ)|一日は[月火水木金土日]曜日', original)))
                    groups.append(counted_kana(value, core_counter, date) + ('カン' if duration else ''))
                    previous = tokens[end]
                    i = end+1
                else:
                    groups.append(integer_kana(value))
                    previous = tokens[end-1]
                    i = end
                continue
            reading = token.phonetic
            if not reading or reading == '*':
                reading = '?' if re.search(r'[\u3400-\u9fff]',token.surface) else token.surface
            if token.surface == '何' and following and following.base_form in ('です','だ'):
                reading = 'ナン'
            if token.surface == '日本':
                reading = 'ニホン'  # product preference; Nippon is also valid
            if token.surface == '中' and previous and previous.surface in ('日本','世界','日','年','晩'):
                reading = 'ジュー'
            if pos[0] == '助詞':
                reading = {'は':'ワ','へ':'エ','を':'オ'}.get(token.surface, reading)
            if token.surface == 'どういたしまして':
                groups.extend(['ドー','イタシマシテ'])
                previous, i = token, i+1
                continue
            prev_pos = previous.part_of_speech.split(',') if previous else []
            if token.base_form == 'う' and pos[0] == '助動詞' and previous and ('未然' in previous.infl_form or previous.surface.endswith('しょ')):
                reading = 'ー'  # volitional vowel, not an orthographic ou heuristic
            attach = bool(groups) and (
                (pos[0] == '助動詞' and token.base_form not in ('です','だ','ござる') and prev_pos[0] in ('動詞','形容詞','助動詞'))
                or (pos[0] == '助詞' and token.surface in ('て','で') and pos[1] == '接続助詞' and prev_pos[0] in ('動詞','形容詞','助動詞'))
                or (prev_pos and prev_pos[0] == '接頭詞')
                or (pos[0] == '名詞' and pos[1] == '接尾' and token.surface not in COUNTERS)
            )
            if attach:
                groups[-1] += reading
            else:
                groups.append(reading)
            previous = token
            i += 1
        result = ' '.join(self.kana(group) for group in groups if group.strip())
        result = result.translate(str.maketrans({'。':'.','、':',','？':'?','！':'!'}))
        result = re.sub(r'\s+([,.!?])',r'\1',result)
        result = re.sub(r'\s+', ' ', result).strip()
        result = re.sub(r'([.!?]\s+)([a-zāēīōū])', lambda match: match[1]+match[2].upper(), result)
        return result[:1].upper() + result[1:]
