import { z } from "zod";
import type { AvatarMood } from "./avatar-state";

export const meshStateSchema = z.object({
  mood: z.enum(["idle", "listening", "thinking", "speaking", "happy"]),
  level: z.number().finite().min(0).max(1),
  active: z.boolean(),
  reduced: z.boolean(),
});
export type MeshAvatarState = z.infer<typeof meshStateSchema>;
export const meshEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mochi:ready"), version: z.literal(1) }),
  z.object({ type: z.literal("mochi:failed"), version: z.literal(1) }),
]);

export function meshAvatarState(
  mood: AvatarMood,
  level: number,
  active: boolean,
  reduced: boolean,
): MeshAvatarState {
  return {
    mood: active ? mood : "idle",
    level:
      active && mood === "speaking"
        ? reduced
          ? 0.35
          : Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0))
        : 0,
    active,
    reduced,
  };
}

export function meshStateScript(state: MeshAvatarState) {
  return `window.MochiMesh?.receive(${JSON.stringify(meshStateSchema.parse(state))});true;`;
}

export function isAvatarNavigation(url: string) {
  return url === "about:blank" || url === "about:srcdoc";
}
