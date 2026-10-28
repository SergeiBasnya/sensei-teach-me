import type { turnRequestSchema } from "../shared/contracts";
import { reviewCoaching, reviewQuestion } from "../shared/learning-memory";

export type LinguisticTurnRequest = typeof turnRequestSchema._output;
export type LinguisticAutomaticCheck =
  | { kind: "correction-absent" }
  | {
      kind: "literal-includes-any";
      field: "reply.japanese" | "correction.corrected";
      alternatives: readonly string[];
      /** A missing correction is judged manually, not treated as proof of accuracy. */
      onlyWhenPresent?: boolean;
    }
  | { kind: "boolean-field"; field: "practice" | "assisted"; value: boolean };

export type LinguisticContinuation = {
  body: LinguisticTurnRequest;
  /** Replace body.history with real accumulated user/assistant turns at runtime. */
  useActualHistory: true;
  precondition?: string;
  automaticChecks: readonly LinguisticAutomaticCheck[];
  manualChecks: readonly string[];
};
export type LinguisticCase = {
  id: string;
  label: string;
  kind: "acceptable" | "clear-error" | "ambiguous" | "request" | "continuity";
  body: LinguisticTurnRequest;
  automaticChecks: readonly LinguisticAutomaticCheck[];
  manualChecks: readonly string[];
  /** Authored comparison example, not an exclusive answer or human approval. */
  referenceCorrection?: { japanese: string; french: string };
  setup?: readonly string[];
  continuations?: readonly LinguisticContinuation[];
};

const noCorrection: readonly LinguisticAutomaticCheck[] = [
  { kind: "correction-absent" },
];
const fact = (
  field: "reply.japanese" | "correction.corrected",
  alternatives: readonly string[],
  onlyWhenPresent = false,
): LinguisticAutomaticCheck => ({
  kind: "literal-includes-any",
  field,
  alternatives,
  ...(onlyWhenPresent ? { onlyWhenPresent: true } : {}),
});
const ask = (
  scenario: LinguisticTurnRequest["scenario"],
  question: string,
  text: string,
  extra: Omit<
    Partial<LinguisticTurnRequest>,
    "scenario" | "history" | "text"
  > = {},
): LinguisticTurnRequest => ({
  scenario,
  history: [{ role: "assistant", content: question }],
  text,
  ...extra,
});
const next = (
  body: LinguisticTurnRequest,
  text: string,
  automaticChecks: readonly LinguisticAutomaticCheck[],
  manualChecks: readonly string[],
  options: {
    precondition?: string;
    review?: LinguisticTurnRequest["review"];
  } = {},
): LinguisticContinuation => ({
  body: {
    ...body,
    history: [],
    text,
    ...(options.review ? { review: options.review } : {}),
  },
  useActualHistory: true,
  automaticChecks,
  manualChecks,
  ...(options.precondition ? { precondition: options.precondition } : {}),
});

const originQuestion = "どこから来ましたか？";
const originTarget = {
  id: "skill:origin",
  skill: "origin" as const,
  reference: {
    japanese: "フランスから来ました。",
    romaji: "Furansu kara kimashita.",
    french: "Je viens de France.",
  },
  explanation:
    "Pour dire d’où tu viens, utilise kara après le pays ou la ville.",
};
const reviewInstruction = `${reviewCoaching(originTarget)}\n${reviewQuestion().japanese}`;
const nameBody = ask("meet", "お名前は？", "オーギュストです。", {
  lessonId: "meet-name",
});
const originBody = ask("meet", originQuestion, "ベルギーから来ました。", {
  lessonId: "meet-origin",
});
const originErrorBody = ask(
  "meet",
  originQuestion,
  "私はフランスを来ました。",
  { lessonId: "meet-origin" },
);
const likesErrorBody = ask("meet", "何が好きですか？", "日本語を好きです。", {
  lessonId: "meet-likes",
});
const quantityBody = ask("cafe", "ご注文は？", "コーヒーを二つください。", {
  lessonId: "cafe-order",
});
const priceBody = ask(
  "cafe",
  "このコーヒーは三百五十円です。",
  "三百五十円ですね。",
);
const changeBody = ask(
  "cafe",
  "コーヒーですね。ホットですか、アイスですか？",
  "やっぱりコーヒーじゃなくて、お茶をください。",
  { lessonId: "cafe-order" },
);
const ticketBody = ask(
  "station",
  "どんな切符がほしいですか？",
  "片道を一枚ください。",
  { lessonId: "station-ticket" },
);
const assistedReviewBody = ask(
  "meet",
  reviewInstruction,
  "Je ne sais pas, aide-moi.",
  { review: { target: originTarget, assisted: false } },
);
const supportedBody = ask("meet", originQuestion, "フランスです。", {
  lessonId: "meet-origin",
  learner: { support: "supported", weak: ["origin"], stable: [] },
});

