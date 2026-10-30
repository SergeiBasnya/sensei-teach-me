"""Small, authored intent realisations shared by local dialogue contracts.

Only explicit service choices and a personal-identity question take this path.
Other conversation stays generative. Values are ephemeral, never learning facts.
No arithmetic, availability, fare or platform is inferred from a destination.
"""
import re

from conversation_context import DRINK, NUMERAL, QUANTITY
from lab_conversation import lab_dialogue_state, validate_lab_conversation, validate_lab_translation
from linguistic_support import question_guidance
from pedagogic_romaji import number_value

PLACES = {'京都': 'Kyoto', '大阪': 'Osaka', '東京': 'Tokyo', '奈良': 'Nara', '横浜': 'Yokohama'}
DRINKS = {
    'コーヒー': ('un café', 'cafés'), 'お茶': ('un thé', 'thés'),
    '紅茶': ('un thé noir', 'thés noirs'), '水': ('un verre d’eau', 'verres d’eau'),
    'ビール': ('une bière', 'bières'), 'ジュース': ('un jus', 'jus'),
    '牛乳': ('un verre de lait', 'verres de lait'),
}
_REPAIR = r'じゃなくて|ではなくて|ではなく|やっぱり|(?:いや|いえ)[、,]'
_QUESTION = re.compile(r'[?？]|(?:です|ます)か[。！!]?\s*$')
_EXAMPLE = re.compile(r'例えば|たとえば|例[:：]|[「『«]|exemple|tu peux dire', re.I)


def _reply(japanese, french, history, intent):
    hint = question_guidance(japanese)
    if hint and any(item['role'] == 'assistant' and hint in item['content'] for item in history):
        hint = None
    return {'japanese': japanese, 'french': french, 'coaching': hint, 'intent': intent}


def _quantity(value):
    native = {'ひとつ': 1, 'ふたつ': 2, 'みっつ': 3}
    return native.get(value) or number_value(re.sub(r'[つ杯個枚]$', '', value))


def _drink_french(drink, quantity, temperature=None):
    n = _quantity(quantity)
    if not 1 <= n <= 10:
        return None
    single, plural = DRINKS[drink]
    result = single if n == 1 else f'{n} {plural}'
    if temperature and drink in ('コーヒー', 'お茶', '紅茶'):
        result += (' chaud' if temperature == 'ホット' else ' glacé') + ('s' if n > 1 else '')
    return result[0].upper() + result[1:]


def _service_value(request, subject, kind):
    """Only assistant declarations explicitly bound to this exact item/route."""
    if request.get('labStreaming') is True:
        values = [item for item in lab_dialogue_state(request)['bound_service_values']
                  if item['role'] == 'assistant' and item['kind'] == kind and item['subject'] == subject]
        if values:
            item = values[-1]
            suffix = '番線' if kind == 'platform' else '円'
            return item['value'][:-len(suffix)], item['unit'] if kind == 'price' else None
        return None
    values = []
    for message in request.get('history', []):
        if message['role'] != 'assistant':
            continue
        for line in message['content'].splitlines():
            if _EXAMPLE.search(line):
                continue
            for sentence in re.split(r'(?<=[。！？?!])', line):
                if _QUESTION.search(sentence):
                    continue
                pattern = (re.escape(subject) + r'行きは(' + NUMERAL + r')番線です[。]?'
                           if kind == 'platform' else
                           r'(?:この)?' + re.escape(subject) + r'は(一つ)?(' + NUMERAL + r')円です[。]?')
                match = re.fullmatch(pattern, sentence.strip())
                if match:
                    values.append((match[1], None) if kind == 'platform' else (match[2], bool(match[1])))
    return values[-1] if values else None


