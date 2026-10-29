import type { DialogueCase } from "./dialogue-cases";

/**
 * Twelve new, fictional turns kept separate from the twenty latency replays.
 * No recording, ASR reference or model launch. The authored continuations are
 * fixtures for paired history; rollout mode must keep the model's own replies.
 * These examples require a contextual language review, not a keyword score.
 */
export const stabilizationCases: readonly DialogueCase[] = [
  {
    id: "station-change-destination",
    scenario: "station",
    rollout: true,
    serviceFacts: [
      "Fiction uniquement : le train pour Osaka part de la voie 5.",
      "Aucun tarif, horaire ou quai réel n’est fourni ou évalué.",
    ],
    initialHistory: [
      {
        role: "assistant",
        content: "練習の駅です。大阪行きは五番線です。どこまでですか？",
      },
    ],
    turns: [
      {
        id: "complete-ticket-request",
        text: "京都まで、片道で二枚お願いします。",
        referenceAssistant: "京都まで、片道で二枚ですね。",
        tags: ["destination", "quantity", "ticket-choice", "service-role"],
        correction: "none",
        manualChecks: [
          "Confirmer Kyoto, aller simple et deux billets, sans redemander une quantité connue.",
          "Ne pas transformer la demande de billets en une question sur les billets possédés.",
          "Une confirmation complète est une réponse utile ; aucune relance artificielle n’est exigée.",
        ],
      },
      {
        id: "replace-destination",
        text: "あ、京都じゃなくて、大阪までお願いします。",
        referenceAssistant: "大阪まで、片道で二枚ですね。",
        tags: ["self-correction", "changed-destination", "negated-old-choice"],
        correction: "none",
        manualChecks: [
          "Remplacer Kyoto par Osaka tout en conservant aller simple et deux billets.",
          "La traduction doit porter le changement de destination, sans ajouter un retour ou une troisième personne.",
        ],
      },
      {
        id: "replace-ticket-count",
        text: "二枚じゃなくて、一枚です。",
        referenceAssistant: "大阪まで、片道で一枚ですね。",
        tags: ["short-answer", "quantity", "self-correction", "negation"],
        correction: "none",
        manualChecks: [
          "La quantité finale est un billet, pas deux ou trois ; Osaka et aller simple restent connus.",
          "Ne pas corriger un fragment qui répond au contexte ou réintroduire le choix abandonné.",
        ],
      },
      {
        id: "osaka-platform",
        text: "何番線ですか？",
        referenceAssistant: "五番線です。",
        tags: [
          "unexpected-question",
          "known-service-fact",
          "translation-number",
        ],
        correction: "none",
        manualChecks: [
          "Donner la voie 5 déjà annoncée pour Osaka et ne pas demander au voyageur de la fournir.",
          "La traduction parle de la voie, pas d’une gare ou de la cinquième destination.",
          "La valeur reste une donnée fictive du test ; aucune information de voyage réelle n’est prétendue.",
        ],
      },
    ],
  },
  {
    id: "restaurant-tea-count",
    scenario: "cafe",
    rollout: true,
    serviceFacts: [
      "Fiction uniquement : un thé noir coûte 400 yens, prix unitaire.",
      "Le scénario café sert aussi la pratique de commande de boisson au restaurant.",
    ],
    initialHistory: [
      {
        role: "assistant",
        content: "練習の店です。紅茶は一つ四百円です。何にしますか？",
      },
    ],
    turns: [
      {
        id: "two-black-teas",
        text: "紅茶を二つください。",
        referenceAssistant: "紅茶を二つですね。ホットですか、アイスですか？",
        tags: ["order", "quantity", "service-role"],
        correction: "none",
        manualChecks: [
          "Mochi reçoit une commande de deux thés noirs ; elle ne commande pas à son tour.",
          "Ne pas transformer 400 yens par unité en un total annoncé sans demande.",
        ],
      },
      {
        id: "iced-fragment",
        text: "アイスで。",
        referenceAssistant: "アイスの紅茶を二つですね。",
        tags: ["short-answer", "temperature", "retained-order"],
        correction: "none",
        manualChecks: [
          "Accepter le fragment naturel après le choix chaud/glacé sans lui imposer une phrase plus longue.",
          "Conserver deux thés noirs glacés, pas du café ni une glace alimentaire.",
          "Le français doit rendre le choix glacé de la boisson avec le même locuteur.",
        ],
      },
      {
        id: "one-instead-of-two",
        text: "二つじゃなくて、一つでお願いします。",
        referenceAssistant: "アイスの紅茶を一つですね。",
        tags: ["changed-order", "quantity", "negated-old-choice"],
        correction: "none",
        manualChecks: [
          "Remplacer la quantité deux par un tout en gardant thé noir glacé.",
          "La correction ne doit pas cibler le faux départ abandonné ni traiter la négation comme une erreur.",
        ],
      },
      {
        id: "unit-price",
        text: "紅茶はいくらですか？",
        referenceAssistant: "一つ四百円です。",
        tags: ["known-service-fact", "translation-number", "retained-order"],
        correction: "none",
        expectedPriceYen: 400,
        manualChecks: [
          "Répondre 400 yens, prix unitaire connu ; ne pas conserver 800 yens après le changement à une unité.",
          "Le japonais et le français donnent le même montant et le même périmètre unitaire.",
          "Un marqueur de montant ne démontre pas à lui seul que toute la traduction est fidèle.",
        ],
      },
    ],
  },
  {
    id: "restaurant-repair-help",
    scenario: "cafe",
    rollout: true,
    serviceFacts: [
      "Restaurant fictif ; aucun menu, stock ou tarif réel n’est inventé.",
    ],
    initialHistory: [
      {
        role: "assistant",
        content: "練習のレストランです。何を飲みますか？",
      },
    ],
    turns: [
      {
        id: "self-repaired-water-count",
        text: "水を二つ、いえ、一つください。",
        referenceAssistant: "水を一つですね。",
        tags: [
          "order",
          "quantity",
          "self-correction",
          "transcribed-hesitation",
        ],
        correction: "none",
        manualChecks: [
          "Retenir une eau après l’autocorrection, sans corriger ou mémoriser le premier nombre abandonné.",
          "Ne pas demander une température chaud/glacé par automatisme sur une commande d’eau.",
        ],
      },
      {
        id: "negative-beer-choice",
        text: "ビールは飲みません。水で。",
        referenceAssistant: "水ですね。",
        tags: ["short-answer", "negation", "retained-order"],
        correction: "none",
        manualChecks: [
          "Garder l’eau et la quantité un ; la bière niée ne remplace pas la commande.",
          "Accepter la réponse elliptique ; ne pas diagnostiquer une faute du seul fait qu’elle est courte.",
          "Si la négation est traduite, conserver son sens sans ajouter de pronom objet aberrant.",
        ],
      },
      {
        id: "ask-for-bill-model",
        text: "Comment je demande l’addition ?",
        referenceAssistant: "Pour demander l’addition : お会計をお願いします。",
        tags: ["french-help", "unexpected-question", "unknown-answer"],
        correction: "none",
        manualChecks: [
          "Donner un modèle simple de demande d’addition, sans corriger le français ou demander au client d’expliquer la formule.",
          "Le modèle est une aide, pas une commande personnelle déjà accomplie ni une règle grammaticale vérifiée par défaut.",
          "Revoir l’équivalence de la demande d’addition et de sa traduction dans cette situation.",
        ],
      },
      {
        id: "assisted-bill-request",
        text: "お会計をお願いします。",
        referenceAssistant: "はい。",
        tags: ["assisted-repetition", "acceptable-answer", "service-role"],
        correction: "none",
        manualChecks: [
          "Accepter la demande aidée sans crédit de maîtrise, mémorisation d’erreur ni nouvelle correction de politesse.",
          "Mochi reste dans le rôle de service ; elle ne demande pas l’addition au client.",
          "Ne pas inventer un montant pour clore la scène si aucun tarif n’a été donné.",
        ],
      },
    ],
  },
];
