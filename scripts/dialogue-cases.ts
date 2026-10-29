import type { TutorReply, turnRequestSchema } from "../shared/contracts";

export type DialogueInput = typeof turnRequestSchema._output;
export type DialogueHistory = DialogueInput["history"];
export type DialogueTurn = {
  id: string;
  text: string;
  /** Authored answer from Mochi, used only to prepare the next paired history. */
  referenceAssistant: string;
  tags: readonly string[];
  correction: "required" | "none" | "unspecified";
  correctedContains?: string;
  expectedPriceYen?: number;
  checkGreetingFollowup?: boolean;
  manualChecks: readonly string[];
};
export type DialogueCase = {
  id: string;
  scenario: DialogueInput["scenario"];
  initialHistory: DialogueHistory;
  rollout: boolean;
  serviceFacts: readonly string[];
  turns: readonly DialogueTurn[];
};

/**
 * Public, fictional text fixtures. No learner voice, personal history, live train
 * information or ASR reference. Importing this module launches no model.
 * Authored assistant lines are fixtures, not a certificate of linguistic quality.
 */
export const dialogueCases: readonly DialogueCase[] = [
  {
    id: "meet-facts",
    scenario: "meet",
    rollout: true,
    serviceFacts: [],
    initialHistory: [{ role: "assistant", content: "お名前は？" }],
    turns: [
      {
        id: "name",
        text: "えっと…アレックスです。",
        referenceAssistant: "アレックスさん、こんにちは。どこから来ましたか？",
        tags: ["greeting", "transcribed-hesitation", "fictional-name"],
        correction: "none",
        checkGreetingFollowup: true,
        manualChecks: [
          "Accepter le prénom avec hésitation et poursuivre après la salutation.",
          "Ne pas inventer une origine, un niveau ou une faute de prononciation.",
        ],
      },
      {
        id: "country",
        text: "ベルギーです。",
        referenceAssistant: "ベルギーのどの町から来ましたか？",
        tags: ["short-answer", "country-fact"],
        correction: "none",
        manualChecks: [
          "Accepter le fragment ; garder la Belgique et ne pas redemander le pays.",
        ],
      },
      {
        id: "city",
        text: "ブリュッセルから来ました。",
        referenceAssistant: "ブリュッセルですね。日本語は好きですか？",
        tags: ["city-fact", "complete-sentence"],
        correction: "none",
        manualChecks: [
          "Conserver Bruxelles et le prénom sans transformer une information donnée.",
          "Une relance courte doit être cohérente avec une nouvelle connaissance.",
        ],
      },
      {
        id: "unexpected-question",
        text: "モチさんもベルギーから来ましたか？",
        referenceAssistant: "私はAIです。日本語で何を話したいですか？",
        tags: ["unexpected-question", "assistant-identity"],
        correction: "none",
        manualChecks: [
          "Répondre à la question avant de relancer, sans biographie humaine inventée pour Mochi.",
          "La réponse ne doit pas attribuer à l’élève les origines de Mochi.",
        ],
      },
    ],
  },
  {
    id: "cafe-change",
    scenario: "cafe",
    rollout: true,
    serviceFacts: ["Fiction de test uniquement : le thé coûte 350 yens."],
    initialHistory: [
      {
        role: "assistant",
        content: "練習のカフェです。お茶は三百五十円です。何にしますか？",
      },
    ],
    turns: [
      {
        id: "first-order",
        text: "コーヒーを一つください。",
        referenceAssistant:
          "コーヒーを一つですね。ホットですか、アイスですか？",
        tags: ["order", "quantity"],
        correction: "none",
        manualChecks: [
          "Mochi prend la commande : elle ne commande pas elle-même au client.",
          "Conserver un café, sans demander au client le prix de la boisson.",
        ],
      },
      {
        id: "replace-order",
        text: "やっぱり、コーヒーじゃなくて、お茶を一つください。",
        referenceAssistant: "お茶を一つですね。ホットですか、アイスですか？",
        tags: ["changed-order", "negated-old-choice"],
        correction: "none",
        manualChecks: [
          "Remplacer le café par un thé et conserver la quantité un.",
          "La négation du café ne devient ni préférence positive ni faute persistante.",
        ],
      },
      {
        id: "temperature-fragment",
        text: "ホットで。",
        referenceAssistant: "温かいお茶を一つですね。ほかに何かいりますか？",
        tags: ["short-answer", "temperature", "retained-order"],
        correction: "none",
        manualChecks: [
          "Rattacher chaud à la nouvelle commande de thé, pas à l’ancien café.",
          "Ne pas corriger le fragment naturel en imposant une formule plus longue.",
        ],
      },
      {
        id: "known-price",
        text: "このお茶はいくらですか？",
        referenceAssistant: "三百五十円です。ほかに何かいりますか？",
        tags: [
          "unexpected-question",
          "known-service-fact",
          "translation-number",
        ],
        correction: "none",
        expectedPriceYen: 350,
        manualChecks: [
          "Répondre au prix déjà donné, sans demander au client de le fournir.",
          "La traduction doit conserver 350 yens ; ne pas inventer un nouveau tarif.",
        ],
      },
    ],
  },
  {
    id: "station-service",
    scenario: "station",
    rollout: true,
    serviceFacts: [
      "Fiction de test uniquement : le train pour Kyoto part de la voie 3.",
      "Aucune gare, date ni information de voyage réelle n’est évaluée.",
    ],
    initialHistory: [
      {
        role: "assistant",
        content: "練習の駅です。京都行きは三番線です。どちらまでですか？",
      },
    ],
    turns: [
      {
        id: "destination",
        text: "京都までお願いします。",
        referenceAssistant: "京都までですね。片道ですか、往復ですか？",
        tags: ["destination", "service-role"],
        correction: "none",
        manualChecks: [
          "Mochi aide le voyageur ; elle ne lui demande pas de connaître le quai.",
          "Conserver Kyoto et demander seulement une information que le client doit fournir.",
        ],
      },
      {
        id: "one-way",
        text: "片道です。",
        referenceAssistant: "片道ですね。何枚いりますか？",
        tags: ["short-answer", "ticket-choice"],
        correction: "none",
        manualChecks: [
          "Conserver l’aller simple et Kyoto sans inventer horaire, tarif ou besoin de retour.",
        ],
      },
      {
        id: "two-tickets",
        text: "二枚です。",
        referenceAssistant: "京都まで片道で二枚ですね。ほかに何かありますか？",
        tags: ["short-answer", "quantity", "retained-destination"],
        correction: "none",
        manualChecks: [
          "Rattacher deux aux billets aller simple pour Kyoto, sans modifier le nombre.",
        ],
      },
      {
        id: "known-platform",
        text: "どのホームですか？",
        referenceAssistant: "三番線です。ほかに何かありますか？",
        tags: [
          "unexpected-question",
          "known-service-fact",
          "translation-number",
        ],
        correction: "none",
        manualChecks: [
          "Répondre voie 3 à partir de la fiction déjà donnée ; ne pas renvoyer la question au voyageur.",
          "Ne pas présenter ce quai comme une information de voyage actuelle.",
        ],
      },
    ],
  },
  {
    id: "repair-and-repeat",
    scenario: "meet",
    rollout: true,
    serviceFacts: [],
    initialHistory: [{ role: "assistant", content: "どこから来ましたか？" }],
    turns: [
      {
        id: "particle-error",
        text: "私はベルギーを来ました。",
        referenceAssistant:
          "Pour dire d’où tu viens, utilise kara après le pays. 私はベルギーから来ました。",
        tags: ["deliberate-particle-error", "correction-required"],
        correction: "required",
        correctedContains: "ベルギーから来ました",
        manualChecks: [
          "Corriger o en kara sans changer la Belgique, le sujet ou le temps.",
          "Conserver une explication courte et ne rien déduire sur la prononciation.",
        ],
      },
      {
        id: "successful-repair",
        text: "私はベルギーから来ました。",
        referenceAssistant: "ベルギーのどの町から来ましたか？",
        tags: ["repair", "no-repeat-correction"],
        correction: "none",
        manualChecks: [
          "Accepter la réparation et poursuivre sans refaire la même correction.",
          "Ne pas déclarer une maîtrise ou un rappel espacé réussi après cette répétition.",
        ],
      },
      {
        id: "repeat-help",
        text: "Tu peux répéter la question, s’il te plaît ?",
        referenceAssistant: "ベルギーのどの町から来ましたか？",
        tags: ["french-help", "repeat-intent"],
        correction: "none",
        manualChecks: [
          "Répéter la question réellement posée dans cet historique, sans changer de sujet.",
          "La demande d’aide ne produit ni faute fictive ni succès autonome mémorisé.",
        ],
      },
      {
        id: "city-fragment",
        text: "ブリュッセルです。",
        referenceAssistant: "ブリュッセルですね。日本語は好きですか？",
        tags: ["short-answer", "city-fact", "continuity-after-help"],
        correction: "none",
        manualChecks: [
          "Accepter Bruxelles comme réponse courte à la question répétée et continuer naturellement.",
        ],
      },
    ],
  },
  {
    id: "help-and-preferences",
    scenario: "free",
    rollout: false,
    serviceFacts: [],
    initialHistory: [{ role: "assistant", content: "何が好きですか？" }],
    turns: [
      {
        id: "ask-for-help",
        text: "Je ne sais pas. Aide-moi à répondre.",
        referenceAssistant:
          "Tu peux dire ce que tu aimes avec ga suki desu. 日本語が好きです。",
        tags: ["french-help", "unknown-answer"],
        correction: "none",
        manualChecks: [
          "Donner un modèle utilisable pour la question actuelle, sans inventer les goûts de l’élève comme un fait.",
          "Distinguer une proposition assistée d’une réponse personnelle déjà donnée.",
        ],
      },
      {
        id: "assisted-response",
        text: "日本語が好きです。",
        referenceAssistant:
          "日本語が好きなんですね。どんな飲み物が好きですか？",
        tags: ["assisted-repetition", "acceptable-answer"],
        correction: "none",
        manualChecks: [
          "Accepter la phrase sans crédit de rappel autonome ou affirmation de maîtrise.",
          "Ne pas répéter automatiquement l’exemple comme s’il s’agissait d’une nouvelle correction.",
        ],
      },
      {
        id: "self-correction",
        text: "えっと…コーヒー…じゃなくて、お茶が好きです。",
        referenceAssistant: "お茶が好きなんですね。温かいお茶は好きですか？",
        tags: [
          "transcribed-hesitation",
          "self-correction",
          "negated-old-choice",
        ],
        correction: "none",
        manualChecks: [
          "Retenir le thé, sans corriger le faux départ abandonné ni supprimer l’autocorrection.",
        ],
      },
      {
        id: "negative-intention",
        text: "Comment on dit : je n’aime pas le café ?",
        referenceAssistant:
          "Pour dire que tu n’aimes pas le café : コーヒーは好きではありません。",
        tags: ["french-help", "unexpected-question", "translation-negation"],
        correction: "none",
        manualChecks: [
          "Exprimer la négation demandée, sans transformer le modèle en goût personnel déjà affirmé.",
          "Vérifier la même polarité et le même café dans le japonais et sa traduction française.",
        ],
      },
    ],
  },
];

/** Histories for paired replay are authored once and independent of every model. */
export function pairedDialogueInput(
  dialogue: DialogueCase,
  turnIndex: number,
): DialogueInput {
  const turn = dialogue.turns[turnIndex];
  if (!turn) throw new Error("invalid_dialogue_turn");
  const history: DialogueHistory = dialogue.initialHistory.map((item) => ({
    ...item,
  }));
  for (const previous of dialogue.turns.slice(0, turnIndex))
    history.push(
      { role: "user", content: previous.text },
      { role: "assistant", content: previous.referenceAssistant },
    );
  return {
    scenario: dialogue.scenario,
    text: turn.text,
    history: history.slice(-12),
  };
}

/** Matches the lab's ephemeral transcript: French translation is not a new turn. */
export function appendDialogueHistory(
  history: DialogueHistory,
  text: string,
  tutor: TutorReply,
): DialogueHistory {
  return [
    ...history,
    { role: "user" as const, content: text },
    {
      role: "assistant" as const,
      content: [tutor.coaching, tutor.reply.japanese]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000),
    },
  ].slice(-12);
}
