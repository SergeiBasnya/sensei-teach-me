"""Small local conversation constraints, not a linguistic quality score.

The ledger is ephemeral, omits uncertain assertions, and keeps learner choices
separate from quoted service information. It never creates a learning event.
"""
import json
import re
import unicodedata

from conversation_context import DRINK, NUMERAL, QUANTITY


ROLE_RULES = {
    "meet": "You are an AI playing a new acquaintance in a practice conversation. The learner introduces themself; do not introduce the learner on their behalf or invent your own human origin, residence or family.",
    "free": "You are an AI conversation partner helping the learner practise Japanese. Do not invent a human biography for yourself or the learner.",
    "cafe": "You are an AI roleplaying service at a cafe counter. The learner is the customer. Acknowledge their latest order; do not place an order yourself. Ask only a missing relevant preference.",
    "station": "You are an AI roleplaying help for a traveller at a station. The learner is the traveller. For ordinary tickets, ask only missing destination, single/return or number of tickets they want, not tickets they already possess. Use simple counter questions such as 何枚ですか, not honorific purchase or possession formulas. Do not ask for name or phone number. Never ask the traveller to supply the platform, timetable or fare. When relevant details are known, give a useful brief confirmation or offer other help instead of inventing another requirement. No live railway data is available.",
}
_QUESTION = re.compile(r"[?？]|(?:です|ます|でした|ました|でしょう|よろしい)か[。！!]?\s*$")
_SHORT = re.compile(r"(?:はい|いいえ|うん|そうです|そうですね|大丈夫です)[。.!！\s]*$")
_NEGATIVE = re.compile(r"ません|じゃない|ではない|ではありません|じゃありません|要りません|いりません|いらない|要らない|不要|違います|違う")
_FILLER = re.compile(r"^(?:(?:あの|えっと|ええと|えーと|うーん|その)[、,\s…。.]*|あ[、,]|私は|わたしは)")
_CHANGE = re.compile(r"じゃなくて|ではなくて|ではなく|やっぱり|(?:いや|いえ)[、,]|plut[oô]t|finalement", re.I)
_HELP = re.compile(r"(?:je ne (?:sais|comprends) pas|aide.moi|comment (?:dire|r[eé]pondre)|r[eé]p[eè]te|もう一度|わかりません|分かりません|どう言|教えて)", re.I)
_EXAMPLE = re.compile(r"例えば|たとえば|例[:：]|\bexemple\b|tu peux dire|essaie de dire|[「『«]", re.I)
_CLOSE = re.compile(r"(?:さようなら|またね|また明日|今日はここまで|ありがとう|au revoir|[àa] bient[oô]t|on arr[eê]te|\bstop\b)", re.I)
_PLATFORM = re.compile(r"(?:" + NUMERAL + r")(?:番線|番ホーム|番のホーム)")
_TIME = re.compile(r"(?:" + NUMERAL + r")時(?:(?:" + NUMERAL + r")分)?")
_PRICE = re.compile(r"(?:" + NUMERAL + r")円")
_PERSONAL_TARGET = re.compile(r"モチ|もち|Mochi|あなた|君|\btu\b|\btoi\b|\b(?:ta|ton|tes)\b", re.I)
_BIOGRAPHY_TOPIC = re.compile(r"出身|から来|住|生まれ|育ち|家族|母|父|姉|兄|妹|弟|子供|子ども|結婚|何歳|origine|viens|habite|famille|parents|enfants|[âa]ge|n[eé]e?\b", re.I)
_POSITIVE_BIOGRAPHY = re.compile(r"から来ました|(?:の)?出身です|に住んでいます|に住んでる|で生まれました|で育ちました|結婚しています|(?:母|父|姉|兄|妹|弟|家族|子供|子ども).{0,18}(?:います|です)|(?:" + NUMERAL + r")歳です")
_TOPIC_SHIFT = re.compile(r"(?:別の|違う)話|話題を変|(?:について|の話を)話したい|の話をしたい|parlons (?:plut[oô]t |de |du |des )|changeons de sujet", re.I)
_PREFERENCE = re.compile(r'([^、。！？?]{1,30}?)[はが]好き(じゃないです|ではありません|ではないです|です)[。.!！]?')
_FACILITY_LOCATION = re.compile(r'(トイレ)(?:の場所)?は[、,]?[^。！？?]{1,60}?(?:にあります|にある|へどうぞ|です)')


