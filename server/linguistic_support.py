"""Small authored explanations, selected from the Japanese actually being taught.

These rules cover the existing beginner objectives. Other output still needs
linguistic review; JSON validity is never a language-quality assessment.
"""
import re
import unicodedata


def _compact(value):
    return re.sub(r'[\s。、！？.!?…]', '', unicodedata.normalize('NFKC', value))


# These exact pairs are authored teaching material, not a general translator.
# Keep omitted subjects/nouns omitted unless the construction itself resolves them.
PREFERENCE_NOUNS = {
    'コーヒー': 'le café', 'お茶': 'le thé', '紅茶': 'le thé noir',
    '水': 'l’eau', '日本語': 'le japonais', '英語': 'l’anglais',
    '寿司': 'les sushis',
}
PLACES = {
    'フランス': 'France', 'ベルギー': 'Belgique', '日本': 'Japon',
    'パリ': 'Paris', 'リヨン': 'Lyon', 'ブリュッセル': 'Bruxelles',
    '東京': 'Tokyo', '京都': 'Kyoto', '大阪': 'Osaka',
}
_PLACE_FROM = {'フランス': 'de France', 'ベルギー': 'de Belgique', '日本': 'du Japon'}


def checked_requested_help(meaning):
    """A narrow complete French intention, never a substring/keyword rewrite."""
    text = re.sub(r'[\s.!?]+$', '', meaning.strip().lower().replace('’', "'"))
    if text in ("l'addition, s'il te plaît", "l'addition, s'il vous plaît"):
        return 'お会計をお願いします。', 'L’addition, s’il te plaît.'
    for japanese, french in PREFERENCE_NOUNS.items():
        noun = french.lower().replace('’', "'")
        if text == "je n'aime pas " + noun:
            return japanese + 'は好きじゃないです。', 'Je n’aime pas ' + french + '.'
        if text == "j'aime " + noun:
            return japanese + 'が好きです。', 'J’aime ' + french + '.'
    return None


def accepted_contextual_response(text, history):
    """Known acceptable replies only; do not label a partial/unknown repair correct.

    This bypasses a needless correction attempt, not recognition uncertainty or
    comprehension checks. An accepted fragment is not evidence of mastery.
    """
    value = _compact(text)
    if value in ('はい', 'うん', 'いいえ', 'いえ', 'そうです', 'わかりました',
                 'ありがとうございます', 'ありがとう', 'どのホームですか',
                 'どちらのホームですか', '何番線ですか'):
        return True
    previous = next((item['content'] for item in reversed(history or [])
                     if item.get('role') == 'assistant'), '')
    if re.search(r'ホット.*[?？]|アイス.*[?？]', previous):
        if re.fullmatch(r'(?:はい)?(?:ホット|アイス)(?:で(?:お願いします)?|です)?', value):
            return True
    if re.search(r'(?:何(?:枚|杯|つ)|いくつ).*?[?？]', previous):
        if re.fullmatch(r'(?:はい)?[一二三四五六七八九十0-9]+(?:枚|杯|つ)(?:で|です|お願いします)?', value):
            return True
    # A simple complete statement already in the authored translation catalogue
    # is acceptable. Questions/negations are never stripped into positive facts.
    if checked_translation(text) is not None and not re.search(r'[?？]|か\s*[。.!！]?$', text):
        return True
    if re.search(r'いや[、,]|じゃなくて[、,]?|ではなく[、,]?', text):
        repaired = re.split(r'いや[、,]|じゃなくて[、,]?|ではなく[、,]?', text)[-1].strip()
        if repaired != text:
            return accepted_contextual_response(repaired, history)
    return False


