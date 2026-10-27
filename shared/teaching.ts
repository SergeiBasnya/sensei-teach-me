import type {
  ConversationHelp,
  LessonId,
  Phrase,
  TutorReply,
} from "./contracts";

export const teaching: Record<LessonId, string> = {
  "meet-name":
    "Aujourd’hui, on apprend à se présenter. Écoute cet exemple : il suffit de remplacer le prénom par le tien.",
  "meet-origin":
    "On va dire d’où tu viens. Écoute cet exemple avec la France. Tu pourras remplacer le pays par le tien.",
  "meet-likes":
    "On va parler de ce que tu aimes. Écoute cet exemple sur le japonais, puis essaie avec tes propres goûts.",
  "cafe-order":
    "Imagine que tu commandes au café. Je te donne un exemple pour demander un café poliment.",
  "cafe-choice":
    "Au café, tu vas choisir entre chaud et glacé. Voici une réponse pour demander une boisson chaude.",
  "cafe-finish":
    "On va terminer une commande poliment. Écoute comment dire non, merci, quand tu ne veux rien d’autre.",
  "station-destination":
    "À la gare, tu vas indiquer ta destination. Écoute cet exemple pour aller à Kyoto.",
  "station-ticket":
    "On va demander un billet de train. Voici comment demander un aller simple pour une personne.",
  "station-thanks":
    "On va terminer l’échange à la gare. Écoute comment remercier poliment.",
};
export type LessonOpening = { explanation: string; model: Phrase };
export const openingInvitation =
  "À toi maintenant. Écoute ma question et essaie de répondre. Tu peux me dire en français si tu as besoin d’aide.";

// A grounded first teaching step keeps beginners on their selected objective.
export const followups: Record<
  LessonId,
  { reply: Phrase; coaching: string; practice?: boolean }
> = {
  "meet-name": {
    reply: {
      japanese: "お名前は？",
      romaji: "Onamae wa?",
      french: "Comment t’appelles-tu ?",
    },
    coaching:
      "Très bien. Maintenant, apprends à demander le prénom de quelqu’un. Écoute le modèle et pose-moi cette question.",
    practice: true,
  },
  "meet-origin": {
    reply: {
      japanese: "どこに住んでいますか？",
      romaji: "Doko ni sundeimasu ka?",
      french: "Où habites-tu ?",
    },
    coaching:
      "On va préciser où tu habites. Pour répondre, donne ta ville, puis ajoute ni sundeimasu. Écoute ma question et essaie avec ta ville.",
  },
  "meet-likes": {
    reply: {
      japanese: "何がいちばん好きですか？",
      romaji: "Nani ga ichiban suki desu ka?",
      french: "Qu’aimes-tu le plus ?",
    },
    coaching:
      "Ichiban veut dire le plus. Cette fois, je te demande ce que tu préfères. Tu peux reprendre la même construction avec ga suki desu.",
  },
  "cafe-order": {
    reply: {
      japanese: "ホットですか、アイスですか？",
      romaji: "Hotto desu ka, aisu desu ka?",
      french: "Chaud ou glacé ?",
    },
    coaching:
      "Je te demande de choisir. Hotto veut dire chaud, et aisu, glacé. Tu peux répondre avec ton choix, suivi de de onegaishimasu, pour dire s’il vous plaît.",
  },
  "cafe-choice": {
    reply: {
      japanese: "サイズはどうしますか？",
      romaji: "Saizu wa dō shimasu ka?",
      french: "Quelle taille souhaites-tu ?",
    },
    coaching:
      "Saizu veut dire taille. Pour demander une petite taille, tu peux dire chiisai no o kudasai. Écoute ma question et fais ton choix.",
  },
  "cafe-finish": {
    reply: {
      japanese: "ありがとうございました。またお越しください。",
      romaji: "Arigatō gozaimashita. Mata okoshi kudasai.",
      french: "Merci beaucoup. Revenez nous voir.",
    },
    coaching:
      "La commande est terminée. Je te remercie et t’invite à revenir. Pour me remercier à ton tour, utilise arigatō gozaimasu.",
  },
  "station-destination": {
    reply: {
      japanese: "片道ですか、往復ですか？",
      romaji: "Katamichi desu ka, ōfuku desu ka?",
      french: "Un aller simple ou un aller-retour ?",
    },
    coaching:
      "Katamichi désigne un aller simple. Ōfuku désigne un aller-retour. Je te demande de choisir ton billet. Essaie de répondre avec le choix que tu veux.",
  },
  "station-ticket": {
    reply: {
      japanese: "いつ出発しますか？",
      romaji: "Itsu shuppatsu shimasu ka?",
      french: "Quand pars-tu ?",
    },
    coaching:
      "Itsu veut dire quand. Je te demande quand tu pars. Tu peux répondre avec kyō pour aujourd’hui, ou ashita pour demain, suivi de desu.",
  },
  "station-thanks": {
    reply: {
      japanese: "どういたしまして。よい旅を！",
      romaji: "Dō itashimashite. Yoi tabi o!",
      french: "De rien. Bon voyage !",
    },
    coaching:
      "Tu as terminé l’échange poliment. Je te réponds de rien, puis bon voyage. Pour me dire au revoir, tu peux dire sayōnara.",
  },
};
export function firstCoachedFollowup(
  lessonId: LessonId | undefined,
  history: { role: string; content: string }[],
  text: string,
): TutorReply | null {
  if (!lessonId || /[?？]|か[。！!]?\s*$/.test(text)) return null;
  const step = followups[lessonId];
  if (
    history.some(
      (item) =>
        item.role === "assistant" && item.content.includes(step.coaching),
    )
  )
    return null;
  return { ...step, correction: null, vocabulary: [] };
}

export function assistanceIntent(text: string): { meaning: string } | null {
  const normalized = text.toLowerCase().replace(/[’']/g, " ");
  if (
    /je (?:ne )?sais (?:vraiment )?pas|j (?:ai|a) (?:pas |rien )?compris|je (?:ne )?comprends? pas|aide[ -]moi|わかりません|分かりません|わからない|もう一度/.test(
      normalized,
    )
  )
    return { meaning: "" };
  const meaning = text
    .match(
      /(?:je (?:veux|voudrais) dire|traduis(?:[ -]moi)?|comment (?:on dit|dire))\s*[:：]?\s+(.+)/i,
    )?.[1]
    ?.trim();
  return meaning ? { meaning } : null;
}

export function tutorFromHelp(help: ConversationHelp): TutorReply {
  const invitation = "Écoute, puis essaie de le dire à ton tour.";
  const coaching = [
    `${help.explanation} Voici un exemple : ${help.answer.french} ${invitation}`,
    `${help.explanation} ${invitation}`,
    help.explanation,
  ].find((text) => text.length <= 500)!;
  return {
    reply: help.answer,
    coaching,
    practice: true,
    correction: null,
    vocabulary: [help.answer],
  };
}
