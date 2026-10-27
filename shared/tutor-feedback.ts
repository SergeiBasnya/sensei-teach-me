import { tutorReplySchema, type TutorReply } from "./contracts";

/** The spoken turn and the visible exercise must teach the same sentence. */
export function prepareTutorReply(raw: unknown, original: string): TutorReply {
  const tutor = tutorReplySchema.parse(raw);
  const correction = tutor.correction;
  if (!correction) return tutor;
  const normalize = (text: string) => text.replace(/[\s。、！？.!?]/gu, "");
  if (normalize(correction.corrected) === normalize(original))
    return { ...tutor, correction: null };
  return {
    ...tutor,
    correction: { ...correction, original },
    coaching: correction.explanation,
    practice: true,
    reply: {
      japanese: `${correction.corrected} もう一度、言ってみましょう。`,
      romaji: `${correction.romaji} Mō ichido, itte mimashō.`,
      french: `${correction.french} Réessaie cette phrase.`,
    },
  };
}
