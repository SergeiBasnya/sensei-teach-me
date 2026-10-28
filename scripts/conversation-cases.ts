import { reviewQuestion, reviewCoaching } from "../shared/learning-memory";
import type { turnRequestSchema } from "../shared/contracts";

export type ConversationCase = {
  id: string;
  label: string;
  body: typeof turnRequestSchema._output;
  /** Conditions to prepare manually; sending the body alone does not test memory. */
  setup?: readonly string[];
  /** Human observations, never an automatic pedagogical score. */
  manualChecks: readonly string[];
};

const originQuestion = "どこから来ましたか？";
const originModel = {
  japanese: "フランスから来ました。",
  romaji: "Furansu kara kimashita.",
  french: "Je viens de France.",
};
const originTarget = {
  id: "skill:origin",
  skill: "origin" as const,
  reference: originModel,
  explanation:
    "Pour dire d’où tu viens, utilise kara après le pays ou la ville.",
};

const reviewInstruction = `${reviewCoaching(originTarget)}\n${reviewQuestion().japanese}`;
/**
 * Text-only cases: importing this module starts no model and sends no request.
 * Validate bodies with turnRequestSchema before an opt-in evaluation. Read the
 * actual Japanese, French, coaching and corrections together; schema validity
 * does not prove teaching quality. Human audio and Android checks remain separate.
 */