def answer_guidance(japanese):
    text = re.sub(r'[\s。！？!?]', '', japanese)
    if 'から来ました' in text:
        return 'Pour dire d’où tu viens, utilise « [pays ou ville] kara kimashita ».'
    if 'に住んでいます' in text:
        return 'Pour dire où tu habites, utilise « [ville] ni sunde imasu ».'
    if 'は好きじゃないです' in text or 'は好きじゃない' in text:
        return 'Pour dire que tu n’aimes pas quelque chose, utilise « [chose] wa suki ja nai desu ».'
    if 'が好きではありません' in text:
        return 'Pour dire que tu n’aimes pas quelque chose, utilise « [chose] ga suki de wa arimasen ».'
    if 'が好きじゃないです' in text or 'が好きじゃない' in text:
        return 'Pour dire que tu n’aimes pas quelque chose, utilise « [chose] ga suki ja nai desu ».'
    if 'が好きです' in text:
        return 'Pour dire ce que tu aimes, utilise « [chose] ga suki desu ».'
    if re.search(r'を.*ください', text):
        return 'Pour demander quelque chose poliment, utilise « [chose] o kudasai ».'
    return None


def requested_explanation(question, request):
    value = request.lower()
    if 'kara' in value and re.search(r'から来|どこから|どの町から', question):
        return 'Dans cette phrase, kara indique l’origine. Place-le après le pays ou la ville.'
    if 'suki' in value and ('好き' in question or 'すき' in question):
        return 'Suki sert à parler de ce que tu aimes. Tu peux dire « [chose] ga suki desu ».'
    if 'aisu' in value and 'アイス' in question:
        return 'Dans une commande de boisson, aisu veut dire glacé.'
    if 'hotto' in value and 'ホット' in question:
        return 'Hotto veut dire chaud pour une boisson.'
    if 'kara' in value and re.search(r'時.*から', question):
        return 'Ici, kara veut dire à partir de. Place-le après l’heure de début.'
    if 'machi' in value and '町' in question:
        return 'Machi veut dire ville.'
    return None


def correction_explanation(original, corrected):
    norm = lambda value: re.sub(r'[\s。、！？.!?]', '', value)
    source, target = norm(original), norm(corrected)
    if source.replace('を', 'から', 1) == target and re.search(r'から来',target):
        return 'Pour dire d’où tu viens, utilise kara après le pays ou la ville.'
    if source.replace('を', 'が', 1) == target and 'が好き' in target:
        return 'Avec suki, utilise ga pour ce que tu aimes.'
    if (source.replace('ますでした', 'ました') == target and source != target
            and re.search(r'(?:見|飲み|食べ|行き|来|読み|話し|書き|聞き|住み|働き|勉強し|買い|待ち|歩き)ますでした$', source)):
        return 'Pour une action passée, utilise la forme polie en mashita.'
    return None


def question_key(question):
    pieces = [part.strip() for part in re.split(r'[。！？!?]',question) if part.strip()]
    value = pieces[-1] if pieces else ''
    value = re.sub(r'^.+?さん[、,]', '', value)
    return re.sub(r'\s+', '', value).replace(',', '、')


