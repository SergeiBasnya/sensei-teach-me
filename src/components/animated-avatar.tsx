import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  View,
} from "react-native";
import { avatarFrame, type AvatarMood } from "../lib/avatar-state";

export function AnimatedAvatar({
  size,
  mood,
  mouthLevel,
  active = true,
  happy = false,
}: {
  size: number;
  mood: AvatarMood;
  mouthLevel: number;
  active?: boolean;
  happy?: boolean;
}) {
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [blink, setBlink] = useState(false);
  const [failed, setFailed] = useState(false);
  const breath = useRef(new Animated.Value(0)).current;
  const moving = active && foreground && !reduced;
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setReduced(value);
      })
      .catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    const app = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => {
      live = false;
      motion.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    setBlink(false);
    if (!moving || failed) {
      breath.setValue(0);
      return;
    }
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    breathing.start();
    let blinkTimer: ReturnType<typeof setTimeout>,
      openTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      blinkTimer = setTimeout(
        () => {
          setBlink(true);
          openTimer = setTimeout(() => {
            setBlink(false);
            schedule();
          }, 130);
        },
        3200 + Math.random() * 2300,
      );
    };
    schedule();
    return () => {
      breathing.stop();
      clearTimeout(blinkTimer);
      clearTimeout(openTimer);
    };
  }, [moving, failed, breath]);
  const displayed = active && foreground ? mood : "idle";
  const frame = avatarFrame(
    displayed,
    reduced && displayed === "speaking" ? 1 : mouthLevel,
    moving && blink,
  );
  const cell = size * 0.94;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        happy ? "Mochi te félicite" : "Mochi, ton interlocutrice en japonais"
      }
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          width: cell,
          height: cell,
          transform: [
            {
              translateY: breath.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -1.8],
              }),
            },
            {
              scale: breath.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.012],
              }),
            },
            {
              rotate: !moving
                ? "0deg"
                : displayed === "listening"
                  ? "-1deg"
                  : displayed === "thinking"
                    ? "1deg"
                    : "0deg",
            },
          ],
        }}
      >
        <View
          testID={
            failed
              ? "mochi-avatar-static"
              : `mochi-avatar-${displayed}-${frame}`
          }
          style={{ width: cell, height: cell, overflow: "hidden" }}
        >
          {failed ? (
            <Image
              source={require("../../assets/avatar/manga-b.png")}
              resizeMode="contain"
              accessible={false}
              style={{ width: cell, height: cell }}
            />
          ) : (
            <Image
              source={require("../../assets/avatar/manga-b-expressions-v2.png")}
              accessible={false}
              resizeMode="stretch"
              onError={() => setFailed(true)}
              style={{
                position: "absolute",
                width: cell * 4,
                height: cell * 2,
                left: -(frame % 4) * cell,
                top: -Math.floor(frame / 4) * cell,
              }}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}
