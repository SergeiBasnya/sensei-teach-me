import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { turnRequestSchema, type TutorReply } from "../shared/contracts";
import { pcmWav } from "../server/voice-lab-samples";
import {
  dialogueCases,
  pairedDialogueInput,
  appendDialogueHistory,
} from "../scripts/dialogue-cases";
import {
  DIALOGUE_PROFILES,
  dialogueInputHash,
  dialogueResponsePath,
  dialoguePlan,
  estimateListeningGate,
  inspectDialogueReply,
  japaneseWaveDurationMs,
  numericSummary,
  privateDialogueOutput,
  rotateProfiles,
} from "../scripts/benchmark-voice-dialogue";

const baseTutor: TutorReply = {
  reply: {
    japanese: "三百五十円です。",
    romaji: "Sanbyaku gojū en desu.",
    french: "Cela fait 350 yens.",
  },
  correction: null,
  vocabulary: [],
};

test("le plan borné contient20 entrées multitoures appariées et4 chaînes réellement générées", () => {
  assert.equal(dialogueCases.length, 5);
  assert.equal(
    dialogueCases.reduce((sum, item) => sum + item.turns.length, 0),
    20,
  );
  assert.equal(new Set(dialogueCases.map((item) => item.id)).size, 5);
  for (const item of dialogueCases)
    for (const [index] of item.turns.entries()) {
      const input = turnRequestSchema.parse(pairedDialogueInput(item, index));
      assert.equal(
        input.history.length,
        item.initialHistory.length + index * 2,
      );
      assert.equal(input.history.at(-1)?.role, "assistant");
    }
  const plan = dialoguePlan([]);
  assert.equal(plan.pairedResponses, 60);
  assert.equal(plan.rolloutResponses, 48);
  assert.equal(plan.pairedResponses + plan.rolloutResponses, 108);
  const tags = new Set(
    dialogueCases.flatMap((item) => item.turns.flatMap((turn) => turn.tags)),
  );
  for (const tag of [
    "changed-order",
    "unexpected-question",
    "transcribed-hesitation",
    "deliberate-particle-error",
    "repair",
    "french-help",
    "short-answer",
    "self-correction",
  ])
    assert.ok(tags.has(tag), tag);
});

test("l’historique apparié ne dépend jamais d’une réponse de profil ni d’une mutation précédente", () => {
  const item = dialogueCases[1]!;
  const first = pairedDialogueInput(item, 2);
  const hash = dialogueInputHash(first);
  const other = pairedDialogueInput(item, 2);
  first.history[0]!.content = "MUTATED MODEL HISTORY";
  assert.equal(dialogueInputHash(other), hash);
  assert.equal(dialogueInputHash(pairedDialogueInput(item, 2)), hash);
  assert.equal(
    other.history.at(-1)?.content,
    item.turns[1]!.referenceAssistant,
  );
});

test("un rollout utilise le japonais et le conseil réellement émis, pas le corrigé de fixture ni la traduction", () => {
  const initial = [
    { role: "assistant" as const, content: "Première question" },
  ];
  const actual = {
    ...baseTutor,
    coaching: "Conseil contrôlé",
    reply: {
      ...baseTutor.reply,
      japanese: "実際の返答です。",
      french: "Une traduction privée du tour.",
    },
  };
  const updated = appendDialogueHistory(initial, "Entrée rédigée", actual);
  assert.equal(updated.at(-1)?.content, "Conseil contrôlé\n実際の返答です。");
  assert.equal(JSON.stringify(updated).includes(actual.reply.french), false);
  assert.equal(initial.length, 1);
  let history = initial as Parameters<typeof appendDialogueHistory>[0];
  for (let index = 0; index < 10; index++)
    history = appendDialogueHistory(history, "入力", actual);
  assert.equal(history.length, 12);
});

test("les filtres de pilote restent bornés au corpus et refusent les combinaisons contradictoires", () => {
  assert.equal(
    dialoguePlan([
      "--paired-only",
      "--profiles=ja-first",
      "--case=station-service",
    ]).pairedResponses,
    4,
  );
});

