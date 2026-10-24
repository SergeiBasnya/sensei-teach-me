export type JapaneseVoice = {
  identifier: string;
  language: string;
  quality: string;
  name: string;
};
export function selectJapaneseVoice<T extends JapaneseVoice>(
  voices: readonly T[],
): T | undefined {
  return voices
    .filter((voice) => /^ja(?:[-_]|$)/i.test(voice.language))
    .sort((left, right) => {
      const rank = (voice: JapaneseVoice) =>
        (/enhanced|premium/i.test(voice.quality + " " + voice.name) ? 4 : 0) +
        (/^ja[-_]JP$/i.test(voice.language) ? 2 : 0);
      return rank(right) - rank(left);
    })[0];
}
