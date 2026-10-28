import type { ScenarioId, TutorReply } from "./contracts";
import type { LearnerContext } from "./learning-memory";

// A situation supplies possible intentions, never an immutable dialogue or a
// success claim. Add situations here after validating their beginner corpus.
export const conversationCurriculum: Record<
  ScenarioId,
  {
    role: string;
    variations: string[];
  }
> = {
  meet: {
    role: "Une nouvelle connaissance",
    variations: ["prénom", "origine", "ville", "goûts"],
  },
  cafe: {
    role: "Une personne au comptoir d’un café",
    variations: [
      "boisson choisie",
      "changement de commande",
      "température",
      "taille",
      "prix",
    ],
  },
  station: {
    role: "Une personne qui aide à la gare",
    variations: [
      "destination",
      "aller simple ou retour",
      "horaire",
      "nombre de billets",
    ],
  },
  free: {
    role: "Une amie qui aide à pratiquer",
    variations: ["quotidien", "goûts", "petit projet"],
  },
};
export function conversationGuidance(scenario: ScenarioId) {
  const curriculum = conversationCurriculum[scenario];
  return `Role: ${curriculum.role}. Possible variations, only when relevant: ${curriculum.variations.join(", ")}.
These are optional intentions, not a script. Honor changed choices first. Stay near the current objective. One accepted fragment does not demonstrate the target construction. Reuse known patterns; introduce at most one new word or pattern. Never declare mastery.`;
}

// A small checked vocabulary aid, not a replacement for the generated dialogue.
// The first corpus showed that the model sometimes explains ocha while asking
// hotto/aisu, leaving a beginner unable to answer that actual question.
const temperatureHint =
  "Hotto veut dire chaud ; aisu veut dire glacé. Tu peux dire « hotto de onegaishimasu » ou « aisu de onegaishimasu ».";
export function supportQuestion(
  tutor: TutorReply,
  history: { role: string; content: string }[],
  learner?: LearnerContext,
): TutorReply {
  if (tutor.correction || !/ホット.*アイス/.test(tutor.reply.japanese))
    return tutor;
  const taught = history.some(
    (item) =>
      item.role === "assistant" &&
      /hotto/i.test(item.content) &&
      /aisu/i.test(item.content),
  );
  if (taught || learner?.stable.includes("choice"))
    return tutor.coaching === temperatureHint
      ? { ...tutor, coaching: null }
      : tutor;
  if (/hotto/i.test(tutor.coaching || "") && /aisu/i.test(tutor.coaching || ""))
    return tutor;
  return {
    ...tutor,
    coaching: temperatureHint,
  };
}
