import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { dayKey, type Progress } from "../lib/progress";
import { Icon } from "./art";
import { colors, Txt } from "./ui";
export function GoalRing({ seconds, goal }: { seconds: number; goal: number }) {
  const fraction = Math.min(1, seconds / (goal * 60));
  return (
    <View
      style={{
        width: 168,
        height: 168,
        marginVertical: 18,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ position: "absolute" }}>
        <Svg width={168} height={168} viewBox="0 0 168 168">
          <Circle
            cx="84"
            cy="84"
            r="68"
            fill="none"
            stroke="#F0ECF7"
            strokeWidth="9"
          />
          <Circle
            cx="84"
            cy="84"
            r="68"
            fill="none"
            stroke={colors.purple}
            strokeWidth="9"
            strokeDasharray={`${fraction * 427.26} 427.26`}
            strokeLinecap="round"
            transform="rotate(-90 84 84)"
          />
        </Svg>
      </View>
      <Txt
        style={{
          fontSize: 37,
          fontWeight: "700",
          letterSpacing: -1,
          lineHeight: 47,
        }}
      >
        {Math.floor(seconds / 60)}
        <Txt style={{ fontSize: 18, fontWeight: "500", color: "#A7A0B4" }}>
          {" "}
          / {goal}
        </Txt>
      </Txt>
      <Txt style={{ fontSize: 12, color: colors.muted }}>
        minutes de pratique
      </Txt>
    </View>
  );
}
export function WeekStrip({ progress }: { progress: Progress }) {
  const now = new Date();
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
    12,
  );
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
        marginTop: 23,
      }}
    >
      {["L", "M", "M", "J", "V", "S", "D"].map((label, i) => {
        const date = new Date(monday);
        date.setDate(date.getDate() + i);
        const today = dayKey(date) === dayKey(now);
        const done = progress.sessions.some(
          (session) => session.date === dayKey(date),
        );
        return (
          <View key={i} style={{ alignItems: "center", gap: 7 }}>
            <Txt
              style={{
                fontSize: 10,
                color: today ? colors.purple : colors.muted,
              }}
            >
              {label}
            </Txt>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 8,
                backgroundColor: done
                  ? colors.purple
                  : today
                    ? "#EBE3FA"
                    : "#F5F3F8",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {done ? (
                <Icon name="check" size={13} color="#FFF" />
              ) : (
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: today ? "#9E82D9" : "#D7D1E0",
                  }}
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