def controlled_dialogue(request):
    text = request['text'].strip()
    history = request.get('history', [])
    state = lab_dialogue_state(request)
    facts = state['learner_asserted']
    scenario = request['scenario']
    if state['intent'] in ('help_or_repeat', 'close') or _EXAMPLE.search(text):
        return None
    if (re.search(r'モチ|もち|Mochi|あなた|\btu\b', text, re.I)
            and re.search(r'から来|出身|住ん|origine|viens|habite', text, re.I)
            and _QUESTION.search(text)):
        return _reply('私はAIです。日本語を話しましょう。',
                      'Je suis une IA. Parlons japonais.', history, 'ai_identity')
    if scenario == 'meet' and not _QUESTION.search(text):
        # Only the opening fact slots are authored. Likes, hobbies and other
        # replies leave this small scaffold and continue through generation.
        short = re.sub(r'^(?:えっと|あの)[、,…\s]*', '', text)
        if (facts.get('name') and re.fullmatch(re.escape(facts['name']) + r'です[。]?', short)
                and facts.get('name') and not facts.get('from_place')):
            return _reply('はじめまして。どこから来ましたか？',
                          'Enchantée. D’où viens-tu ?', history, 'meet_origin')
        if re.search(r'から来ました|に住んでいます', text) or (
                any(re.fullmatch(re.escape(value) + r'です[。]?', short)
                    for value in (facts.get('from_city'), facts.get('home_city')) if value)):
            if facts.get('from_city') or facts.get('home_city'):
                return _reply('日本語は好きですか？', 'Tu aimes le japonais ?', history, 'meet_likes')
            if facts.get('from_place'):
                return _reply('どこに住んでいますか？', 'Où habites-tu ?', history, 'meet_home')
        if (facts.get('from_place') and not facts.get('from_city') and not facts.get('home_city')
                and re.fullmatch(re.escape(facts['from_place']) + r'です[。]?', short)):
            return _reply('どこに住んでいますか？', 'Où habites-tu ?', history, 'meet_home')
    if scenario == 'station':
        destination = facts.get('destination')
        if re.fullmatch(r'(?:どのホーム|何番線|何番のホーム)ですか[？?。]?', text):
            value = _service_value(request, destination, 'platform') if destination else None
            if value:
                n = number_value(value[0])
                return _reply(f'{n}番線です。', f'C’est la voie {n}.', history, 'known_platform')
            return _reply('すみません。今はわかりません。',
                          'Désolée. Pour le moment, je ne sais pas.', history, 'unknown_platform')
        if _QUESTION.search(text) or destination not in PLACES:
            return None
        # Exact slot updates, not arbitrary questions mentioning a train ticket.
        if not re.search(r'まで|片道|往復|' + NUMERAL + r'枚', text):
            return None
        choice, quantity = facts.get('ticket_choice'), facts.get('ticket_quantity')
        if not choice:
            return _reply(f'{destination}までですね。片道ですか、往復ですか？',
                          f'Pour {PLACES[destination]}, d’accord. Aller simple ou aller-retour ?', history, 'ticket_choice')
        fr_choice = 'aller simple' if choice == '片道' else 'aller-retour'
        if not quantity:
            return _reply(f'{choice}ですね。切符は何枚ですか？',
                          f'Un {fr_choice}, d’accord. Combien de billets veux-tu ?', history, 'ticket_quantity')
        n = _quantity(quantity)
        if not 1 <= n <= 10:
            return None
        count = 'Un billet' if n == 1 else f'{n} billets'
        return _reply(f'{destination}まで、{choice}で{quantity}ですね。',
                      f'{count} {fr_choice} pour {PLACES[destination]}, d’accord.', history, 'ticket_confirmation')
    if scenario != 'cafe':
        return None
    if re.fullmatch(r'お?会計(?:を)?(?:お願いします|お願いできますか)[。？?]?', text):
        return _reply('はい。少し待ってください。',
                      'Oui. Attends un instant, s’il te plaît.', history, 'bill_request')
    if state['unsupported_order']:
        return None
    drink = facts.get('drink')
    if re.fullmatch(r'(?:この)?(?:' + DRINK.pattern + r')は?いくらですか[？?。]?', text):
        subject = DRINK.search(text)[0]
        value = _service_value(request, subject, 'price')
        if value:
            n = number_value(value[0])
            return _reply(('一つ' if value[1] else '') + f'{n}円です。',
                          f'C’est {n} yens' + (' l’unité.' if value[1] else '.'), history, 'known_price')
        return _reply('すみません。値段はわかりません。',
                      'Désolée. Je ne connais pas le prix.', history, 'unknown_price')
    if _QUESTION.search(text) or not drink:
        return None
    final = re.split(_REPAIR + r'|[。]', text.rstrip('。'))[-1].strip(' 、,…')
    # Multiple-item orders stay generative; a single slot cannot represent them.
    if any(len(DRINK.findall(clause)) > 1 for clause in re.split(_REPAIR + r'|[。]', text)):
        return None
    relevant = ((re.search(r'ください|お願いします|にします', final)
                 and re.search(DRINK.pattern + '|' + QUANTITY, final))
                or re.fullmatch(r'(?:' + DRINK.pattern + r'|ホット|アイス|' + QUANTITY + r')(?:で|です)?', final))
    if not relevant:
        return None
    quantity, temperature = facts.get('quantity'), facts.get('temperature')
    if not quantity:
        partitive = {'コーヒー': 'Du café', 'お茶': 'Du thé', '紅茶': 'Du thé noir',
                     '水': 'De l’eau', 'ビール': 'De la bière', 'ジュース': 'Du jus', '牛乳': 'Du lait'}
        return _reply(f'{drink}ですね。いくつですか？',
                      partitive[drink] + ', d’accord. Combien en veux-tu ?', history, 'drink_quantity')
    french = _drink_french(drink, quantity, temperature)
    if not french:
        return None
    if not temperature and drink in ('コーヒー', 'お茶', '紅茶'):
        return _reply(f'{drink}{quantity}ですね。ホットですか、アイスですか？',
                      french + ', d’accord. Chaud ou glacé ?', history, 'drink_temperature')
    prefix = (temperature + 'の') if temperature and drink in ('コーヒー', 'お茶', '紅茶') else ''
    return _reply(f'{prefix}{drink}{quantity}ですね。', french + ', d’accord.', history, 'drink_confirmation')