def _ledger_messages(request):
    """A question does not erase a neighbouring explicit learner assertion."""
    for message in [*request.get('history', [])[-16:], {'role': 'user', 'content': request['text']}]:
        text = _normalized(message['content'])
        if request.get('labStreaming') is not True or message['role'] != 'user' or _EXAMPLE.search(text):
            yield {'role': message['role'], 'content': text}
        else:
            for sentence in re.split(r'(?<=[。！？?!])', text):
                if sentence.strip() and not _QUESTION.search(sentence):
                    yield {'role': 'user', 'content': sentence.strip()}


def _bound_service_values(request):
    """Narrow explicit declarations; unit values never become computed totals."""
    values = {}
    patterns = [
        ('price', re.compile(r'(?:この)?(' + DRINK.pattern + r')は(一つ)?(' + NUMERAL + r')円(?:です)?[。]?')),
        ('platform', re.compile(r'([^、。！？?]{1,30}?)行きは(' + NUMERAL + r')番線です[。]?')),
    ]
    for message in _ledger_messages(request):
        for line in message['content'].splitlines():
            if _EXAMPLE.search(line):
                continue
            for sentence in re.split(r'(?<=[。！？?!])', line):
                if _QUESTION.search(sentence) or _NEGATIVE.search(sentence):
                    continue
                for kind, pattern in patterns:
                    # A coordinated price list shares its final desu. Keep each
                    # explicit noun/amount pair, not a bag of permitted amounts.
                    clauses = re.split(r'[、,]', sentence) if kind == 'price' and re.search(r'円です[。]?$', sentence.strip()) else [sentence]
                    for clause in clauses:
                        match = pattern.fullmatch(clause.strip())
                        if match and (kind != 'price' or re.search(r'円です[。]?$', sentence.strip())):
                            subject = match[1]
                            value = match[3] + '円' if kind == 'price' else match[2] + '番線'
                            values[(kind, subject)] = {'kind': kind, 'subject': subject,
                                'value': _service_key(value), 'role': message['role'],
                                'unit': bool(match[2]) if kind == 'price' else False}
                facility = _FACILITY_LOCATION.search(sentence)
                if facility and not re.search(r'わかりません|分かりません|知りません|不明|情報がありません', sentence):
                    values[('facility', facility[1])] = {'kind': 'facility', 'subject': facility[1],
                        'value': facility[0], 'role': message['role'], 'unit': False}
    return list(values.values())


def _service_key(value):
    from pedagogic_romaji import number_value
    return re.sub(NUMERAL, lambda match: str(number_value(match[0])), value)


def _normalized(text):
    return unicodedata.normalize("NFKC", text).strip()


def _short_value(text):
    match = re.fullmatch(r"([^、。！？?！]{1,35}?)(?:です|でお願いします)?[。！!]?", text)
    value = match[1].strip() if match else None
    return value if value and not _SHORT.fullmatch(value) and not _NEGATIVE.search(value) else None


def _question_slot(text):
    if re.search(r"お?名前|おなまえ", text):
        return "name"
    if re.search(r"どの(?:町|街|市).*から", text):
        return "from_city"
    if re.search(r"どこから|どちらから|どの国|出身", text):
        return "from_place"
    if re.search(r"どこに住|どちらに住|住んで", text):
        return "home_city"
    if re.search(r"どちらまで|どこまで|どちら[へに]|どこ[へに]|目的地", text):
        return "destination"
    return None


