import type { TutorReply } from "../../shared/contracts";
import { isHelpReply } from "../../shared/teaching";

type Reader = {
  speakFrench: (text: string) => Promise<boolean>;
  speakJapanese: (text: string) => Promise<boolean>;
  playJapaneseAudio: (audio: string) => Promise<boolean>;
};

/** Explicit help is spoken before the lab's separately queued Japanese model.
 * Failure of optional French never suppresses that model; pause prevents it.
 */
export async function readHelpCoaching(
  tutor: TutorReply,
  speakFrench: Reader["speakFrench"],
  current: () => boolean,
) {
  if (!current()) return false;
  if (isHelpReply(tutor) && tutor.coaching) {
    try {
      await speakFrench(tutor.coaching);
    } catch {
      // Keep the validated Japanese available when French synthesis fails.
    }
  }
  return current();
}
/** Check cancellation between languages as well as after actual playback ends. */
export async function readTutor(
  tutor: TutorReply,
  reader: Reader,
  current: () => boolean,
  audio?: { japanese: string; french?: string; coachingUnavailable?: boolean },
) {
  if (!current()) return false;
  if (tutor.coaching && !audio?.coachingUnavailable) {
    try {
      if (audio?.french) await reader.playJapaneseAudio(audio.french);
      else await reader.speakFrench(tutor.coaching);
    } catch {
      /* The Japanese turn remains usable if optional French fails. */
    }
    if (!current()) return false;
  }
  const played = audio
    ? await reader.playJapaneseAudio(audio.japanese)
    : await reader.speakJapanese(tutor.reply.japanese);
  return played && current();
}