def safe_controlled_fallback(request):
    """A failed generated candidate may fall back only on an atomic intent.

    The caller owns the decision to invoke this after validation failure. Never
    use it to replace a topic change, a mixed turn, uncertain ASR or a network
    failure. Returning None means unsupported, not that the learner was wrong.
    """
    text = request['text'].strip().rstrip('。？?').strip()
    state = lab_dialogue_state(request)
    if state['intent'] in ('help_or_repeat', 'close', 'topic_shift') or state['unsupported_order'] or _EXAMPLE.search(text):
        return None
    if re.search(r'[。！？?!\n]|でも|けど|について|の話|じゃなく|ではなく', text):
        return None
    cafe = (r'(?:' + DRINK.pattern + r')(?:を)?(?:' + QUANTITY + r')?(?:ください|お願いします|にします)|'
            r'(?:' + DRINK.pattern + r'|ホット|アイス|' + QUANTITY + r')(?:で|です|でお願いします)?|'
            r'(?:この)?(?:' + DRINK.pattern + r')は?いくらですか|'
            r'お?会計(?:を)?(?:お願いします|お願いできますか)')
    station = (r'(?:' + '|'.join(PLACES) + r')まで(?:お願いします|です)|'
               r'(?:片道|往復)(?:です|でお願いします)|' + NUMERAL + r'枚(?:です|でお願いします)|'
               r'(?:どのホーム|何番線|何番のホーム)ですか')
    if not ((request['scenario'] == 'cafe' and re.fullmatch(cafe, text)) or
            (request['scenario'] == 'station' and re.fullmatch(station, text))):
        return None
    result = controlled_dialogue(request)
    if result:
        try:
            validate_lab_conversation(result['japanese'], request)
            validate_lab_translation(result['japanese'], result['french'])
        except ValueError:
            return None
    return result


def constrain_preference_question(japanese, request):
    """Repair the two observed open follow-ups before speech, never afterwards.

    The conversation is still generated. Only an unsupported description of an
    explicitly liked item is replaced by one short, authored yes/no question.
    No learner preference is inferred from an assisted example or a question.
    """
    if _QUESTION.search(request['text']) or _EXAMPLE.search(request['text']):
        return None
    final = re.split(_REPAIR, request['text'])[-1].strip(' 、,…')
    match = re.search(r'(日本語|コーヒー|お茶|紅茶)[がは]好きです[。]?$', final)
    if not match or not re.search(r'の何が好き|どんな[^。！？?]{0,20}が好き', japanese):
        return None
    noun = match[1]
    if noun == '日本語':
        result = {'japanese': '日本語を毎日勉強しますか？',
                'french': 'Étudies-tu le japonais tous les jours ?',
                'coaching': 'Mainichi veut dire tous les jours ; benkyō shimasu veut dire étudier. Tu peux répondre hai ou iie.'}
    else:
        french = {'コーヒー': 'du café', 'お茶': 'du thé', '紅茶': 'du thé noir'}[noun]
        result = {'japanese': noun + 'を毎日飲みますか？',
            'french': 'Bois-tu ' + french + ' tous les jours ?',
            'coaching': 'Mainichi veut dire tous les jours ; nomimasu veut dire boire. Tu peux répondre hai ou iie.'}
    if any(item['role'] == 'assistant' and result['coaching'] in item['content']
           for item in request.get('history', [])):
        result['coaching'] = None
    return result