test("les plans invalides ne deviennent jamais une nouvelle entrée de modèle", () => {
  for (const args of [
    ["--case=unknown"],
    ["--profiles=new-model"],
    ["--profiles=ja-first,ja-first"],
    ["--paired-only", "--rollout-only"],
    ["--rollout-only", "--case=help-and-preferences"],
  ])
    assert.throws(() => dialoguePlan(args));
  assert.deepEqual(rotateProfiles(DIALOGUE_PROFILES, 1), [
    "compact",
    "ja-first",
    "structured",
  ]);
  assert.equal(numericSummary([]).medianMs, null);
  assert.equal(numericSummary([8, 2, 4, 6]).medianMs, 5);
});

test("la durée WAV vient des octets PCM complets, pas de la longueur du texte", () => {
  const wav = pcmWav(Buffer.alloc(32000));
  assert.equal(japaneseWaveDurationMs(wav), 1000);
  assert.equal(japaneseWaveDurationMs(pcmWav(Buffer.alloc(6400))), 200);
  assert.throws(() => japaneseWaveDurationMs(wav.subarray(0, wav.length - 1)));
  const corrupt = Buffer.from(wav);
  corrupt.write("RIFX", 0);
  assert.throws(() => japaneseWaveDurationMs(corrupt));
  assert.throws(() => japaneseWaveDurationMs(Buffer.alloc(44)));
});

test("la file idéale de lecture distingue dernier WAV et attente secondaire sans prétendre mesurer Android", () => {
  assert.deepEqual(estimateListeningGate([], 100), {
    lastWaveEndMs: null,
    listeningGateMs: null,
    holdAfterLastWaveMs: null,
  });
  assert.deepEqual(
    estimateListeningGate(
      [
        { elapsedMs: 10, durationMs: 100 },
        { elapsedMs: 200, durationMs: 50 },
      ],
      180,
    ),
    { lastWaveEndMs: 250, listeningGateMs: 250, holdAfterLastWaveMs: 0 },
  );
  assert.deepEqual(
    estimateListeningGate([{ elapsedMs: 10, durationMs: 200 }], 300),
    { lastWaveEndMs: 210, listeningGateMs: 300, holdAfterLastWaveMs: 90 },
  );
});

test("les signaux de rôle et de salutation ne sont pas des verdicts linguistiques", () => {
  const station = dialogueCases.find((item) => item.id === "station-service")!;
  const warnings = inspectDialogueReply(station, station.turns[0]!, {
    ...baseTutor,
    reply: { ...baseTutor.reply, japanese: "どのホームですか？" },
  });
  assert.equal(
    warnings.find((check) => check.id === "station-role-question")?.status,
    "flag",
  );
  assert.equal(
    warnings.find((check) => check.id === "station-role-question")?.kind,
    "lexical-signal",
  );
  const greeting = dialogueCases[0]!;
  assert.equal(
    inspectDialogueReply(greeting, greeting.turns[0]!, {
      ...baseTutor,
      reply: { ...baseTutor.reply, japanese: "こんにちは。" },
    }).find((check) => check.id === "greeting-without-explicit-followup")
      ?.status,
    "flag",
  );
});

test("correction manquante et traduction manquante gardent des contrôles séparés", () => {
  const repair = dialogueCases.find((item) => item.id === "repair-and-repeat")!;
  const missing = inspectDialogueReply(repair, repair.turns[0]!, {
    ...baseTutor,
    reply: { ...baseTutor.reply, french: "" },
  });
  assert.equal(
    missing.find((check) => check.id === "expected-correction")?.status,
    "flag",
  );
  assert.equal(
    missing.find((check) => check.id === "translation-available")?.status,
    "flag",
  );
  const cafe = dialogueCases[1]!;
  const price = inspectDialogueReply(cafe, cafe.turns[3]!, baseTutor);
  assert.equal(
    price.find((check) => check.id === "known-price")?.status,
    "pass",
  );
  assert.equal(
    price.find((check) => check.id === "price-translation")?.status,
    "pass",
  );
});

