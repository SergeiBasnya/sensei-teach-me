import test from "node:test";
import assert from "node:assert/strict";
import { readHelpCoaching } from "../src/lib/tutor-playback";
import { isHelpReply, tutorFromHelp } from "../shared/teaching";
import { teachTurn, type TutorProvider } from "../server/app";

const help = {
  explanation: "Pour indiquer ton métier, termine avec desu.",
  answer: {
    japanese: "教師です。",
    romaji: "Kyōshi desu.",
    french: "Je suis professeur.",
  },
};

test("une aide lue attend la fin du français avant le modèle japonais et la reprise", async () => {
  const operations: string[] = [];
  let release!: () => void;
  const french = new Promise<void>((resolve) => (release = resolve));
  const coaching = readHelpCoaching(
    tutorFromHelp(help),
    async () => {
      operations.push("fr");
      await french;
      return true;
    },
    () => true,
  );
  const queued = coaching.then((active) => {
    if (active) operations.push("ja", "listen");
  });
  await Promise.resolve();
  assert.deepEqual(operations, ["fr"]);
  release();
  await queued;
  assert.deepEqual(operations, ["fr", "ja", "listen"]);
  let active = true;
  const paused = await readHelpCoaching(
    tutorFromHelp(help),
    async () => {
      active = false;
      return false;
    },
    () => active,
  );
  assert.equal(paused, false);
  assert.equal(
    await readHelpCoaching(
      tutorFromHelp(help),
      async () => {
        throw Error("French unavailable");
      },
      () => true,
    ),
    true,
  );
  const regular = { ...tutorFromHelp(help), practice: false };
  assert.equal(isHelpReply(regular), false);
  await readHelpCoaching(
    regular,
    async () => {
      assert.fail("ordinary conversation must not wait for French");
    },
    () => true,
  );
});

test("la demande orale longue va à l’aide et ne génère pas un tour de conversation", async () => {
  let asked = false;
  const provider: TutorProvider = {
    transcribe: async () => "",
    turn: async () => {
      assert.fail("must not continue dialogue");
    },
    help: async (input) => {
      asked = true;
      assert.equal(input.meaning, "être professeur");
      return help;
    },
  };
  const result = await teachTurn(provider, {
    scenario: "meet",
    history: [{ role: "assistant", content: "お仕事は何ですか？" }],
    text: "je ne sais pas comment dire être professeur",
  });
  assert.equal(asked, true);
  assert.equal(result.practice, true);
  assert.equal(result.correction, null);
  assert.equal(result.reply.japanese, help.answer.japanese);
});
