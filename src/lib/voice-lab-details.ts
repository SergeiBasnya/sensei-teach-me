import type { Phrase, TutorReply } from "../../shared/contracts";

export type VoiceLabDetails = {
  japanese: string;
  french: string;
  coaching: string | null;
};
/** Late metadata can enrich the same displayed sentence, never replace its Japanese. */
export function applyVoiceLabDetails(
  tutor: TutorReply | null,
  details: VoiceLabDetails,
): TutorReply | null {
  if (!tutor || tutor.correction || tutor.reply.japanese !== details.japanese)
    return tutor;
  return {
    ...tutor,
    reply: { ...tutor.reply, french: details.french },
    coaching: tutor.coaching,
  };
}
export function applyPhraseDetails(
  phrase: Phrase | null,
  details: VoiceLabDetails,
): Phrase | null {
  return phrase?.japanese === details.japanese
    ? { ...phrase, french: details.french }
    : phrase;
}