test("une sortie publique ou existante est refusée sans écrire ni effacer de données", () => {
  assert.throws(() =>
    privateDialogueOutput(resolve("docs/new-benchmark-result.json")),
  );
  assert.throws(() => privateDialogueOutput(resolve("README.md")));
  const folder = mkdtempSync(resolve(tmpdir(), "sensei-dialogue-check-"));
  try {
    const path = resolve(folder, "new.json");
    assert.doesNotThrow(() => privateDialogueOutput(path));
    writeFileSync(path, "{}");
    assert.throws(() => privateDialogueOutput(path));
  } finally {
    rmSync(folder, { recursive: true });
  }
});

test("les aides communes rapides et les corrections ne rejoignent pas le groupe de génération", () => {
  assert.equal(dialogueResponsePath(baseTutor, 1), "generated");
  assert.equal(dialogueResponsePath(baseTutor, 1, true), "controlled");
  assert.equal(dialogueResponsePath(baseTutor, 0), "shared-response");
  assert.equal(
    dialogueResponsePath({ ...baseTutor, assisted: true, practice: true }, 1),
    "assisted",
  );
  assert.equal(
    dialogueResponsePath({ ...baseTutor, practice: true }, 1),
    "practice",
  );
  assert.equal(dialogueResponsePath(null, 1), "no-tutor");
  const correction = {
    original: "私はベルギーを来ました。",
    corrected: "私はベルギーから来ました。",
    romaji: "Watashi wa Berugī kara kimashita.",
    french: "Je viens de Belgique.",
    explanation: "Utilise kara après le pays.",
  };
  assert.equal(
    dialogueResponsePath({ ...baseTutor, correction, assisted: true }, 1),
    "correction",
  );
});

test("le corpus inédit est borné et un montant français différent ne passe pas pour 400 yens", () => {
  const plan = dialoguePlan([
    "--suite=stabilization",
    "--rollout-only",
    "--profiles=structured,ja-first",
  ]);
  assert.equal(plan.cases.length, 3);
  assert.equal(plan.rolloutResponses, 24);
  assert.equal(plan.pairedResponses, 0);
  assert.throws(() => dialoguePlan(["--suite=inconnue"]));
  const item = plan.cases.find((value) => value.id === "restaurant-tea-count")!;
  const checks = inspectDialogueReply(item, item.turns[3]!, {
    ...baseTutor,
    reply: {
      ...baseTutor.reply,
      japanese: "一つ四百円です。",
      french: "Trois cent cinquante yens.",
    },
  });
  assert.equal(
    checks.find((value) => value.id === "known-price")?.status,
    "pass",
  );
  assert.equal(
    checks.find((value) => value.id === "price-translation")?.status,
    "flag",
  );
});

test("la question d’identité signale l’origine personnelle affirmée sans IA sans prétendre détecter toutes les biographies", () => {
  const meet = dialogueCases.find((item) => item.id === "meet-facts")!;
  const turn = meet.turns[3]!;
  const humanClaim = {
    ...baseTutor,
    reply: {
      japanese: "私は日本から来ました。",
      romaji: "Watashi wa Nihon kara kimashita.",
      french: "Je viens du Japon.",
    },
  };
  const flagged = inspectDialogueReply(meet, turn, humanClaim).find(
    (check) => check.id === "personal-origin-without-ai",
  );
  assert.equal(flagged?.status, "flag");
  assert.equal(flagged?.kind, "lexical-signal");
  const aiReply = {
    ...baseTutor,
    reply: {
      japanese: "私はAIです。ベルギーから来たわけではありません。",
      romaji: "Watashi wa AI desu.",
      french: "Je suis une intelligence artificielle.",
    },
  };
  assert.equal(
    inspectDialogueReply(meet, turn, aiReply).find(
      (check) => check.id === "personal-origin-without-ai",
    )?.status,
    "pass",
  );
  assert.equal(
    inspectDialogueReply(meet, meet.turns[0]!, humanClaim).some(
      (check) => check.id === "personal-origin-without-ai",
    ),
    false,
  );
});
