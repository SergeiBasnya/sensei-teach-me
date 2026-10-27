import { useEffect, useRef } from "react";
import { meshEventSchema } from "../lib/mesh-avatar-protocol";
import type { MeshSurfaceProps } from "./mesh-surface";

export function MeshSurface({
  html,
  state,
  ready,
  onReady,
  onFailure,
}: MeshSurfaceProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== ref.current?.contentWindow) return;
      const parsed = meshEventSchema.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.type === "mochi:ready") onReady();
      else onFailure();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onReady, onFailure]);
  useEffect(() => {
    if (ready)
      ref.current?.contentWindow?.postMessage(
        { type: "mochi:state", state },
        "*",
      );
  }, [ready, state]);
  return (
    <iframe
      ref={ref}
      srcDoc={html}
      sandbox="allow-scripts"
      title="Animation de Mochi"
      aria-hidden
      tabIndex={-1}
      onError={onFailure}
      style={{
        width: "100%",
        height: "100%",
        border: 0,
        pointerEvents: "none",
        opacity: ready ? 1 : 0,
      }}
    />
  );
}
