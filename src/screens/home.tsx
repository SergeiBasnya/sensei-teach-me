import { Pressable, View, useWindowDimensions } from "react-native";
import { useJapaneseSpeech } from "../components/japanese-speech";
import { dailyPhrase, freeScene, scenes, type Scene } from "../data/lessons";
import { addWords, getStats, type Progress } from "../lib/progress";
import { Icon, Mochi } from "../components/art";
import { SceneCard } from "../components/scene-card";
import { GoalRing, WeekStrip } from "../components/progress-widgets";
import { appStyles as s } from "../styles";
import {
  Button,
  colors,
  IconButton,
  Panel,
  SectionTitle,
  Txt,
} from "../components/ui";
export function Home({
  progress,
  desktop,
  start,
  setProgress,
}: {
  progress: Progress;
  desktop: boolean;
  start: (scene: Scene) => void;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
}) {
  const { speakJapanese, error: speechError } = useJapaneseSpeech();
  const { width } = useWindowDimensions();
  const wide = width >= 1260;
  const stats = getStats(progress);
  const favorite = progress.words.some(
    (w) => w.japanese === dailyPhrase.japanese,
  );
  return (
    <View style={{ gap: 28 }}>
      {speechError && (
        <Txt accessibilityRole="alert" style={{ color: "#8B443D" }}>
          {speechError}
        </Txt>
      )}
      <View>
        <Txt
          accessibilityRole="header"
          style={{
            fontSize: desktop ? 33 : 28,
            fontWeight: "700",
            lineHeight: desktop ? 43 : 38,
            letterSpacing: -1,
          }}
        >
          こんにちは !
        </Txt>
      </View>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          gap: 26,
          alignItems: "stretch",
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 29 }}>
          <View style={[s.hero, !desktop && { padding: 24, minHeight: 285 }]}>
            <View
              style={{
                position: "absolute",
                right: desktop ? 4 : 0,
                bottom: desktop ? 16 : 13,
                opacity: 1,
              }}
            >
              <Mochi size={desktop ? 222 : width < 370 ? 112 : 158} />
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                maxWidth: desktop ? "66%" : width < 370 ? "100%" : "72%",
                gap: 15,
                zIndex: 1,
              }}
            >
              <Button
                onPress={() => start(scenes[0]!)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 6,
                  paddingHorizontal: desktop ? 20 : 15,
                }}
              >
                Commencer ma leçon
              </Button>
            </View>
          </View>
          <View>
            <SectionTitle title="Situations" />
            <View
              style={{
                flexDirection: width >= 700 ? "row" : "column",
                gap: 15,
              }}
            >
              {scenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  onPress={() => start(scene)}
                  completed={stats.completed.has(scene.id)}
                  horizontal={width < 700}
                />
              ))}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Démarrer une conversation libre"
            onPress={() => start(freeScene)}
            style={({ pressed }) => [s.freeRow, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 15,
                backgroundColor: "#EFE9FA",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="chat" color={colors.purple} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt style={{ fontWeight: "700", fontSize: 15 }}>
                Envie de parler d’autre chose ?
              </Txt>
              <Txt style={{ color: colors.muted, fontSize: 12 }}>
                Ton quotidien, tes passions, ton prochain voyage.
              </Txt>
            </View>
          </Pressable>
        </View>
        <View
          style={{
            width: wide ? 270 : "100%",
            gap: 22,
            flexDirection: !wide && desktop ? "row" : "column",
          }}
        >
          <Panel
            style={{
              alignItems: "center",
              flex: !wide && desktop ? 1 : undefined,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "stretch",
                justifyContent: "space-between",
              }}
            >
              <Txt style={{ fontWeight: "700", fontSize: 15 }}>
                Ton objectif du jour
              </Txt>
              <Icon name="target" size={18} />
            </View>
            <GoalRing seconds={stats.secondsToday} goal={progress.goal} />
            <Txt
              style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
            >
              {stats.secondsToday >= progress.goal * 60
                ? "Objectif atteint. Bien joué !"
                : `Encore ${Math.max(1, Math.ceil(progress.goal - stats.secondsToday / 60))} min pour ton objectif.`}
            </Txt>
            <WeekStrip progress={progress} />
          </Panel>
          <Panel style={{ gap: 13, flex: !wide && desktop ? 1 : undefined }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Txt style={{ fontSize: 15, fontWeight: "700" }}>
                La phrase du jour
              </Txt>
              <Icon name="leaf" size={18} color="#5A8266" />
            </View>
            <Txt style={{ fontSize: 25, lineHeight: 38, marginTop: 5 }}>
              {dailyPhrase.japanese}
            </Txt>
            {progress.romaji && (
              <Txt style={{ color: colors.purple, fontSize: 13 }}>
                {dailyPhrase.romaji}
              </Txt>
            )}
            <Txt style={{ fontSize: 13, color: colors.muted }}>
              {dailyPhrase.french}
            </Txt>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 7,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => void speakJapanese(dailyPhrase.japanese)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingVertical: 10,
                }}
              >
                <Icon name="volume" size={17} color={colors.purple} />
                <Txt
                  style={{
                    fontSize: 12,
                    color: colors.purple,
                    fontWeight: "600",
                  }}
                >
                  Écouter
                </Txt>
              </Pressable>
              <IconButton
                name="star"
                label={
                  favorite
                    ? "Retirer la phrase du carnet"
                    : "Ajouter la phrase au carnet"
                }
                active={favorite}
                onPress={() =>
                  setProgress((previous) =>
                    favorite
                      ? {
                          ...previous,
                          words: previous.words.filter(
                            (w) => w.japanese !== dailyPhrase.japanese,
                          ),
                        }
                      : addWords(previous, [dailyPhrase]),
                  )
                }
              />
            </View>
          </Panel>
        </View>
      </View>
    </View>
  );
}
