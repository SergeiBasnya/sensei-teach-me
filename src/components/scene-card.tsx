import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Scene } from "../data/lessons";
import { Icon, SceneArt } from "./art";
import { colors, Txt } from "./ui";
import { appStyles as s } from "../styles";
export function SceneCard({
  scene,
  onPress,
  completed,
  horizontal = false,
}: {
  scene: Scene;
  onPress: () => void;
  completed: boolean;
  horizontal?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={`${scene.title}, ${scene.minutes} minutes${completed ? ", déjà pratiqué" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.scene,
        {
          flex: horizontal ? undefined : 1,
          flexDirection: horizontal ? "row" : "column",
          borderColor: hovered ? "#B6A2DF" : colors.line,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View
        style={{
          backgroundColor: scene.color,
          width: horizontal ? 102 : "100%",
          justifyContent: "center",
          borderRadius: 15,
          overflow: "hidden",
        }}
      >
        <SceneArt kind={scene.icon} />
      </View>
      <View
        style={{
          padding: horizontal ? 13 : 17,
          paddingBottom: 17,
          flex: horizontal ? 1 : undefined,
          gap: 5,
        }}
      >
        <Txt style={{ fontSize: 14, fontWeight: "700", lineHeight: 21 }}>
          {scene.title}
        </Txt>
        <Txt style={{ fontSize: 11, color: colors.muted, lineHeight: 17 }}>
          {scene.subtitle}
        </Txt>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 8,
          }}
        >
          <Icon
            name={completed ? "check" : "clock"}
            size={12}
            color={completed ? colors.green : colors.muted}
          />
          <Txt
            style={{
              fontSize: 10,
              color: completed ? colors.green : colors.muted,
              lineHeight: 16,
            }}
          >
            {completed ? "Déjà pratiqué" : `${scene.minutes} min · Débutant`}
          </Txt>
        </View>
      </View>
    </Pressable>
  );
}