export const conversationCases: readonly ConversationCase[] = [
  {
    id: "origin-fragment",
    label: "Une réponse courte donne le pays",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: originQuestion }],
      text: "フランスです。",
    },
    manualChecks: [
      "Accepter la réponse courte sans la présenter comme une faute grammaticale.",
      "Conserver la France comme information donnée et poursuivre sans redemander le pays.",
      "Si kara est enseigné ensuite, le présenter comme une construction utile, sans prétendre qu’elle a déjà été démontrée.",
    ],
  },
  {
    id: "likes-short",
    label: "Une réponse familière reste naturelle",
    body: {
      scenario: "meet",
      lessonId: "meet-likes",
      history: [{ role: "assistant", content: "日本語は好きですか？" }],
      text: "うん、好き。",
    },
    manualChecks: [
      "Accepter la réponse familière et le sujet omis, sans imposer une phrase complète ou une autre politesse.",
      "Continuer sur les goûts de l’élève avec au plus une petite question.",
      "Ne pas déclarer la construction ga suki acquise sur cette seule réponse.",
    ],
  },
  {
    id: "origin-error",
    label: "Une faute claire de particule reçoit une correction minimale",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: originQuestion }],
      text: "私はフランスを来ました。",
    },
    manualChecks: [
      "Corriger la particule en kara sans changer le pays ou le sens de la phrase.",
      "Donner une explication française courte de la construction correcte, sans jugement de prononciation.",
      "Vérifier que le modèle japonais, sa lecture, sa traduction et la correction désignent la même phrase.",
      "Dans l’app, vérifier que la correction est mémorisée une fois et que sa répétition immédiate ne crédite pas un rappel espacé.",
    ],
  },
  {
    id: "origin-self-correction",
    label: "L’élève se corrige pendant sa réponse",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: originQuestion }],
      text: "ええと、フランスを…いや、フランスから来ました。",
    },
    manualChecks: [
      "Reconnaître l’autocorrection finale et ne pas imposer la correction de la première tentative abandonnée.",
      "Conserver le fait donné et poursuivre sur le même sujet.",
      "Ne pas ajouter une erreur persistante pour l’hésitation ou le faux départ seuls.",
    ],
  },
  {
    id: "cafe-change",
    label: "L’élève change de boisson pendant la commande",
    body: {
      scenario: "cafe",
      lessonId: "cafe-order",
      history: [
        { role: "user", content: "コーヒーをください。" },
        {
          role: "assistant",
          content: "コーヒーですね。ホットですか、アイスですか？",
        },
      ],
      text: "やっぱりコーヒーじゃなくて、お茶をください。",
    },
    manualChecks: [
      "Prendre en compte le remplacement du café par le thé et garder cette nouvelle commande dans la suite.",
      "Ne pas corriger une formulation acceptable ni revenir automatiquement au modèle de commande du café.",
      "Vérifier que la traduction française reflète la réponse japonaise et ne réintroduit pas l’ancien choix.",
    ],
  },
  {
    id: "repeat",
    label: "Répéter la question en japonais",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: originQuestion }],
      text: "もう一度お願いします。",
    },
    manualChecks: [
      "Répéter la question actuelle, sans fournir à sa place une réponse modèle de l’élève.",
      "Ne pas changer de sujet ni considérer la demande comme une réponse à l’objectif.",
      "Ne pas inventer de faute ou créditer un rappel réussi.",
    ],
  },
  {
    id: "repeat-french",
    label: "Répéter plus lentement à la demande de l’élève",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: originQuestion }],
      text: "Tu peux répéter la question plus lentement ?",
    },
    manualChecks: [
      "Rester sur la question actuelle et ne pas substituer une phrase à apprendre comme réponse.",
      "Distinguer une reformulation textuelle d’un véritable ralentissement audio ; vérifier ce dernier à l’écoute dans l’app.",
      "Ne pas promettre une variation de vitesse qui n’a pas été appliquée.",
    ],
  },
  {
    id: "translate-question",
    label: "Comprendre le sens de la question",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: originQuestion }],
      text: "Traduis la question en français, s’il te plaît.",
    },
    manualChecks: [
      "Expliquer en français que Mochi demande d’où vient l’élève.",
      "Traduire la question existante, sans traduire littéralement l’ordre français comme une nouvelle réplique japonaise.",
      "Ne pas inventer le pays de l’élève et ne pas prétendre que l’objectif est rempli.",
    ],
  },
  {
    id: "translate-intention",
    label: "Aider à exprimer une intention personnelle",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [{ role: "assistant", content: "どこに住んでいますか？" }],
      text: "Comment on dit : j’habite à Lyon ?",
    },
    manualChecks: [
      "Fournir une phrase japonaise naturelle pour dire que l’élève habite à Lyon.",
      "Ne pas ajouter un prénom, une origine ou une information sur Mochi.",
      "Présenter cette réponse comme un modèle assisté à essayer, sans crédit de rappel indépendant.",
    ],
  },
  {
    id: "explain-kara",
    label: "Une demande d’explication garde son objet",
    body: {
      scenario: "meet",
      lessonId: "meet-origin",
      history: [
        { role: "assistant", content: originQuestion },
        { role: "user", content: "Je ne sais pas." },
        {
          role: "assistant",
          content:
            "Pour dire d’où tu viens, utilise kara après le pays. フランスから来ました。",
        },
      ],
      text: "Pourquoi tu utilises kara ?",
    },
    manualChecks: [
      "Expliquer brièvement en français que kara indique ici la provenance, avec un exemple adapté au débutant.",
      "Répondre à l’explication demandée sans lancer une nouvelle question sans rapport.",
      "Ne pas transformer la question de l’élève en faute de japonais ou en rappel réussi.",
    ],
  },
  {
    id: "review-help",
    label: "Une demande d’aide pendant une révision révèle un modèle",
    setup: [
      "Ouvrir une révision de skill:origin à échéance, sans avoir consulté le modèle dans cette séance.",
      "Relever avant le test les compteurs de rappels réussis et l’échéance pour pouvoir les comparer après.",
    ],
    body: {
      scenario: "meet",
      history: [{ role: "assistant", content: reviewInstruction }],
      text: "Je ne sais pas, aide-moi.",
      review: { target: originTarget, assisted: false },
    },
    manualChecks: [
      "Donner un modèle utilisable et identifier l’événement comme helped, sans faute inventée.",
      "Dans l’app, vérifier que l’exposition du modèle empêche le crédit d’un rappel indépendant immédiat.",
    ],
  },
  {
    id: "review-assisted",
    label: "Une répétition juste après le modèle reste un entraînement",
    setup: [
      "Utiliser la même révision après affichage ou lecture du modèle dans la séance ; l’état local doit aussi enregistrer cette aide.",
    ],
    body: {
      scenario: "meet",
      history: [
        { role: "assistant", content: reviewInstruction },
        { role: "user", content: "Je ne sais pas." },
        {
          role: "assistant",
          content: `Écoute, puis essaie à ton tour. ${originModel.japanese}`,
        },
      ],
      text: originModel.japanese,
      review: { target: originTarget, assisted: true },
    },
    manualChecks: [
      "Accepter la phrase correcte en distinguant explicitement la répétition assistée d’un rappel sans modèle.",
      "Dans la mémoire locale, ne pas augmenter successes ni la boîte de rappel pour cette répétition.",
      "Ne pas conclure que la compétence est acquise après cette seule réussite.",
    ],
  },
  {
    id: "review-independent",
    label: "Un rappel indépendant accepte une autre information personnelle",
    setup: [
      "Dans un profil de test, préparer skill:origin à échéance, au moins 24 heures après la dernière exposition du modèle, sans crédit ce jour-là.",
      "Démarrer une nouvelle séance sans consulter de réponse, d’indice ou de modèle.",
    ],
    body: {
      scenario: "meet",
      history: [{ role: "assistant", content: reviewInstruction }],
      text: "ベルギーから来ました。",
      review: { target: originTarget, assisted: false },
    },
    manualChecks: [
      "Accepter la Belgique et la construction kara sans exiger le pays de la référence française.",
      "Identifier la réponse comme correct, sans attribuer de jugement de prononciation.",
      "Dans l’app et avec les conditions préalables remplies, créditer au plus un rappel pour cette séance et avancer l’échéance.",
      "Distinguer ce résultat ponctuel d’une preuve de maîtrise durable ou d’un niveau JLPT.",
    ],
  },
  {
    id: "review-fragment-not-shown",
    label: "Un fragment acceptable ne démontre pas la particule révisée",
    body: {
      scenario: "meet",
      history: [{ role: "assistant", content: reviewInstruction }],
      text: "フランスです。",
      review: { target: originTarget, assisted: false },
    },
    manualChecks: [
      "Distinguer not_shown d’une faute grammaticale : le fragment répond naturellement mais ne montre pas la construction kara.",
      "Aider à construire une phrase avec la provenance, sans enregistrer le fragment comme une nouvelle faute.",
      "Ne pas créditer de rappel indépendant de la particule visée.",
    ],
  },
];
