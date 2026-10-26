import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { chapters, getLesson, type Lesson } from "../../shared/learning-plan";
import { scenes } from "../data/lessons";
import { getLearningStats } from "../lib/learning-plan";
import { getStats, type Progress } from "../lib/progress";
import { formatDuration } from "../lib/format";
import { Icon } from "./art";
import { WeekStrip } from "./progress-widgets";
import { Button, colors, Panel, Txt } from "./ui";

export function LearningPlan({
  progress,
  start,
}: {
  progress: Progress;
  start: (lesson: Lesson) => void;
}) {
  const learning = getLearningStats(progress);
  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 5 }}>
        <Txt style={{ fontSize: 23, fontWeight: "700" }}>
          Tes premiers échanges
        </Txt>
        <Txt style={{ color: colors.muted }}>
          {learning.count} / {learning.total} objectifs pratiqués
        </Txt>
      </View>
      {chapters.map((chapter, index) => (
        <Panel key={chapter.title} style={{ padding: 20, gap: 20 }}>
          <View style={{ gap: 4 }}>
            <Txt style={p.eyebrow}>Chapitre {index + 1}</Txt>
            <Txt style={{ fontSize: 21, lineHeight: 29, fontWeight: "600" }}>
              {chapter.title}
            </Txt>
          </View>
          <View>
            {chapter.lessons.map((lesson, i) => {
              const practiced = learning.practiced.has(lesson.id);
              const current = learning.next.id === lesson.id;
              return (
                <View
                  key={lesson.id}
                  style={{ flexDirection: "row", minHeight: 104 }}
                >
                  <View style={{ width: 36, alignItems: "center" }}>
                    {i < chapter.lessons.length - 1 && (
                      <Svg
                        width={36}
                        height="100%"
                        style={StyleSheet.absoluteFill}
                        aria-hidden={true}
                      >
                        <Line
                          x1={18}
                          y1={28}
                          x2={18}
                          y2="100%"
                          stroke="#DCD7E9"
                          strokeWidth={3}
                        />
                      </Svg>
                    )}
                    <View
                      style={[
                        p.node,
                        {
                          backgroundColor:
                            practiced || current ? colors.purple : "#EAE6F2",
                        },
                      ]}
                    >
                      {practiced ? (
                        <Icon name="check" size={17} color="#FFF" />
                      ) : current ? (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: "#FFF",
                          }}
                        />
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${lesson.title}, ${practiced ? "déjà pratiqué" : current ? "prochaine étape" : "disponible"}`}
                    onPress={() => start(lesson)}
                    style={({ pressed }) => [
                      p.objective,
                      {
                        backgroundColor: current ? colors.light : "#F8F7FA",
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontSize: 12,
                        color: current ? colors.purple : colors.muted,
                      }}
                    >
                      {practiced
                        ? "Pratiqué"
                        : current
                          ? "Prochaine étape"
                          : "Objectif"}
                    </Txt>
                    <Txt
                      style={{
                        fontSize: 17,
                        lineHeight: 25,
                        fontWeight: "600",
                      }}
                    >
                      {lesson.title}
                    </Txt>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Panel>
      ))}
      <Txt style={{ fontSize: 13, lineHeight: 21, color: colors.muted }}>
        Un objectif est marqué pratiqué après une séance avec au moins une
        réponse. Tu peux le refaire à tout moment.
      </Txt>
    </View>
  );
}

export function LearningDashboard({
  progress,
  practice,
  notebook,
}: {
  progress: Progress;
  practice: () => void;
  notebook: () => void;
}) {
  const stats = getStats(progress);
  const learning = getLearningStats(progress);
  const last = progress.sessions.at(-1);
  const lastTitle = last
    ? getLesson(last.lessonId)?.title ||
      scenes.find((scene) => scene.id === last.scenario)?.title ||
      "Conversation libre"
    : learning.next.title;
  return (
    <View style={{ gap: 18 }}>
      <View style={p.history}>
        <Txt style={{ color: "#FFF", fontSize: 17, fontWeight: "500" }}>
          Historique
        </Txt>
        <View
          style={{
            backgroundColor: "#FFF",
            padding: 22,
            borderRadius: 24,
            gap: 13,
          }}
        >
          <Txt style={{ color: colors.muted, fontSize: 13 }}>
            {last ? "Dernière séance" : "À commencer"}
          </Txt>
          <Txt style={{ fontSize: 24, lineHeight: 32, fontWeight: "600" }}>
            {lastTitle}
          </Txt>
          <Txt style={{ color: colors.muted, fontSize: 13 }}>
            {last
              ? `${last.turns} réponse${last.turns > 1 ? "s" : ""} · ${formatDuration(last.seconds)}`
              : "Niveau 1 · Débutant"}
          </Txt>
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            {learning.count} / {learning.total} objectifs pratiqués
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <Panel style={p.metric}>
          <View style={p.number}>
            <Txt
              style={{
                color: "#FFF",
                fontSize: 27,
                lineHeight: 35,
                fontWeight: "600",
              }}
            >
              1
            </Txt>
          </View>
          <Txt style={{ fontSize: 16, fontWeight: "600" }}>Niveau</Txt>
          <Txt style={{ fontSize: 13, color: colors.muted }}>Débutant</Txt>
        </Panel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mon carnet, ${progress.words.length} mots enregistrés`}
          onPress={notebook}
          style={({ pressed }) => [
            p.metric,
            {
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 22,
              backgroundColor: "#FFF",
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Txt
            style={{
              fontSize: 38,
              lineHeight: 46,
              color: colors.purple,
              fontWeight: "600",
            }}
          >
            {progress.words.length}
          </Txt>
          <Txt style={{ fontSize: 16, fontWeight: "600", textAlign: "center" }}>
            Vocabulaire
          </Txt>
          <Txt
            style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
          >
            Dans ton carnet
          </Txt>
        </Pressable>
      </View>
      <Button
        onPress={practice}
        icon="chat"
        style={{ minHeight: 96, borderRadius: 24 }}
      >
        Pratique libre
      </Button>
      <Panel style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <View
          style={{ backgroundColor: "#FFF3D6", padding: 15, borderRadius: 30 }}
        >
          <Icon name="fire" color="#B78320" size={30} />
        </View>
        <Txt style={{ fontSize: 39, lineHeight: 48, fontWeight: "600" }}>
          {stats.streak}
        </Txt>
        <Txt style={{ flex: 1, color: colors.muted }}>
          jour{stats.streak > 1 ? "s" : ""} de série
        </Txt>
      </Panel>
      <Panel style={{ gap: 18 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 15,
          }}
        >
          <Txt style={{ fontWeight: "600" }}>Ton objectif du jour</Txt>
          <Txt style={{ color: colors.muted, fontSize: 13 }}>
            {Math.floor(stats.secondsToday / 60)} / {progress.goal} min
          </Txt>
        </View>
        <WeekStrip progress={progress} />
      </Panel>
      {progress.sessions.length > 0 && (
        <View style={{ gap: 12, paddingTop: 8 }}>
          <Txt style={{ fontSize: 19, fontWeight: "600" }}>Tes séances</Txt>
          {progress.sessions
            .slice(-8)
            .reverse()
            .map((session) => (
              <View
                key={session.id}
                style={{
                  paddingVertical: 14,
                  gap: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Txt style={{ fontWeight: "600" }}>
                  {getLesson(session.lessonId)?.title ||
                    scenes.find((scene) => scene.id === session.scenario)
                      ?.title ||
                    "Conversation libre"}
                </Txt>
                <Txt style={{ fontSize: 13, color: colors.muted }}>
                  {session.date} · {formatDuration(session.seconds)} ·{" "}
                  {session.turns} réponse{session.turns > 1 ? "s" : ""}
                </Txt>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}
const p = StyleSheet.create({
  eyebrow: { fontSize: 12, color: colors.muted },
  node: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  objective: {
    flex: 1,
    minHeight: 82,
    marginLeft: 10,
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    gap: 4,
    justifyContent: "center",
  },
  history: {
    backgroundColor: "#46317C",
    borderRadius: 28,
    padding: 22,
    gap: 18,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    minHeight: 165,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  number: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
});
