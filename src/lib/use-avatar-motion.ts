import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";

export function useAvatarMotion() {
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    let live = true;
    let removeMotion: () => void;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      // L’écoute directe évite les collisions de callbacks entre avatar et secours dans RN Web.
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(media.matches);
      const changed = (event: MediaQueryListEvent) => setReduced(event.matches);
      media.addEventListener("change", changed);
      removeMotion = () => media.removeEventListener("change", changed);
    } else {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (live) setReduced(value);
        })
        .catch(() => undefined);
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReduced,
      );
      removeMotion = () => subscription.remove();
    }
    const app = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => {
      live = false;
      removeMotion();
      app.remove();
    };
  }, []);
  return { reduced, foreground };
}