def lab_dialogue_state(request):
    """Omission means unknown; this does not infer a biography from examples."""
    scenario = request["scenario"]
    if scenario not in ROLE_RULES:
        raise ValueError("invalid_lab_scenario")
    facts, service_values = {}, {"assistant": set(), "user": set()}
    rejected_drinks, preferences = set(), {}
    last_question = ""
    unsupported_order = False
    for message in _ledger_messages(request):
        text = _normalized(message["content"])
        # A question/negation is not a confirmed service value. These are only
        # quoted practice facts, never a claim of real-world railway truth.
        for line in text.splitlines():
            for sentence in re.split(r"(?<=[。！？?!])", line):
                if message["role"] == "assistant" and _QUESTION.search(sentence):
                    last_question = sentence
                # Keep a declaration next to a separate question, while an
                # example-marked line never supplies factual service values.
                if not _QUESTION.search(sentence) and not _NEGATIVE.search(sentence) and not _EXAMPLE.search(line):
                    service_values[message["role"]].update(map(_service_key, _PRICE.findall(sentence)))
                    if scenario == "station":
                        service_values[message["role"]].update(map(_service_key, _PLATFORM.findall(sentence)))
                        service_values[message["role"]].update(map(_service_key, _TIME.findall(sentence)))
        if message["role"] != "user" or _QUESTION.search(text):
            continue
        if scenario == 'cafe' and not _EXAMPLE.search(text):
            for drink in DRINK.findall(text):
                if re.search(re.escape(drink) + r'(?:は)?(?:じゃなくて|ではなくて|ではなく|要りません|いりません|いらない|要らない|不要)', text):
                    rejected_drinks.add(drink)
        slot = _question_slot(last_question)
        answered_question = last_question
        last_question = ""  # A later fragment must not answer a consumed question.
        preference = _PREFERENCE.fullmatch(_FILLER.sub('', text))
        if preference and not _EXAMPLE.search(text):
            preferences[preference[1]] = 'like' if preference[2] == 'です' else 'dislike'
        if _NEGATIVE.search(text) or _CHANGE.search(text):
            for field, value in list(facts.items()):
                negated = any(value in clause and _NEGATIVE.search(clause)
                              for clause in re.split(r"[。、]|" + _CHANGE.pattern, text))
                final_choice = re.split(_CHANGE, text)[-1].strip(' 、,。')
                same_drink_count = (request.get('labStreaming') is True and field == 'drink' and
                    re.fullmatch(re.escape(value) + r'(?:は|を)' + QUANTITY + r'(?:で)?(?:お願いします|ください|にします|です)', final_choice))
                if negated or (_CHANGE.search(text) and value in text and not same_drink_count):
                    facts.pop(field, None)
                    if field == "drink":
                        facts.pop("quantity", None)
                        facts.pop("temperature", None)
        if re.fullmatch(r"(?:いいえ|違います)[。！!\s]*", text):
            for field, value in list(facts.items()):
                if value in answered_question:
                    facts.pop(field, None)
        plain = _FILLER.sub("", text).strip().rstrip("。.!！")
        plain = re.split(r"。|じゃなくて|ではなくて|ではなく|やっぱり|(?:いや|いえ)[、,]", plain)[-1].strip(" 、,…")
        if not _NEGATIVE.search(plain) and not _HELP.search(plain) and not _EXAMPLE.search(text):
            if slot in ("name", "from_place", "from_city", "home_city", "destination"):
                short = _short_value(plain)
                if short and not re.search(r"を|から|に住|まで|ください|お願いします|好き|行きます", short):
                    facts[slot] = short
            name = re.fullmatch(r"(?:私の)?名前は(.{1,35}?)です[。！!]?", plain)
            origin = re.fullmatch(r"(.{1,35}?)から来ました[。！!]?", plain)
            home = re.fullmatch(r"(.{1,35}?)に住んでいます[。！!]?", plain)
            destination = re.match(r"([^、。]{1,35}?)(?:まで(?:お願いします|です)?|[へに]行きます)(?=[、。]|$)", plain)
            if name:
                facts["name"] = name[1]
            if origin:
                facts["from_city" if slot == "from_city" else "from_place"] = origin[1]
            if home:
                facts["home_city"] = home[1]
            if destination and scenario == "station":
                facts["destination"] = destination[1]
        if scenario == "cafe":
            clauses = re.split(r"[。、]|じゃなくて|ではなくて|ではなく|やっぱり|(?:いや|いえ)[、,]", text)
            addition = re.search(r"もう(?:" + QUANTITY + r")|追加|(?:" + DRINK.pattern + r")も", text)
            multiple = any(len(DRINK.findall(clause)) > 1 for clause in clauses)
            if addition or multiple:
                unsupported_order = True
            if unsupported_order:
                for field in ('drink', 'quantity', 'temperature'):
                    facts.pop(field, None)
                continue  # A single slot cannot describe an additive/multiple order.
            for value in DRINK.findall(text):
                if re.search(re.escape(value) + r"(?:は)?(?:じゃなくて|ではなくて|ではなく|は?要りません|は?いりません|は?いらない|は?不要)", text):
                    if facts.get("drink") == value:
                        facts.pop("drink")
                        facts.pop("quantity", None)
                        facts.pop("temperature", None)
            for clause in re.split(r"[。、]|じゃなくて|ではなくて|ではなく|やっぱり|(?:いや|いえ)[、,]", text):
                clause = _FILLER.sub("", clause).strip()
                if not clause or _NEGATIVE.search(clause) or _EXAMPLE.search(text):
                    continue
                drinks = DRINK.findall(clause)
                request_word = re.search(r"ください|お願いします|にします|ですね", clause)
                repaired_order = (_CHANGE.search(text) and re.search(r"ください|お願いします", text)
                                  and re.fullmatch(r"(?:" + DRINK.pattern + r")を" + QUANTITY, clause))
                exact_drink = re.fullmatch(r"(?:" + DRINK.pattern + r")(?:で|です)?", clause)
                if drinks and (request_word or exact_drink or repaired_order) and not re.search(re.escape(drinks[-1]) + r"(?:じゃなくて|ではなくて|ではなく)", text[text.find(clause):]):
                    if facts.get("drink") != drinks[-1]:
                        facts.pop("quantity", None)
                        facts.pop("temperature", None)
                    facts["drink"] = drinks[-1]
                    rejected_drinks.discard(drinks[-1])
                quantity = re.findall(QUANTITY, clause)
                if quantity and (request_word or re.fullmatch(QUANTITY + r"(?:です|で|でお願いします)?", clause)):
                    facts["quantity"] = quantity[-1]
                temperature = re.fullmatch(r"(ホット|アイス)(?:で|です|でお願いします)?", clause)
                if temperature:
                    facts["temperature"] = temperature[1]
        if scenario == "station":
            for clause in re.split(r"[。、]|じゃなくて|ではなくて|ではなく|やっぱり|(?:いや|いえ)[、,]", text):
                if _NEGATIVE.search(clause) or _EXAMPLE.search(text):
                    continue
                choice = re.search(r"(片道|往復)(?=で|です|を|$)", clause)
                if choice:
                    facts["ticket_choice"] = choice[1]
                quantity = re.search(r"(" + NUMERAL + r"枚)(?:です|で|お願いします|ください|$)", clause)
                if quantity:
                    facts["ticket_quantity"] = quantity[1]
    current = _normalized(request["text"])
    if _HELP.search(current):
        intent = "help_or_repeat"
    elif request.get('labStreaming') is True and _TOPIC_SHIFT.search(current):
        intent = "topic_shift"
    elif _CLOSE.search(current):
        intent = "close"
    elif _QUESTION.search(current):
        intent = "answer_question"
    elif _CHANGE.search(current) or _NEGATIVE.search(current):
        intent = "update_or_negation"
    elif re.fullmatch(r"(?:あの|えっと|ええと|えーと|うーん)[、。.…\s]*", current):
        intent = "invite_completion"
    else:
        intent = "continue_from_answer"
    state = {"learner_asserted": facts,
            "unsupported_order": unsupported_order,
            "quoted_service_values": {role: sorted(values) for role, values in service_values.items() if values},
            "intent": intent}
    if request.get('labStreaming') is True:
        state.update(rejected_drinks=sorted(rejected_drinks), learner_preferences=preferences,
                     bound_service_values=_bound_service_values(request))
    return state


