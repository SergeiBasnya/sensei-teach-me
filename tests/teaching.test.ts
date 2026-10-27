import test from "node:test";
import assert from "node:assert/strict";
import {
  assistanceIntent,
  teaching,
  tutorFromHelp,
  firstCoachedFollowup,
  followups,
} from "../shared/teaching";
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
test("chaque objectif enseigne une suite préparée sans répéter l’étape déjà suivie ni détourner une question", () => {
  for (const lesson of lessons) {
    const step = firstCoachedFollowup(lesson.id, [], "はい。");
    assert.ok(tutorReplySchema.safeParse(step).success);
    assert.equal(step?.coaching, followups[lesson.id].coaching);
    assert.equal(
      firstCoachedFollowup(
        lesson.id,
        [{ role: "assistant", content: followups[lesson.id].coaching }],
        "はい。",
      ),
      null,
    );
    assert.equal(firstCoachedFollowup(lesson.id, [], "お名前は？"), null);
  }
});
test("les neuf leçons ont une introduction et les demandes d’aide ne sont pas de fausses erreurs", () => {
  for (const lesson of lessons) assert.ok(teaching[lesson.id].length > 30);
  for (const text of [
    "Je ne sais pas.",
    "J’ai pas compris",
    "Je ne comprends pas",
    "わかりません。",
  ])
    assert.deepEqual(assistanceIntent(text), { meaning: "" });
  assert.deepEqual(assistanceIntent("Je veux dire : j’aime le café"), {
    meaning: "j’aime le café",
  });
  assert.equal(assistanceIntent("私はフランスから来ました。"), null);
  assert.equal(assistanceIntent("日本語が好きです。"), null);
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
    false,
  );
  assert.deepEqual(operations, []);
});
