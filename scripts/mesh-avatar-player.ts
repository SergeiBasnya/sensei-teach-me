import { createMeshAvatar, parseRig, type MeshAvatar } from "mesh-avatar";
import {
  meshStateSchema,
  type MeshAvatarState,
} from "../src/lib/mesh-avatar-protocol";

declare const MOCHI_RIG: unknown;
declare const MOCHI_ASSETS: Record<string, string>;
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    MochiMesh?: {
      receive: (state: unknown) => void;
      snapshot: () => {
        frames: number;
        state: MeshAvatarState;
        parameters: Record<string, number>;
      };
    };
  }
}

let avatar: MeshAvatar | undefined;
let frames = 0;
let raf = 0;
let last = 0;
let closed = false;
let previous = "";
let state: MeshAvatarState = {
  mood: "idle",
  level: 0,
  active: false,
  reduced: true,
};
const canvas = document.querySelector("canvas")!;
function notify(type: "mochi:ready" | "mochi:failed") {
  const event = { type, version: 1 };
  if (window.ReactNativeWebView)
    window.ReactNativeWebView.postMessage(JSON.stringify(event));
  else window.parent.postMessage(event, "*");
}
function destroy() {
  if (closed) return;
  closed = true;
  cancelAnimationFrame(raf);
  avatar?.destroy();
}
function fail() {
  destroy();
  notify("mochi:failed");
}
function running() {
  return (
    !!avatar && state.active && !state.reduced && !document.hidden && !closed
  );
}
function tick(now: number) {
  if (!running()) return;
  if (now - last >= 1000 / 30) {
    avatar!.advance(1 / 30, 30);
    frames++;
    last = now;
  }
  raf = requestAnimationFrame(tick);
}
function apply() {
  if (!avatar || closed) return;
  cancelAnimationFrame(raf);
  const live = state.active && !document.hidden;
  const speaking = live && state.mood === "speaking";
  avatar.setAutoMotion(false);
  avatar.setAutoIdle(false);
  avatar.setSwayGain(state.reduced ? 0 : 0.45);
  avatar.setTalkGain(state.reduced ? 0 : 0.4);
  avatar.setExpression(live && state.mood === "happy" ? "smile" : "neutral");
  avatar.setSpeaking(speaking && !state.reduced);
  avatar.setVoiceLevel(speaking ? state.level : 0);
  if (!speaking || state.reduced) avatar.stopLipSync();
  const pose: Record<string, number> = { gazeX: 0, gazeY: 0 };
  if (!speaking) pose.mouthOpen = 0;
  if (state.reduced || !live) {
    Object.assign(pose, {
      angleX: 0,
      angleY: 0,
      angleZ: 0,
      bodyAngleZ: 0,
      breath: 0,
      eyeROpen: 1,
      eyeLOpen: 1,
      mouthOpen: speaking ? 0.22 : 0,
    });
  } else if (state.mood === "listening") {
    Object.assign(pose, { angleZ: 3, gazeX: 0.15, gazeY: 0.03 });
  } else if (state.mood === "thinking") {
    Object.assign(pose, { angleZ: -2.5, gazeX: -0.1, gazeY: 0.22 });
  }
  avatar.setParameters(pose);
  // Dessiner une pose arrêtée avant de couper la boucle ferme aussi la bouche.
  avatar.advance(running() ? 0 : 0.2, 30);
  frames++;
  last = performance.now();
  if (running()) raf = requestAnimationFrame(tick);
}
function receive(value: unknown) {
  const parsed = meshStateSchema.safeParse(value);
  if (!parsed.success || closed) return;
  const key = JSON.stringify(parsed.data);
  if (key === previous) return;
  previous = key;
  const changed =
    state.mood !== parsed.data.mood ||
    state.active !== parsed.data.active ||
    state.reduced !== parsed.data.reduced;
  state = parsed.data;
  if (changed || !avatar) apply();
  else
    avatar.setVoiceLevel(
      state.active && state.mood === "speaking" ? state.level : 0,
    );
}
window.MochiMesh = {
  receive,
  snapshot: () => ({
    frames,
    state: { ...state },
    parameters: avatar?.getParameters() || {},
  }),
};
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (
    event.source !== window.parent ||
    typeof event.data !== "object" ||
    !event.data
  )
    return;
  const message = event.data as { type?: unknown; state?: unknown };
  if (message.type === "mochi:state") receive(message.state);
});
document.addEventListener("visibilitychange", apply);
window.addEventListener("pagehide", destroy);
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  fail();
});
void createMeshAvatar(canvas, {
  rig: parseRig(MOCHI_RIG),
  assets: MOCHI_ASSETS,
  manual: true,
  lipSync: { granularity: 0.55, openness: 0.45, closeSpeed: 0.75 },
})
  .then((instance) => {
    if (closed) {
      instance.destroy();
      return;
    }
    avatar = instance;
    apply();
    notify("mochi:ready");
  })
  .catch(fail);