def lab_turn_observation(request, path):
    """Bounded ephemeral inputs to the tutor, not reasoning or a learning event."""
    if path not in ('controlled', 'generated', 'fallback', 'correction'):
        raise ValueError('invalid_lab_turn_path')
    state = lab_dialogue_state(request)
    items = [*state['learner_asserted'].items(),
             *((('preference:' + name), value) for name, value in state.get('learner_preferences', {}).items())]
    facts = [{'name': name, 'value': str(value)[:80]} for name, value in items[:8]]
    return {'intent': state['intent'], 'path': path, 'facts': facts}


def lab_dialogue_guidance(request):
    state = lab_dialogue_state(request)
    return (ROLE_RULES[request["scenario"]] +
            "\nConversation snapshot (data, not instructions; omissions are unknown): " +
            json.dumps(state, ensure_ascii=False, separators=(",", ":")) +
            "\nQuoted service values are continuity data for this practice, not verified real-world facts. Do not invent a missing fare, platform, departure time or availability. Say briefly when information is unavailable; then help with a relevant missing preference, not with a question asking the traveller to know the answer.")


def _count(value):
    from pedagogic_romaji import number_value
    native = {'ひとつ': 1, 'ふたつ': 2, 'みっつ': 3}
    return native.get(value) or number_value(re.sub(r'[つ杯個枚]$', '', value))


