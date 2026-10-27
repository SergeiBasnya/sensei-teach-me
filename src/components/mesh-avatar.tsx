import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AnimatedAvatar } from "./animated-avatar";
import { MeshSurface } from "./mesh-surface";
import { loadMeshAvatarPage } from "../lib/mesh-avatar-page";
import { useAvatarMotion } from "../lib/use-avatar-motion";
import { meshAvatarState } from "../lib/mesh-avatar-protocol";
import type { AvatarMood } from "../lib/avatar-state";

export function MeshAvatar({
  size,
  mood,
  mouthLevel,
  voiceLevel,
  active = true,
  happy = false,
}: {
  size: number;
  mood: AvatarMood;
  mouthLevel: number;
  voiceLevel: number;
  active?: boolean;
  happy?: boolean;
}) {
  const [html, setHtml] = useState("");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { reduced, foreground } = useAvatarMotion();
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => setFailed(true), []);
  useEffect(() => {
    if (!active || failed) return;
    let live = true;
    void loadMeshAvatarPage()
      .then((page) => {
        if (live) setHtml(page);
      })
      .catch(() => {
        if (live) onFailure();
      });
    return () => {
      live = false;
    };
  }, [active, failed, onFailure]);
  useEffect(() => {
    if (!html || ready || failed || !foreground) return;
    const timer = setTimeout(onFailure, 15_000);
    return () => clearTimeout(timer);
  }, [html, ready, failed, foreground, onFailure]);
  const state = useMemo(
    () => meshAvatarState(mood, voiceLevel, active && foreground, reduced),
    [mood, voiceLevel, active, foreground, reduced],
  );
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        happy ? "Mochi te félicite" : "Mochi, ton interlocutrice en japonais"
      }
      testID={`mochi-mesh-${failed ? "fallback" : ready ? "ready" : "loading"}`}
      style={{ width: size, height: size }}
    >
      {(!ready || failed) && (
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <AnimatedAvatar
            size={size}
            mood={mood}
            mouthLevel={mouthLevel}
            active={active}
            happy={happy}
          />
        </View>
      )}
      {html && !failed ? (
        <View
          style={StyleSheet.absoluteFill}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <MeshSurface
            html={html}
            state={state}
            ready={ready}
            onReady={onReady}
            onFailure={onFailure}
          />
        </View>
      ) : null}
    </View>
  );
}
