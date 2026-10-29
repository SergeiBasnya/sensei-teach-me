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

export function assistanceIntent(
  text: string,
):
  | { kind: "answer"; meaning: string }
  | { kind: "question"; action: "repeat" | "translate" | "explain" }
  | null {
  const normalized = text.toLowerCase().replace(/[’']/g, " ");
  if (/comment\s+(?:(?:je|on)\s+)?demande.*l\s+addition/.test(normalized))
    return { kind: "answer", meaning: "L’addition, s’il te plaît." };
  // Translate an intended answer before matching requests about the question.
  const meaning = text
    .match(
      /(?:je (?:veux|voudrais) dire|traduis(?:[ -]moi)?|comment (?:on dit|dire))\s*[:：]?\s+(.+)/i,
    )?.[1]
    ?.trim()
    .replace(/[?？]\s*$/, "")
    .trim();
  const refersToQuestion =
    meaning &&
    /^(?:(?:la|ta|cette)(?: dernière)? (?:phrase|question)|ce que tu (?:viens de dire|as dit))/i.test(
      meaning,
    );
  if (meaning && !refersToQuestion) return { kind: "answer", meaning };
  if (refersToQuestion) return { kind: "question", action: "translate" };
  if (
    /répète|répéter|repete|repeter|encore une fois|plus lentement|もう一度|もういちど|ゆっくり/.test(
      normalized,
    )
  )
    return { kind: "question", action: "repeat" };
  if (
    /ça veut dire quoi|qu.est.ce que (?:ça|cela) veut dire|tradui[st].*(?:question|phrase)|en français|意味/.test(
      normalized,
    )
  )
    return { kind: "question", action: "translate" };
  if (
    /explique|explication|pourquoi (?:tu|on|il|elle|utiliser)|説明/.test(
      normalized,
    )
  )
    return { kind: "question", action: "explain" };
  if (
    /je (?:ne )?sais (?:vraiment )?pas|j (?:ai|a) (?:pas |rien )?compris|je (?:ne )?comprends? pas|aide[ -]moi|わかりません|分かりません|わからない/.test(
      normalized,
    )
  )
    return { kind: "answer", meaning: "" };
  return null;
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