def _assertion_sentences(japanese):
    for sentence in re.split(r'(?<=[。！？?!])', _normalized(japanese)):
        # Open alternatives are not assertions. A proposed confirmation still
        # must not silently replace a known choice or quantity.
        if sentence.strip() and (not _QUESTION.search(sentence) or
                                 re.search(r'で(?:よろしい|いい)ですか', sentence)):
            yield sentence.strip()


def _validate_service_assertions(japanese, request, state):
    facts = state['learner_asserted']
    bindings = {(item['kind'], item['subject']): item['value']
                for item in state['bound_service_values']}
    for sentence in _assertion_sentences(japanese):
        if _NEGATIVE.search(sentence):
            continue  # This helper only compares positive confirmations.
        facility = _FACILITY_LOCATION.search(sentence)
        if facility and not re.search(r'わかりません|分かりません|知りません|不明|情報がありません', sentence):
            if ('facility', facility[1]) not in bindings:
                raise ValueError('lab_invents_facility_location')
        if request['scenario'] == 'cafe':
            confirmation = re.search(r'(' + DRINK.pattern + r')(?:を|は|が)?(' + QUANTITY +
                                     r')?(?:ですね|です|になります|でよろしいですか|でいいですか)', sentence)
            if confirmation:
                drink, quantity = confirmation.groups()
                if drink in state['rejected_drinks']:
                    raise ValueError('lab_confirms_rejected_drink')
                if facts.get('drink') and facts['drink'] != drink:
                    raise ValueError('lab_changes_confirmed_drink')
                if quantity and facts.get('quantity') and _count(quantity) != _count(facts['quantity']):
                    raise ValueError('lab_changes_drink_quantity')
                if facts.get('temperature'):
                    temperatures = re.findall(r'(ホット|アイス)(?:の)?' + re.escape(drink), sentence)
                    if temperatures and any(value != facts['temperature'] for value in temperatures):
                        raise ValueError('lab_changes_drink_temperature')
            bare_count = re.fullmatch(r'(' + QUANTITY + r')(?:ですね|です|でよろしいですか)[。?？]?', sentence)
            if bare_count and facts.get('quantity') and _count(bare_count[1]) != _count(facts['quantity']):
                raise ValueError('lab_changes_drink_quantity')
        if request['scenario'] == 'station':
            if facts.get('ticket_quantity'):
                if any(_count(value) != _count(facts['ticket_quantity'])
                       for value in re.findall(NUMERAL + r'枚', sentence)):
                    raise ValueError('lab_changes_ticket_quantity')
            choices = re.findall(r'(片道|往復)(?=で|ですね|です|の切符)', sentence)
            if facts.get('ticket_choice') and any(value != facts['ticket_choice'] for value in choices):
                raise ValueError('lab_changes_ticket_choice')
            destinations = re.findall(r'(?:^|[、,は])([^、。！？?]{1,30}?)(?=まで|行きの切符)', sentence)
            if facts.get('destination') and any(value != facts['destination'] for value in destinations):
                raise ValueError('lab_changes_destination')
        # Link each explicit amount to its item/route, rather than allowing any
        # number that occurred somewhere in the conversation.
        for clause in re.split(r'[、,]', sentence):
            for kind, pattern in [('price', _PRICE), ('platform', _PLATFORM)]:
                values = pattern.findall(clause)
                if not values:
                    continue
                if kind == 'price' and request['scenario'] == 'cafe':
                    subjects = DRINK.findall(clause)
                    if not subjects:
                        subjects = DRINK.findall(request['text']) or ([facts['drink']] if facts.get('drink') else [])
                elif kind == 'platform' and request['scenario'] == 'station':
                    subjects = re.findall(r'(?:^|は)([^、。！？?]{1,30}?)行き', clause)
                    if not subjects:
                        subjects = re.findall(r'(?:^|[、,は])([^、。！？?]{1,30}?)行き', request['text'])
                    if not subjects:
                        subjects = [facts['destination']] if facts.get('destination') else []
                else:
                    continue
                if len(set(subjects)) == 1:
                    expected = bindings.get((kind, subjects[0]))
                    if expected and any(_service_key(value) != expected for value in values):
                        raise ValueError('lab_changes_bound_service_value')
                    if not expected and bindings:
                        raise ValueError('lab_unbound_service_value')


