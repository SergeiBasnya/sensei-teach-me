import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Icon, type IconName } from "./art";

export const colors = {
  bg: "#F8F7FB",
  ink: "#292336",
  muted: "#77717F",
  purple: "#7350C6",
  light: "#EFE9FB",
  line: "#EAE7EF",
  white: "#FFFFFF",
  green: "#3B765C",
};
export function Txt({
  children,
  style,
  ...props
}: { children?: ReactNode; style?: StyleProp<TextStyle> } & Omit<
  React.ComponentProps<typeof Text>,
  "style"
>) {
  return (
    <Text
      {...props}
      style={[
        {
          fontSize: 15,
          color: colors.ink,
          lineHeight: 23,
          fontFamily:
            Platform.OS === "web"
              ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  children,
  onPress,
  icon,
  secondary = false,
  disabled = false,
  loading = false,
  style,
}: {
  children: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.purple : "#FFF"} />
      ) : (
        <>
          <Txt style={[s.buttonText, secondary && { color: colors.purple }]}>
            {children}
          </Txt>
          {icon && (
            <Icon
              name={icon}
              size={18}
              color={secondary ? colors.purple : "#FFF"}
            />
          )}
        </>
      )}
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  active,
  disabled = false,
  size = 42,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
        backgroundColor: active
          ? colors.light
          : pressed
            ? "#EDE9F3"
            : "transparent",
      })}
    >
      <Icon
        name={name}
        color={active ? colors.purple : colors.muted}
        size={20}
        filled={active && name === "star"}
      />
    </Pressable>
  );
}
export function Badge({
  children,
  icon,
  background = "#F0EBFA",
  color = colors.purple,
}: {
  children: ReactNode;
  icon?: IconName;
  background?: string;
  color?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        backgroundColor: background,
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: 20,
      }}
    >
      {icon && <Icon name={icon} size={14} color={color} />}
      <Txt style={{ fontSize: 11, fontWeight: "700", color, lineHeight: 17 }}>
        {children}
      </Txt>
    </View>
  );
}
export function SectionTitle({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={{ marginBottom: 18, gap: 3 }}>
      <Txt
        accessibilityRole="header"
        style={{
          fontSize: 21,
          fontWeight: "700",
          letterSpacing: -0.5,
          lineHeight: 28,
        }}
      >
        {title}
      </Txt>
      {detail && (
        <Txt style={{ color: colors.muted, fontSize: 13 }}>{detail}</Txt>
      )}
    </View>
  );
}
export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.panel, style]}>{children}</View>;
}
const s = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 14,
  },
  secondary: { backgroundColor: colors.light },
  buttonText: { color: "#FFF", fontWeight: "600", fontSize: 14 },
  panel: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
  },
});