/**
 * Authored evaluation fixtures, awaiting human linguistic review. Importing this
 * module performs no inference, network call, audio synthesis or storage write.
 *
 * Automatic checks establish literal/contract facts only. They are neither a
 * language-quality score nor evidence of mastery. In particular, no correction
 * on a clear-error case must still be inspected by a human.
 *
 * For each continuation, append the actual previous learner text and the actual
 * returned coaching/Japanese to history, in that order, then use at most 16 turns.
 * A fixed continuation volunteers information or asks for recall; if it does not
 * fit the generated question, record that mismatch instead of claiming success.
 * Do not replace an unsuccessful model turn with a fabricated successful one.
 * Review memory assertions also require the real local state and elapsed time;
 * a text-only API call cannot establish an independent spaced recall.
 *
 * Across all cases, a human must inspect: faithful French translation, correct
 * and useful French explanation, natural Japanese, beginner vocabulary, coaching
 * about the next actual question, and no pronunciation/mastery claim from text.
 * Audio uncertainty, microphone timing and Android playback need separate trials.
 */
export const linguisticCases: readonly LinguisticCase[] = [
  {
    id: "name-preserve-and-recall",
    label: "Conserver un prénom sans le normaliser arbitrairement",
    kind: "continuity",
    body: nameBody,
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le prénom tel qu’il est donné ; ne pas en déduire un pays.",
      "Ne pas redemander immédiatement le même prénom.",
    ],
    continuations: [
      next(
        nameBody,
        "私の名前は何ですか？",
        [fact("reply.japanese", ["オーギュスト"])],
        [
          "Répondre à la question de mémoire immédiate sans inventer un autre nom.",
          "La présence littérale du nom ne valide pas à elle seule le sens de la réponse.",
        ],
      ),
    ],
  },
  {
    id: "origin-country-city-recall",
    label: "Retenir le pays puis la ville dans un échange réel",
    kind: "continuity",
    body: originBody,
    automaticChecks: noCorrection,
    manualChecks: [
      "Conserver la Belgique, sans la remplacer par la France de l’exemple système.",
      "Une relance peut préciser la ville mais ne doit pas redemander le pays déjà fourni.",
    ],
    continuations: [
      next(originBody, "ベルギーのリエージュに住んでいます。", noCorrection, [
        "Intégrer la ville de Liège à la Belgique, sans confondre origine et lieu de résidence.",
      ]),
      next(
        originBody,
        "私の国と町を覚えていますか？",
        [
          fact("reply.japanese", ["ベルギー"]),
          fact("reply.japanese", ["リエージュ"]),
        ],
        [
          "Rappeler les deux informations en s’appuyant sur les vrais tours précédents.",
          "Ne pas reposer les trois mêmes questions sur le pays et la ville.",
        ],
      ),
    ],
  },
  {
    id: "origin-natural-fragment",
    label: "Un pays et desu suffisent dans la conversation",
    kind: "acceptable",
    body: ask("meet", originQuestion, "フランスです。", {
      lessonId: "meet-origin",
    }),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le fragment sans exiger une phrase complète.",
      "Enseigner éventuellement kara ensuite sans qualifier la réponse naturelle de faute ni déclarer la particule acquise.",
    ],
  },
  {
    id: "likes-casual-fragment",
    label: "Une réponse familière et elliptique reste acceptable",
    kind: "acceptable",
    body: ask("meet", "日本語は好きですか？", "うん、好き。", {
      lessonId: "meet-likes",
    }),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le registre familier et le sujet omis.",
      "Ne pas imposer un changement de politesse ni une construction complète comme condition de dialogue.",
    ],
  },
  {
    id: "likes-contrast-wa",
    label: "Wa marque naturellement un contraste dans les goûts",
    kind: "acceptable",
    body: ask(
      "meet",
      "お茶とコーヒーは好きですか？",
      "お茶は好きですが、コーヒーは好きじゃないです。",
    ),
    automaticChecks: noCorrection,
    manualChecks: [
      "Ne pas remplacer automatiquement wa par ga : le contraste est voulu.",
      "La traduction doit conserver le goût pour le thé et le rejet du café, sans inverser la négation.",
    ],
  },
  {
    id: "likes-kana-spelling",
    label: "L’écriture en kana ne constitue pas une faute",
    kind: "acceptable",
    body: ask("meet", "何が好きですか？", "にほんごがすきです。", {
      lessonId: "meet-likes",
    }),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter les kana sans imposer de kanji.",
      "Ne pas transformer la graphie en erreur persistante ou en jugement de prononciation.",
    ],
  },
  {
    id: "origin-particle-wo",
    label: "Corriger une particule d’origine puis reprendre le dialogue",
    kind: "clear-error",
    body: originErrorBody,
    referenceCorrection: {
      japanese: "私はフランスから来ました。",
      french: "Je viens de France.",
    },
    automaticChecks: [fact("correction.corrected", ["フランス"], true)],
    manualChecks: [
      "Corriger la provenance avec kara, en préservant la France et l’intention.",
      "L’explication française doit enseigner la construction correcte de façon concrète ; aucune faute de français ou règle inventée.",
    ],
    continuations: [
      next(
        originErrorBody,
        "私はフランスから来ました。",
        noCorrection,
        [
          "Accepter la nouvelle tentative et sortir de la boucle de répétition.",
          "Réutiliser kara dans une petite variation pertinente, sans redemander simplement le même pays.",
          "La répétition après le modèle reste assistée dans la mémoire ; elle ne prouve pas un rappel espacé.",
        ],
        {
          precondition:
            "Continuer seulement si la première réponse a réellement fourni la correction ; sinon noter cet échec.",
        },
      ),
    ],
  },
  {
    id: "likes-particle-wo",
    label: "Corriger ga suki sans changer les goûts",
    kind: "clear-error",
    body: likesErrorBody,
    referenceCorrection: {
      japanese: "日本語が好きです。",
      french: "J’aime le japonais.",
    },
    automaticChecks: [fact("correction.corrected", ["日本語"], true)],
    manualChecks: [
      "Corriger en une formulation naturelle avec ga suki, sans remplacer le japonais par un autre goût.",
      "Expliquer suki avec des mots simples ; éviter de le présenter comme un verbe transitif français.",
    ],
    continuations: [
      next(
        likesErrorBody,
        "日本語が好きです。",
        noCorrection,
        [
          "Ne pas corriger de nouveau la phrase désormais acceptable.",
          "Poursuivre les goûts avec une variation de la même construction, sans répéter l’explication déjà entendue.",
        ],
        {
          precondition:
            "La première réponse doit avoir effectivement présenté le modèle corrigé.",
        },
      ),
    ],
  },
  {
    id: "object-particle-ga",
    label: "Marquer l’objet d’une action transitive simple",
    kind: "clear-error",
    body: ask("cafe", "何を飲みますか？", "私は水が飲みます。"),
    referenceCorrection: {
      japanese: "私は水を飲みます。",
      french: "Je bois de l’eau.",
    },
    automaticChecks: [fact("correction.corrected", ["水"], true)],
    manualChecks: [
      "Conserver le sens je bois de l’eau ; corriger l’objet avec o, sans transformer la phrase en je peux boire.",
      "Expliquer la fonction de la particule dans cette phrase, sans prétendre que ga est toujours incorrect avec nom de boisson.",
    ],
  },
  {
    id: "activity-location-ni",
    label: "Distinguer le lieu d’une activité d’une destination",
    kind: "clear-error",
    body: ask("free", "どこで勉強しますか？", "図書館に勉強します。"),
    referenceCorrection: {
      japanese: "図書館で勉強します。",
      french: "J’étudie à la bibliothèque.",
    },
    automaticChecks: [fact("correction.corrected", ["図書館"], true)],
    manualChecks: [
      "Employer de pour le lieu où l’on étudie, en gardant la bibliothèque.",
      "Éviter une règle absolue selon laquelle ni ne pourrait jamais suivre un lieu ; une destination et le lieu d’une activité sont différents.",
    ],
  },
  {
    id: "past-polite-ending",
    label: "Corriger la forme polie passée d’un verbe",
    kind: "clear-error",
    body: ask("free", "昨日、何をしましたか？", "昨日、映画を見ますでした。"),
    referenceCorrection: {
      japanese: "昨日、映画を見ました。",
      french: "Hier, j’ai regardé un film.",
    },
    automaticChecks: [
      fact("correction.corrected", ["昨日"], true),
      fact("correction.corrected", ["映画"], true),
    ],
    manualChecks: [
      "Employer une forme passée naturelle de miru, sans changer hier ni le film.",
      "Expliquer la forme en mashita ; ne pas généraliser une terminaison verbale aux adjectifs ou aux noms.",
    ],
  },
  {
    id: "adjective-na-ending",
    label: "Ne pas traiter un adjectif en na comme un adjectif en i",
    kind: "clear-error",
    body: ask("station", "この駅はどうですか？", "この駅は静かいです。"),
    referenceCorrection: {
      japanese: "この駅は静かです。",
      french: "Cette gare est calme.",
    },
    automaticChecks: [fact("correction.corrected", ["駅"], true)],
    manualChecks: [
      "Donner une forme naturelle de shizuka desu en conservant le sens calme.",
      "Évaluer humainement l’importance de l’erreur avant de décider d’interrompre l’échange ; ne pas enseigner une fausse règle sur les mots finissant par ka.",
    ],
  },
  {
    id: "negative-natural-janai",
    label: "Une négation parlée avec janai desu est naturelle",
    kind: "acceptable",
    body: ask(
      "cafe",
      "コーヒーは好きですか？",
      "いいえ、あまり好きじゃないです。",
    ),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter janai desu et ne pas imposer dewa arimasen pour une préférence de style.",
      "Traduire amari avec la négation par pas beaucoup ou pas tellement, sans transformer cela en détestation.",
    ],
  },
  {
    id: "ongoing-te-iru",
    label: "Une activité en cours emploie naturellement te imasu",
    kind: "acceptable",
    body: ask("free", "今、何をしていますか？", "今、日本語を勉強しています。"),
    automaticChecks: noCorrection,
    manualChecks: [
      "Conserver l’activité en cours et ne pas la convertir en passé.",
      "Inspecter la segmentation pédagogique de benkyō shite imasu et distinguer cette lecture de celle du moteur vocal.",
    ],
  },
  {
    id: "past-casual-natural",
    label: "Le passé familier n’est pas une erreur de politesse",
    kind: "acceptable",
    body: ask("free", "昨日、何をしましたか？", "友達と映画を見た。"),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter la forme familière mita sans exiger mimashita.",
      "Conserver avec un ami ou des amis sans inventer une identité, un nombre exact d’amis ou le titre du film.",
    ],
  },
  {
    id: "origin-self-repair",
    label: "Une autocorrection finale ne devient pas une faute mémorisée",
    kind: "acceptable",
    body: ask(
      "meet",
      originQuestion,
      "ええと、フランスを…いや、フランスから来ました。",
    ),
    automaticChecks: noCorrection,
    manualChecks: [
      "Tenir compte de la réparation finale plutôt que de corriger le faux départ abandonné.",
      "Ne pas mémoriser l’hésitation seule comme erreur et ne pas noter la prononciation depuis le texte.",
    ],
  },
  {
    id: "origin-destination-ambiguity",
    label: "Une autre particule peut exprimer une autre intention correcte",
    kind: "ambiguous",
    body: ask("meet", originQuestion, "日本に来ました。"),
    automaticChecks: noCorrection,
    manualChecks: [
      "La phrase je suis venu au Japon est grammaticalement acceptable, même si elle ne donne pas le pays d’origine.",
      "Clarifier l’information encore demandée ; ne pas remplacer ni par kara en attribuant une origine japonaise à l’élève.",
    ],
  },
  {
    id: "subject-focus-ga",
    label: "Ga est naturel pour identifier la personne demandée",
    kind: "acceptable",
    body: ask("meet", "学生は誰ですか？", "私が学生です。"),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le focus sur watashi ga dans cette réponse.",
      "Ne pas appliquer une règle artificielle selon laquelle une présentation doit toujours commencer par watashi wa.",
    ],
  },
  {
    id: "cafe-quantity-change-memory",
    label: "Retenir une quantité puis son changement explicite",
    kind: "continuity",
    body: quantityBody,
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le compteur général futatsu pour deux cafés dans cette commande.",
      "Ne pas imposer une quantité ou un prix absent de l’échange.",
    ],
    continuations: [
      next(quantityBody, "やっぱり、一つだけください。", noCorrection, [
        "Mettre à jour la quantité : un seul café remplace les deux précédents.",
      ]),
      next(
        quantityBody,
        "注文したコーヒーはいくつですか？",
        [fact("reply.japanese", ["一つ", "ひとつ", "1つ", "一杯", "1杯"])],
        [
          "Répondre avec la dernière quantité, sans revenir aux deux cafés initiaux.",
          "Vérifier humainement que le nombre est affirmé dans la réponse, et non cité dans une question ou une négation.",
        ],
      ),
    ],
  },
  {
    id: "cafe-price-350-recall",
    label: "Conserver exactement un prix annoncé",
    kind: "continuity",
    body: priceBody,
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter la confirmation du prix sans ajouter de taxe ni convertir la devise.",
      "Inspecter la lecture de sanbyaku gojū en et la traduction de 350 yens.",
    ],
    continuations: [
      next(
        priceBody,
        "このコーヒーはいくらですか？",
        [fact("reply.japanese", ["三百五十円", "350円", "３５０円"])],
        [
          "Rappeler le prix déjà donné, sans inventer 300 ou 500 yens.",
          "Une correspondance littérale prouve uniquement que le montant figure dans la sortie.",
        ],
      ),
    ],
  },
  {
    id: "cafe-drink-change-memory",
    label: "Une nouvelle boisson remplace réellement la précédente",
    kind: "continuity",
    body: changeBody,
    automaticChecks: noCorrection,
    manualChecks: [
      "Confirmer ou prendre en compte le thé sans corriger une formulation naturelle.",
      "Enseigner les options de la nouvelle question si elles sont inconnues ; le conseil doit permettre d’y répondre.",
    ],
    continuations: [
      next(
        changeBody,
        "今、何を注文しましたか？",
        [fact("reply.japanese", ["お茶"])],
        [
          "Répondre en se souvenant du dernier choix, pas seulement mentionner le thé dans une nouvelle question.",
          "Ne pas inventer un type de thé, un prix ou une taille non donnés.",
        ],
      ),
    ],
  },
  {
    id: "station-destination-ni",
    label: "Ni convient pour la destination d’aller",
    kind: "acceptable",
    body: ask("station", "どこに行きますか？", "京都に行きます。", {
      lessonId: "station-destination",
    }),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter ni ikimasu ; ne pas forcer made ou e comme correction.",
      "Conserver Kyoto et ne pas proposer un trajet avec une autre destination supposée.",
    ],
  },
  {
    id: "station-one-way-memory",
    label: "Une demande de billet garde son type et sa quantité",
    kind: "continuity",
    body: ticketBody,
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le nom billet omis quand il est clair dans le contexte.",
      "Lire ichimai correctement et ne pas transformer l’aller simple en aller-retour.",
    ],
    continuations: [
      next(
        ticketBody,
        "私の切符は片道ですか、往復ですか？",
        [fact("reply.japanese", ["片道"])],
        [
          "Se souvenir que l’élève a demandé un aller simple.",
          "Ne pas reposer la même alternative comme si aucune demande n’avait été faite.",
        ],
      ),
    ],
  },
  {
    id: "station-time-half-past-nine",
    label:
      "Une heure courte avec han reste une réponse complète dans le contexte",
    kind: "acceptable",
    body: ask("station", "何時に出発しますか？", "九時半です。", {
      lessonId: "station-ticket",
    }),
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter le fragment à neuf heures et demie, sans imposer une phrase complète.",
      "Ne pas traduire par neuf heures ou huit heures et demie ; inspecter kuji han dans le rōmaji.",
    ],
  },
  {
    id: "request-repeat-fr",
    label: "Répéter la question sans donner de réponse modèle",
    kind: "request",
    body: ask("meet", originQuestion, "Répète la question, s’il te plaît."),
    automaticChecks: noCorrection,
    manualChecks: [
      "Répéter la question actuelle sans inventer une réponse d’élève ou une faute.",
      "Dans une révision, la répétition seule d’une consigne ne doit pas être confondue avec la révélation d’un modèle.",
    ],
  },
  {
    id: "request-translate-question-fr",
    label: "Traduire fidèlement la dernière question",
    kind: "request",
    body: ask(
      "cafe",
      "ホットですか、アイスですか？",
      "Traduis-moi ce que tu viens de dire.",
    ),
    automaticChecks: [
      ...noCorrection,
      { kind: "boolean-field", field: "assisted", value: true },
    ],
    manualChecks: [
      "Expliquer chaud ou glacé en français, sans choisir à la place de l’élève.",
      "Ne pas traduire littéralement l’ordre français en une nouvelle phrase japonaise.",
      "Vérifier que la trace d’aide est prise en compte si ce chemin est utilisé dans une révision.",
    ],
  },
  {
    id: "request-translate-own-intention",
    label: "Traduire une intention sans fabriquer de question",
    kind: "request",
    body: ask(
      "meet",
      "どこに住んでいますか？",
      "Comment on dit : j’habite à Lyon ?",
    ),
    automaticChecks: [
      ...noCorrection,
      fact("reply.japanese", ["リヨン"]),
      { kind: "boolean-field", field: "practice", value: true },
    ],
    manualChecks: [
      "Le modèle japonais doit dire j’habite à Lyon, sans demander à Mochi si elle y habite.",
      "La traduction et l’explication doivent conserver l’intention déclarative ; ne pas ajouter prénom, nationalité ou pays.",
      "La lecture pédagogique doit conserver le groupe sunde imasu plutôt que couper arbitrairement le verbe.",
    ],
  },
  {
    id: "request-explain-kara-fr",
    label: "Répondre à la question grammaticale précise de l’élève",
    kind: "request",
    body: ask("meet", originQuestion, "Pourquoi tu utilises kara ?"),
    automaticChecks: [
      ...noCorrection,
      { kind: "boolean-field", field: "assisted", value: true },
    ],
    manualChecks: [
      "Expliquer que kara marque ici la provenance, en français naturel et en mots simples.",
      "Répondre au mot réellement demandé, sans expliquer un autre point ou attribuer un pays à l’élève.",
      "Ne pas affirmer que kara ne sert jamais à autre chose ; ne pas inventer une faute française ou une propriété de prononciation.",
    ],
  },
  {
    id: "request-negative-own-intention",
    label: "Le conseil doit correspondre au modèle négatif réellement fourni",
    kind: "request",
    body: ask(
      "meet",
      "何が好きですか？",
      "Je veux dire : je n’aime pas le café.",
    ),
    automaticChecks: [
      ...noCorrection,
      fact("reply.japanese", ["コーヒー"]),
      { kind: "boolean-field", field: "practice", value: true },
    ],
    manualChecks: [
      "Le modèle et sa traduction doivent conserver la négation, sans transformer pas aimer en détester.",
      "L’explication doit permettre de former la phrase négative effectivement donnée ; le seul modèle positif ga suki desu serait insuffisant.",
      "Choisir le conseil à partir de l’intention ou de la réponse fournie, sans se limiter à l’ancienne question positive.",
    ],
  },
  {
    id: "review-help-then-assisted-repeat",
    label: "Une aide suivie d’une bonne répétition reste assistée",
    kind: "continuity",
    body: assistedReviewBody,
    setup: [
      "Utiliser un profil de test avec skill:origin à échéance et observer les compteurs avant l’essai.",
      "Ne pas créditer un rappel à partir du seul résultat du modèle : contrôler l’état local et l’exposition réelle du modèle.",
    ],
    automaticChecks: [
      ...noCorrection,
      { kind: "boolean-field", field: "practice", value: true },
    ],
    manualChecks: [
      "Présenter un modèle utile sans considérer la demande d’aide comme une faute grammaticale.",
      "Enregistrer l’aide ou l’exposition du modèle sans déclarer une compétence acquise.",
    ],
    continuations: [
      next(
        assistedReviewBody,
        "フランスから来ました。",
        noCorrection,
        [
          "Accepter la répétition en indiquant qu’elle a été aidée.",
          "Dans l’app, successes et la boîte de rappel ne doivent pas avancer après cette répétition immédiate.",
        ],
        {
          review: { target: originTarget, assisted: true },
          precondition:
            "Le modèle doit avoir été effectivement donné au premier tour. Conserver son aide dans le vrai état local.",
        },
      ),
    ],
  },
  {
    id: "review-independent-other-country",
    label: "Un rappel indépendant peut employer un autre pays",
    kind: "acceptable",
    body: ask("meet", reviewInstruction, "ベルギーから来ました。", {
      review: { target: originTarget, assisted: false },
    }),
    setup: [
      "Préparer skill:origin à échéance dans un profil de test, au moins 24 heures après le dernier modèle, sans crédit ce jour-là.",
      "Commencer une nouvelle séance sans consulter d’indice ; ne pas remplacer la consigne par une question japonaise donnant déjà kara.",
    ],
    automaticChecks: noCorrection,
    manualChecks: [
      "Accepter la Belgique : la référence France est un exemple, pas un fait imposé.",
      "Contrôler la grammaire démontrée sans réclamer une répétition littérale.",
      "La mémoire peut créditer au plus un rappel si les conditions locales sont remplies ; une réussite seule ne justifie ni maîtrise durable ni niveau JLPT.",
    ],
  },
  {
    id: "difficulty-supported",
    label: "Accompagner un débutant et simplifier après une difficulté",
    kind: "continuity",
    body: supportedBody,
    setup: [
      "Le contexte learner est une donnée de test synthétique, pas une évaluation réelle du niveau de l’utilisateur.",
      "Comparer avec difficulty-light sans conclure à une adaptation fiable sur une seule sortie.",
    ],
    automaticChecks: noCorrection,
    manualChecks: [
      "Poser une seule question concrète et courte, avec l’aide nécessaire pour le prochain mot ou la prochaine construction.",
      "Ne pas donner une leçon française incorrecte ni supposer connu un vocabulaire complexe.",
    ],
    continuations: [
      next(
        supportedBody,
        "Je ne comprends pas, c’est trop difficile.",
        [
          ...noCorrection,
          { kind: "boolean-field", field: "practice", value: true },
        ],
        [
          "Simplifier ou montrer un exemple utilisable pour la question courante.",
          "Ne pas augmenter la difficulté après ce signal, ne pas noter une faute japonaise, et ne pas confondre l’aide avec un rappel indépendant.",
        ],
      ),
    ],
  },
  {
    id: "difficulty-light",
    label: "Laisser essayer une construction déjà rappelée",
    kind: "continuity",
    body: {
      ...supportedBody,
      text: "フランスから来ました。",
      learner: {
        support: "light",
        weak: [],
        stable: ["origin", "identity", "likes"],
      },
    },
    setup: [
      "Profil synthétique identique en situation à difficulty-supported ; les compétences stable sont injectées uniquement pour comparer la consigne.",
    ],
    automaticChecks: noCorrection,
    manualChecks: [
      "Éviter de réenseigner la construction d’origine supposée connue ; proposer une petite variation encore adaptée au débutant.",
      "Expliquer un mot réellement nouveau si la question en introduit un, sans transformer light en cours avancé.",
      "Ne pas annoncer une maîtrise, une durée d’apprentissage ou un niveau JLPT qui ne sont pas démontrés.",
    ],
  },
];
