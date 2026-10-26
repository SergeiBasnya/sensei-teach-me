import { View } from "react-native";
import { scenes, freeScene } from "../data/lessons";
import { getStats, type Progress } from "../lib/progress";
import { formatDuration } from "../lib/format";
import { WeekStrip } from "../components/progress-widgets";
import { Icon, type IconName } from "../components/art";
import { appStyles as s } from "../styles";
import {
  Badge,
  Button,
  colors,
  IconButton,
  Panel,
  SectionTitle,
  Txt,
} from "../components/ui";
export function ProgressScreen({
  progress,
  start,
}: {
  progress: Progress;
  start: () => void;
}) {
  const stats = getStats(progress);
  return (
    <View style={{ gap: 24 }}>
      <SectionTitle
        title="Chaque conversation compte"
        detail="Ta pratique réelle, enregistrée sur cet appareil."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          { n: progress.sessions.length, label: "conversations", icon: "chat" },
          {
            n: stats.totalMinutes,
            label: "minutes de pratique",
            icon: "clock",
          },
          { n: stats.streak, label: "jours consécutifs", icon: "fire" },
        ].map((item) => (
          <Panel key={item.label} style={{ flex: 1, minWidth: 140, gap: 8 }}>
            <Icon name={item.icon as IconName} color={colors.purple} />
            <Txt style={{ fontSize: 34, lineHeight: 44, fontWeight: "700" }}>
              {item.n}
            </Txt>
            <Txt style={{ color: colors.muted, fontSize: 12 }}>
              {item.label}
            </Txt>
          </Panel>
        ))}
      </View>
      <Panel>
        <SectionTitle title="Cette semaine" />
        <WeekStrip progress={progress} />
      </Panel>
      <SectionTitle title="Tes dernières conversations" />
      {progress.sessions.length === 0 ? (
        <Panel style={{ gap: 16 }}>
          <Txt style={{ color: colors.muted }}>
            Ta première séance apparaîtra ici. Quelques phrases suffisent pour
            démarrer.
          </Txt>
          <Button onPress={start} style={{ alignSelf: "flex-start" }}>
            Commencer à pratiquer
          </Button>
        </Panel>
      ) : (
        [...progress.sessions]
          .reverse()
          .slice(0, 10)
          .map((session) => (
            <Panel
              key={session.id}
              style={{ flexDirection: "row", gap: 14, alignItems: "center" }}
            >
              <Icon name="chat" color={colors.purple} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: "600" }}>
                  {[...scenes, freeScene].find(
                    (scene) => scene.id === session.scenario,
                  )?.title || "Conversation"}
                </Txt>
                <Txt style={{ color: colors.muted, fontSize: 12 }}>
                  {session.date.split("-").reverse().join("/")} ·{" "}
                  {session.turns} réponses
                </Txt>
              </View>
              <Txt style={{ fontSize: 12 }}>
                {formatDuration(session.seconds)}
              </Txt>
            </Panel>
          ))
      )}
    </View>
  );
}