QUESTION_HINTS = {
    '切符は何枚ですか':'Kippu veut dire billet ; nanmai demande combien de billets. Tu peux répondre « ni-mai desu » pour deux.',
    'いくつですか':'Ikutsu demande combien. Tu peux répondre « hitotsu » pour un ou « futatsu » pour deux.',
    'どこから来ましたか':'Je te demande d’où tu viens. Tu peux dire « [pays] kara kimashita ».',
    '日本語は好きですか':'Nihongo veut dire japonais ; suki veut dire aimer. Tu peux répondre « hai » ou « iie ».',
    'どちらへ行きますか':'Je te demande ta destination. Tu peux dire « [lieu] e ikimasu » pour dire où tu vas.',
    'どこへ行きますか':'Je te demande ta destination. Tu peux dire « [lieu] e ikimasu » pour dire où tu vas.',
    'どちらに行きますか':'Je te demande ta destination. Tu peux dire « [lieu] ni ikimasu » pour dire où tu vas.',
    'どこに行きますか':'Je te demande ta destination. Tu peux dire « [lieu] ni ikimasu » pour dire où tu vas.',
    'どちらがよろしいですか':'Je te demande lequel tu préfères. Donne simplement ton choix.',
    'どちらがいいですか':'Je te demande lequel tu préfères. Donne simplement ton choix.',
    'どちらのサイズですか':'Saizu veut dire taille. Tu peux dire « chiisai no o kudasai » pour demander une petite taille.',
    'どのサイズがいいですか':'Saizu veut dire taille. Tu peux dire « chiisai no o kudasai » pour demander une petite taille.',
    'どのサイズですか':'Saizu veut dire taille. Tu peux dire « chiisai no o kudasai » pour demander une petite taille.',
    'サイズはどうしますか':'Saizu veut dire taille. Tu peux dire « chiisai no o kudasai » pour demander une petite taille.',
    'お支払いは現金ですか':'Genkin veut dire espèces. Tu peux répondre « hai » pour oui ou « iie » pour non.',
    '現金ですか':'Genkin veut dire espèces. Tu peux répondre « hai » pour oui ou « iie » pour non.',
    '現金ですか、カードですか':'Genkin veut dire espèces ; kādo veut dire carte. Réponds avec ton choix.',
    'どの町から来ましたか':'Machi veut dire ville. Tu peux dire « [ville] kara kimashita ».',
    'どこに住んでいますか':'Je te demande où tu habites. Tu peux dire « [ville] ni sunde imasu ».',
}


def question_guidance(japanese):
    return QUESTION_HINTS.get(question_key(japanese))


def checked_help(question):
    """Authored examples for exact known questions, never learner facts."""
    key = question_key(question)
    if key == '切符は何枚ですか':
        return ('二枚です。', 'Deux billets.')
    if key == 'いくつですか':
        return ('一つです。', 'Un seul.')
    if key == 'どの町から来ましたか':
        return ('パリから来ました。','Je viens de Paris.')
    if key in ('どこから来ましたか','どの国から来ましたか','出身はどこですか','ご出身はどちらですか'):
        return ('フランスから来ました。','Je viens de France.')
    if key in ('どこに住んでいますか',):
        return ('パリに住んでいます。','J’habite à Paris.')
    if key in ('お名前は','お名前は何ですか','名前は何ですか','おなまえは'):
        return ('アレックスです。','Je m’appelle Alex.')
    if key == 'ホットですか、アイスですか' and not re.search(r'ありません|ない|なく',question):
        return ('ホットでお願いします。','Chaud, s’il vous plaît.')
    if key in ('どちらまでですか','どちらまで','どちらへ行きますか','どこへ行きますか','どちらに行きますか','どこに行きますか'):
        return ('京都までお願いします。','Jusqu’à Kyoto, s’il vous plaît.')
    if key in ('何にしますか',):
        return ('コーヒーを一つください。','Un café, s’il vous plaît.')
    if key in ('何が好きですか','日本語は好きですか'):
        return ('日本語が好きです。','J’aime le japonais.')
    if key in ('サイズはどうしますか','どのサイズがいいですか','どのサイズですか','どちらのサイズですか'):
        return ('小さいのをください。','Une petite taille, s’il vous plaît.')
    if key in ('いつ出発しますか',):
        return ('明日です。','Demain.')
    if key in ('何時に出発しますか','何時ですか'):
        return ('九時です。','À neuf heures.')
    if key in ('ほかに何か','ほかに何かありますか'):
        return ('いいえ、ありがとうございます。','Non, merci.')
    if key == '片道ですか、往復ですか' and not re.search(r'ありません|ない|なく',question):
        return ('片道を一枚ください。','Un aller simple, s’il vous plaît.')
    return None


