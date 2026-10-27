import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { prepareTutorReply } from "../shared/tutor-feedback";

const original = "日本語を好きです。";
const raw = {
  reply: {
    japanese: "何が好きですか？",
    romaji: "nani ga suki desu ka?",
    french: "Qu’aimes-tu ?",
  },
  correction: {
    original: "un original inventé",
    corrected: "日本語が好きです。",
    romaji: "nihongo ga suki desu.",
    french: "J’aime le japonais.",
    explanation: "Avec suki, utilise ga pour ce que tu aimes.",
  },
  vocabulary: [],
};

test("une correction remplace la relance par un modèle à répéter, fidèle à la vraie réponse", () => {
  const result = prepareTutorReply(raw, original);
  assert.equal(result.correction?.original, original);
  assert.equal(
    result.reply.japanese,
    "日本語が好きです。 もう一度、言ってみましょう。",
  );
  assert.equal(
    result.reply.french,
    "J’aime le japonais. Réessaie cette phrase.",
  );
  assert.equal(
    result.reply.romaji,
    "nihongo ga suki desu. Mō ichido, itte mimashō.",
  );
  assert.equal(raw.correction.original, "un original inventé");
});

test("la ponctuation seule ne déclenche pas de répétition ; une phrase acceptée poursuit le dialogue", () => {
  assert.equal(prepareTutorReply(raw, "日本語が好きです！").correction, null);
  const accepted = { ...raw, correction: null };
  assert.deepEqual(prepareTutorReply(accepted, "うん、好き。"), accepted);
});

test("le contrôle local refuse un résultat mal formé plutôt que de masquer la correction", () => {
  execFileSync("python3", [
    "-c",
    `
import sys, json
sys.path.insert(0, 'server')
from conversation_feedback import parse_feedback
romanize = lambda value: 'nihongo ga suki desu.'
valid = {'correction': {'corrected': '日本語が好きです。', 'french': 'J’aime le japonais.', 'explanation': 'Avec suki, utilise ga.'}}
result = parse_feedback(json.dumps(valid), '日本語を好きです。', romanize)
assert result['original'] == '日本語を好きです。'
assert result['romaji'] == 'nihongo ga suki desu.'
assert parse_feedback('{"correction":null}', 'はい。', romanize) is None
assert parse_feedback(json.dumps(valid), '日本語が好きです！', romanize) is None
for invalid in ['not json', '{}', '[]', '{"correction":[]}', '{"correction":{"corrected":"yes","french":"Oui","explanation":"Tip"}}']:
    try:
        parse_feedback(invalid, '日本語を好きです。', romanize)
    except (ValueError, TypeError):
        pass
    else:
        raise AssertionError('invalid model feedback accepted')
`,
  ]);
});
