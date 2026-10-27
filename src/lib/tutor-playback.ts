import type { TutorReply } from "../../shared/contracts";

type Reader = {
  speakFrench: (text: string) => Promise<boolean>;
  speakJapanese: (text: string) => Promise<boolean>;
  playJapaneseAudio: (audio: string) => Promise<boolean>;
};
/** Check cancellation between languages as well as after actual playback ends. */
export async function readTutor(
  tutor: TutorReply,
  reader: Reader,
  current: () => boolean,
  audio?: { japanese: string; french?: string },
) {
  if (!current()) return false;
  if (tutor.coaching) {
    const explained = audio?.french
      ? await reader.playJapaneseAudio(audio.french)
      : await reader.speakFrench(tutor.coaching);
    if (!explained || !current()) return false;
  }
  const played = audio
    ? await reader.playJapaneseAudio(audio.japanese)
    : await reader.speakJapanese(tutor.reply.japanese);
  return played && current();
}
