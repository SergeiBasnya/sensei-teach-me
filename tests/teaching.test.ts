import test from "node:test";
import assert from "node:assert/strict";
import { assistanceIntent, teaching, tutorFromHelp } from "../shared/teaching";
import { lessons } from "../shared/learning-plan";
import { tutorReplySchema } from "../shared/contracts";
import { readTutor } from "../src/lib/tutor-playback";

const help = {
  explanation: "Pour te présenter, donne ton prénom.",
  answer: {
    japanese: "アレックスです。",
    romaji: "Arekkusu desu.",
    french: "Je m’appelle Alex.",
  },
};
test("les neuf leçons ont une introduction et les demandes d’aide ne sont pas de fausses erreurs", () => {
  for (const lesson of lessons) assert.ok(teaching[lesson.id].length > 30);
  for (const text of [
    "Je ne sais pas.",
    "J’ai pas compris",
    "Je ne comprends pas",
    "わかりません。",
  ])
    assert.deepEqual(assistanceIntent(text), { kind: "answer", meaning: "" });
  assert.deepEqual(assistanceIntent("Je veux dire : j’aime le café"), {
    kind: "answer",
    meaning: "j’aime le café",
  });
  assert.equal(assistanceIntent("私はフランスから来ました。"), null);
  assert.equal(assistanceIntent("日本語が好きです。"), null);
  assert.deepEqual(assistanceIntent("Comment je demande l’addition ?"), {
    kind: "answer",
    meaning: "L’addition, s’il te plaît.",
  });
  assert.deepEqual(
    assistanceIntent("Tu peux répéter la question, s’il te plaît ?"),
    {
      kind: "question",
      action: "repeat",
    },
  );
  const tutor = tutorReplySchema.parse(tutorFromHelp(help));
  assert.equal(tutor.correction, null);
  assert.equal(tutor.reply.japanese, help.answer.japanese);
  assert.ok(tutor.coaching?.includes("Écoute"));
  assert.ok(
    tutorReplySchema.safeParse(
      tutorFromHelp({
        ...help,
        explanation: "a".repeat(500),
        answer: { ...help.answer, french: "b".repeat(500) },
      }),
    ).success,
  );
});
test("l’explication française se termine avant le japonais ; une pause interrompt toute la suite", async () => {
  const operations: string[] = [];
  let active = true;
  const reader = {
    async speakFrench(text: string) {
      operations.push(`fr:${text}`);
      return true;
    },
    async speakJapanese(text: string) {
      operations.push(`ja:${text}`);
      return true;
    },
    async playJapaneseAudio(audio: string) {
      operations.push(`audio:${audio}`);
      return true;
    },
  };
  const tutor = tutorFromHelp(help);
  assert.ok(
    await readTutor(tutor, reader, () => active, {
      french: "french-wav",
      japanese: "japanese-wav",
    }),
  );
  assert.deepEqual(operations, ["audio:french-wav", "audio:japanese-wav"]);
  operations.length = 0;
  const paused = {
    ...reader,
    async speakFrench() {
      operations.push("fr");
      active = false;
      return true;
    },
  };
  assert.equal(await readTutor(tutor, paused, () => active), false);
  assert.deepEqual(operations, ["fr"]);
  active = true;
  operations.length = 0;
  assert.equal(
    await readTutor(
      tutor,
      {
        ...reader,
        async speakFrench() {
          return false;
        },
      },
      () => active,
    ),
    true,
  );
  assert.deepEqual(operations, ["ja:アレックスです。"]);
});

test("les formulations orales d’aide transmettent le sens voulu au lieu de poursuivre le dialogue", () => {
  for (const [text, meaning] of [
    ["Comment je peux dire que je viens de France ?", "je viens de France"],
    [
      "Comment est-ce qu’on dit en japonais : j’habite à Lyon ?",
      "j’habite à Lyon",
    ],
    ["Aide-moi à dire que je n’aime pas le café.", "je n’aime pas le café."],
    ["Tu peux m’aider à répondre : je voudrais un thé ?", "je voudrais un thé"],
    ["Je voudrais répondre que j’ai deux billets.", "j’ai deux billets."],
    ["Comment je dis cette phrase ?", null],
  ] as const) {
    const actual = assistanceIntent(text);
    assert.deepEqual(
      actual,
      meaning === null
        ? { kind: "question", action: "translate" }
        : { kind: "answer", meaning },
      text,
    );
  }
  for (const text of [
    "Tu peux m’aider à faire ma phrase ?",
    "Comment je peux répondre ?",
  ])
    assert.deepEqual(
      assistanceIntent(text),
      { kind: "answer", meaning: "" },
      text,
    );
  assert.equal(assistanceIntent("Tu aimes les films ?"), null);
});

test("une demande longue garde le métier demandé comme contenu à traduire", () => {
  assert.deepEqual(
    assistanceIntent("je ne sais pas comment dire être professeur"),
    { kind: "answer", meaning: "être professeur" },
  );
});
