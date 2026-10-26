export type AvatarMood =
  "idle" | "listening" | "thinking" | "speaking" | "happy";
export function conversationMood(
  phase: string,
  preparingSpeech: boolean,
): AvatarMood {
  if (phase === "listening") return "listening";
  if (phase === "thinking" || phase === "starting" || preparingSpeech)
    return "thinking";
  return "idle";
}
export function avatarFrame(
  mood: AvatarMood,
  mouthLevel: number,
  blinking: boolean,
) {
  if (blinking) return 3;
  if (mood === "speaking")
    return [0, 1, 2, 7][Math.min(3, Math.max(0, Math.round(mouthLevel)))]!;
  return { idle: 0, happy: 4, listening: 5, thinking: 6 }[mood];
}
