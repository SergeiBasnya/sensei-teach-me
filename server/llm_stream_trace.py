"""Measure token delivery without authorizing any partial JSON for speech."""
import re
import time


def collect_stream(pieces, metrics, clock=time.monotonic):
    started = clock()
    text = ''
    first = None
    japanese = None
    for piece in pieces:
        fragment = piece.text
        if fragment and first is None:
            first = (clock() - started) * 1000
        text += fragment
        if japanese is None and re.search(r'"japanese"\s*:\s*"(?:[^"\\]|\\.)*"', text):
            japanese = (clock() - started) * 1000
    complete = (clock() - started) * 1000
    metrics['stream_complete'] = round(complete, 1)
    if first is not None:
        metrics['first_token'] = round(first, 1)
    if japanese is not None:
        metrics['japanese_field_complete'] = round(japanese, 1)
        metrics['json_gate_wait'] = round(max(0, complete - japanese), 1)
    return text