def safe_conversation_coaching(japanese, proposed, french, history):
    # A statement does not require another invented lesson about an old question.
    if not proposed or not re.search(r'[?？]|か[。！!]?\s*$', japanese):
        return None
    checked = question_guidance(japanese)
    if checked:
        return None if any(item['role']=='assistant' and checked in item['content'] for item in history) else checked
    # Outside checked patterns, give the meaning and a way to ask for a model;
    # don't present free-form generated grammar/romaji as a verified rule.
    meaning = french.strip() if isinstance(french,str) else ''
    return ((meaning[:180] + ' ') if meaning else '') + 'Essaie une réponse courte. Dis « je ne sais pas » si tu veux un exemple.'


def checked_translation(japanese):
    """Exact complete structures only. No attempt to certify arbitrary French."""
    text = japanese.strip().rstrip('。.!！')
    value = _compact(japanese)
    questions = {
        'どこから来ましたか': 'D’où viens-tu ?',
        'どの町から来ましたか': 'De quelle ville viens-tu ?',
        'どこに住んでいますか': 'Où habites-tu ?',
        '何が好きですか': 'Qu’est-ce que tu aimes ?',
        '何にしますか': 'Qu’est-ce que tu choisis ?',
        'ホットですかアイスですか': 'Chaud ou glacé ?',
        '片道ですか往復ですか': 'Un aller simple ou un aller-retour ?',
        '何枚ですか': 'Combien ?',
        'どのホームですか': 'Quel quai ?',
        'どちらのホームですか': 'Quel quai ?',
        '何番線ですか': 'Quelle voie ?',
        'ほかに何かありますか': 'Autre chose ?',
    }
    if value in questions:
        return questions[value]
    if value == '昨日映画を見ました':
        return 'Hier, j’ai regardé un film.'
    if value == 'お会計をお願いします':
        return 'L’addition, s’il te plaît.'
    for noun, french in PREFERENCE_NOUNS.items():
        source = re.sub(r'^私は', '', value)
        if re.fullmatch(re.escape(noun) + r'[がは]好き(?:です)?', source):
            return 'J’aime ' + french + '.'
        if re.fullmatch(re.escape(noun) + r'[がは]好き(?:ではありません|じゃありません|じゃないです|ではないです|じゃない)', source):
            return 'Je n’aime pas ' + french + '.'
        if re.fullmatch(re.escape(noun) + r'[がは]好きですか', source):
            return 'Tu aimes ' + french + ' ?'
    for place, french in PLACES.items():
        source = re.sub(r'^私は', '', value)
        if source == place + 'から来ました':
            return 'Je viens ' + _PLACE_FROM.get(place, 'de ' + french) + '.'
        if source == place + 'に住んでいます':
            prefix = {'フランス': 'en France', 'ベルギー': 'en Belgique', '日本': 'au Japon'}.get(place, 'à ' + french)
            return 'J’habite ' + prefix + '.'
        if place in ('フランス', 'ベルギー', '日本') and source == place + 'はどんなところですか':
            article = {'フランス': 'la France', 'ベルギー': 'la Belgique', '日本': 'le Japon'}[place]
            return 'À quoi ressemble ' + article + ' ?'
        if place in ('フランス', 'ベルギー', '日本') and source == place + 'のどの町から来ましたか':
            return 'De quelle ville ' + _PLACE_FROM[place] + ' viens-tu ?'
    if text == '一つです':
        return 'Un seul.'
    match = re.fullmatch(r'(この|その)?(コーヒー|お茶|紅茶|水)は([0-9０-９一二三四五六七八九十百千万]+)円です',text)
    if match:
        from pedagogic_romaji import number_value
        amount = number_value(match[3])
        noun = {'コーヒー':('café',False),'お茶':('thé',False),'紅茶':('thé noir',False),'水':('eau',True)}[match[2]]
        subject = ('Cette ' if noun[1] else 'Ce ') + noun[0] if match[1] else ('L’' if noun[1] else 'Le ') + noun[0]
        return f'{subject} coûte {amount} {"yen" if amount == 1 else "yens"}.'
    return None