def validate_lab_conversation(japanese, request):
    """Reject a few certain defects; do not label other output correct Japanese."""
    state = lab_dialogue_state(request)
    if re.search(r'お持ちにな|お買い上げ|お買い求め|お求めにな|来ているわけ|いらっしゃいます|いらっしゃる|でございます', japanese):
        raise ValueError('beginner_elaborate_register')
    quoted_help = (state["intent"] == "help_or_repeat" and
                   re.search(r"[「『].+[」』].{0,5}(?:と言|と聞|と答)", japanese))
    personal_question = _PERSONAL_TARGET.search(request["text"]) and _BIOGRAPHY_TOPIC.search(request["text"])
    explicit_language_model = quoted_help and re.search(r"どう言|日本語で|comment dire|comment demander|tradu|exemple", request["text"], re.I)
    if personal_question and not explicit_language_model:
        for sentence in re.split(r"(?<=[。！？?!])", japanese):
            learner_name = state["learner_asserted"].get("name")
            subject = re.sub(r"^(?:はい|ええ|そうですね)[、,\s]*", "", sentence.strip())
            learner_subject = re.match(r"あなた(?:は|も|が)", subject) or (learner_name and re.match(re.escape(learner_name + "さん") + r"(?:は|も|が)", subject))
            if not learner_subject and not _NEGATIVE.search(sentence) and not _QUESTION.search(sentence) and _POSITIVE_BIOGRAPHY.search(sentence):
                raise ValueError("lab_invents_personal_biography")
    if state["intent"] != "close":
        remainder = re.sub(r"[、,。.!！?？\s]", "", japanese)
        remainder = re.sub(r"^.{1,30}?さん", "", remainder)
        remainder = re.sub(r"こんにちは|こんばんは|おはようございます|おはよう|はじめまして|どうぞ|よろしくお願いします|よろしく|そうですか|そうですね|わかりました|分かりました|はい", "", remainder)
        if not remainder:
            raise ValueError("lab_no_conversation_continuation")
    is_question = bool(_QUESTION.search(japanese))
    if not quoted_help and request["scenario"] == "station" and is_question and re.search(r"(?:どの|どちら|何番|何).{0,12}(?:ホーム|番線)|(?:ホーム|番線).{0,8}(?:どちら|どこ|何番)", japanese):
        raise ValueError("lab_station_role_reversed")
    if request["scenario"] == "cafe" and re.search(r"(?:" + DRINK.pattern + r")(?:を)?(?:" + QUANTITY + r")?[、,\s]*(?:ください|お願いします)[。！!]?\s*$", japanese):
        raise ValueError("lab_cafe_role_reversed")
    if is_question and not quoted_help:
        asked = _question_slot(japanese)
        if asked and asked in state["learner_asserted"]:
            raise ValueError("lab_reasks_known_learner_fact")
    if not quoted_help and request.get('labStreaming') is True:
        for sentence in _assertion_sentences(japanese):
            preference = _PREFERENCE.fullmatch(sentence)
            if preference and preference[1] in state['learner_preferences']:
                polarity = 'like' if preference[2] == 'です' else 'dislike'
                if polarity != state['learner_preferences'][preference[1]]:
                    raise ValueError('lab_changes_preference_polarity')
        _validate_service_assertions(japanese, request, state)
    elif not quoted_help:
        # Preserve the existing classic policy. The stronger comparator guards
        # and enriched snapshot are isolated until the lab has been qualified.
        from pedagogic_romaji import number_value
        drink = state['learner_asserted'].get('drink')
        confirmed = re.search(r'(' + DRINK.pattern + r')(?:を(?:' + QUANTITY + r'))?(?:ですね|でよろしいですか)', japanese)
        if drink and confirmed and confirmed[1] != drink:
            raise ValueError('lab_changes_confirmed_drink')
        if request['scenario'] == 'station':
            quantity = state['learner_asserted'].get('ticket_quantity')
            if quantity and any(number_value(value) != number_value(quantity[:-1])
                                for value in re.findall('(' + NUMERAL + ')枚', japanese)):
                raise ValueError('lab_changes_ticket_quantity')
            destination = state['learner_asserted'].get('destination')
            mentioned = re.findall(r'(京都|大阪|東京|奈良|横浜)(?=まで|行き)', japanese)
            if destination and any(place != destination for place in mentioned):
                raise ValueError('lab_changes_destination')
    if not quoted_help and request["scenario"] in ("station", "cafe"):
        asserted = []
        for sentence in re.split(r"[。！？?!]", japanese):
            asserted += _PRICE.findall(sentence)
            if request["scenario"] == "station":
                asserted += _PLATFORM.findall(sentence)
                asserted += _TIME.findall(sentence)
        known_values = {value for values in state["quoted_service_values"].values() for value in values}
        if any(_service_key(value) not in known_values for value in asserted):
            raise ValueError("lab_invents_service_value")
    return japanese


