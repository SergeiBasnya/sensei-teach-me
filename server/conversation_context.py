"""Conservative current-conversation ledger. No storage or mastery inference."""
import re

NUMERAL = r'[0-9０-９一二三四五六七八九十百千万]+'
DRINK = re.compile(r'コーヒー|お茶|紅茶|水|ビール|ジュース|牛乳')
QUANTITY = r'(?:'+NUMERAL+r'(?:杯|つ|個)|ひとつ|ふたつ|みっつ)'
NEGATIVE = re.compile(r'ません|ない|なかった|要ら|いらな|不要|違い|好き|嫌い')
REQUEST = re.compile(r'ください|お願いします|注文しました|頼みました|にします')


def conversation_details(history, text, scenario):
    result = {}
    for message in [*history, {'role':'user','content':text}]:
        value = message['content']
        if re.search(r'[?？]|(?:です|ます)か[。！!]?\s*$', value):
            continue
        for clause in re.split(r'[。、！!]|じゃなくて|ではなくて|ではなく',value):
            if NEGATIVE.search(clause):
                continue
            prices = re.findall(r'('+NUMERAL+r'円)(?:です|でした|になります)', clause)
            if prices:
                result['stated_price'] = prices[-1]
            if message['role'] != 'user':
                continue
            requested = bool(REQUEST.search(clause))
            if scenario == 'cafe':
                choices = DRINK.findall(clause)
                quantity = re.findall(QUANTITY, clause)
                # Positive order requests or exact choice/quantity confirmations.
                confirmed = bool(re.fullmatch(r'\s*(?:'+DRINK.pattern+r')(?:で|です|は'+QUANTITY+r'です)?\s*',clause))
                if choices and (requested or confirmed):
                    result['ordered_drink'] = choices[-1]
                if quantity and (requested or confirmed):
                    result['ordered_quantity'] = quantity[-1]
                temperature = re.fullmatch(r'\s*(ホット|アイス)(?:で|です|でお願いします)?\s*',clause)
                if temperature:
                    result['temperature'] = temperature[1]
            if scenario == 'station':
                choices = re.findall(r'片道|往復', clause)
                confirmed = bool(re.fullmatch(r'\s*(?:片道|往復)(?:で|です)?\s*',clause))
                if choices and (requested or confirmed):
                    result['ticket_choice'] = choices[-1]
    return result