def _translated_count(french, noun):
    words = {'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4,
             'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10}
    number = r'(?:[0-9]+|' + '|'.join(words) + r')'
    matches = re.findall(r'\b(' + number + r')\s+(?:verres?\s+(?:d[’\x27]|de\s+))?(?:de\s+)?' + noun + r's?\b', french, re.I)
    return {int(value) if value.isdecimal() else words[value.lower()] for value in matches}


def validate_lab_translation(japanese, french):
    """Certain lexical contradictions only; unknown constructions need review."""
    nouns = {"コーヒー": r"caf[eé]", "お茶": r"th[eé]", "紅茶": r"th[eé]", "水": r"eau", "ビール": r"bi[eè]re", "ジュース": r"jus", "牛乳": r"lait"}
    for japanese_noun, french_noun in nouns.items():
        source_noun = re.search(re.escape(japanese_noun) + r"(?=を|が|は|も|で|と|、|。|[?？]|$|" + QUANTITY + r")", japanese)
        if source_noun and not re.search(r"\b" + french_noun + r"s?\b", french, re.I):
            raise ValueError("lab_translation_loses_drink")
        counts = re.findall(re.escape(japanese_noun) + r'(?:を|は|が)?(' + QUANTITY + r')', _normalized(japanese))
        translated_counts = _translated_count(french, french_noun)
        if counts and translated_counts and set(map(_count, counts)) != translated_counts:
            raise ValueError('lab_translation_changes_quantity')
    ticket_counts = re.findall(NUMERAL + r'枚', _normalized(japanese))
    translated_tickets = _translated_count(french, r'billet')
    if ticket_counts and translated_tickets and set(map(_count, ticket_counts)) != translated_tickets:
        raise ValueError('lab_translation_changes_quantity')
    # A single explicit preference sentence has an unambiguous polarity. Do not
    # infer scope across complex clauses, quoted examples or arbitrary language.
    preference = re.fullmatch(r'(' + '|'.join(nouns) + r'|日本語|英語|寿司)[はが]好き(じゃないです|ではありません|ではないです|です)[。.!！]?', _normalized(japanese))
    if preference:
        negative = preference[2] != 'です'
        french_positive = bool(re.search(r'\bj[’\x27]aime\b', french, re.I))
        french_negative = bool(re.search(r'\bje\s+n[’\x27]aime\s+pas\b', french, re.I))
        if (negative and french_positive) or (not negative and french_negative):
            raise ValueError('lab_translation_changes_polarity')
    amounts = re.findall(r"(" + NUMERAL + r")円", _normalized(japanese))
    translated = re.findall(r"([0-9]+)\s*(?:yen|yens|¥)", re.sub(r"(?<=\d)[\s\u00a0\u202f](?=\d)", "", french), re.I)
    if amounts and translated:
        from pedagogic_romaji import number_value
        if set(map(number_value, amounts)) != set(map(int, translated)):
            raise ValueError("lab_translation_changes_price")
    return french
