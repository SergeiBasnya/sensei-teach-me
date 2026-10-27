import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { freeScene, type Scene } from "../data/lessons";
import { getLearningStats, lessonScene } from "../lib/learning-plan";
import { getStats, type Progress } from "../lib/progress";
import { formatDuration } from "../lib/format";
import type { SessionResult } from "../components/conversation";
import { Mochi, Icon } from "../components/art";
import { LearningDashboard, LearningPlan } from "../components/learning-panels";
import { Notebook } from "./notebook";
import { Button, colors, IconButton, Txt } from "../components/ui";

type PanelName = "home" | "progress" | "plan" | "words";
export function Home({
  progress,
  setProgress,
  start,
  onConfigure,
  storageError,
  summary,
  dismissSummary,
}: {
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  start: (scene: Scene) => void;
  onConfigure: () => void;
  storageError: string;
  summary: { scene: Scene; result: SessionResult } | null;
  dismissSummary: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const compact = height < 680;
  const [frameWidth, setFrameWidth] = useState(Math.min(width, 920));
  const [panel, setPanel] = useState<PanelName>("home");
  const [page, setPage] = useState(0);
  const [reduced, setReduced] = useState(true);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const travel = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const current = useRef({ panel, height });
  current.current = { panel, height };
  const stats = getStats(progress);
  const learning = getLearningStats(progress);
  const lesson = lessonScene(learning.next);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    pager.current?.scrollTo({ x: page * frameWidth, animated: false });
  }, [frameWidth]);
  const open = (next: PanelName) => {
    if (closing.current) return;
    travel.setValue(next === "progress" ? -height : height);
    setPanel(next);
    Animated.timing(travel, {
      toValue: 0,
      duration: reduced ? 0 : 240,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(travel, {
      toValue: panel === "progress" ? -height : height,
      duration: reduced ? 0 : 210,
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      setPanel("home");
      closing.current = false;
    });
  };
  const actions = useRef({ open, close });
  actions.current = { open, close };
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, g) =>
          current.current.panel === "home" &&
          Math.abs(g.dy) > 24 &&
          Math.abs(g.dy) > Math.abs(g.dx) * 1.4 &&
          (current.current.height >= 650 ||
            g.y0 < 105 ||
            g.y0 > current.current.height - 100),
        onPanResponderRelease: (_event, g) => {
          if (g.dy > 65) actions.current.open("progress");
          else if (g.dy < -65) actions.current.open("plan");
        },
      }),
    [],
  );
  const dismissSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, g) =>
          Math.abs(g.dy) > 20 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
        onPanResponderRelease: (_event, g) => {
          if (
            (current.current.panel === "progress" && g.dy < -30) ||
            (current.current.panel !== "progress" && g.dy > 30)
          )
            actions.current.close();
        },
      }),
    [],
  );
  const selectPage = (next: number) => {
    setPage(next);
    pager.current?.scrollTo({ x: next * frameWidth, animated: !reduced });
  };
  const startScene = (scene: Scene) => {
    setPanel("home");
    start(scene);
  };
  return (
    <View
      style={h.root}
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
      {...swipe.panHandlers}
    >
      <View style={[h.top, { paddingVertical: compact ? 12 : 20 }]}>
        <View accessibilityLabel="Japonais, niveau 1, débutant" style={h.level}>
          <View style={h.flag} />
          <Txt style={{ fontSize: 14, fontWeight: "600" }}>L1</Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => open("progress")}
          style={h.edgeButton}
        >
          <Txt style={h.edgeText}>Ma progression</Txt>
          <View style={h.grip} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View
            accessibilityLabel={`${stats.streak} jours de série`}
            style={h.streak}
          >
            <Txt style={{ fontWeight: "600" }}>{stats.streak}</Txt>
            <Icon name="fire" size={19} color="#B58120" />
          </View>
          <IconButton
            name="settings"
            label="Ouvrir les réglages"
            onPress={onConfigure}
            size={34}
          />
        </View>
      </View>
      {!!storageError && (
        <Txt
          accessibilityRole="alert"
          style={{ padding: 18, color: "#8B443D", fontSize: 13 }}
        >
          {storageError}
        </Txt>
      )}
      {summary && (
        <View style={h.summary}>
          <View style={{ flex: 1, gap: 3 }}>
            <Txt style={{ fontWeight: "600", fontSize: 14 }}>
              Séance enregistrée
            </Txt>
            <Txt style={{ fontSize: 12, color: colors.muted }}>
              {summary.result.turns} réponse
              {summary.result.turns > 1 ? "s" : ""} ·{" "}
              {formatDuration(summary.result.seconds)} de pratique
            </Txt>
          </View>
          <IconButton
            name="close"
            label="Fermer le bilan"
            onPress={dismissSummary}
            size={34}
          />
        </View>
      )}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / frameWidth))
        }
        onScroll={(event) => {
          const next = Math.round(
            event.nativeEvent.contentOffset.x / frameWidth,
          );
          if (next !== page) setPage(next);
        }}
        scrollEventThrottle={100}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: "stretch" }}
      >
        {[0, 1].map((index) => (
          <ScrollView
            key={index}
            accessibilityElementsHidden={page !== index}
            importantForAccessibility={
              page !== index ? "no-hide-descendants" : "auto"
            }
            aria-hidden={page !== index}
            style={{ width: frameWidth }}
            contentContainerStyle={[
              h.stage,
              { paddingVertical: compact ? 18 : 34 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Mochi
              size={compact ? 112 : 174}
              active={panel === "home" && page === index}
              happy={!!summary && index === 0}
            />
            <View
              style={{
                gap: 12,
                maxWidth: 540,
                alignItems: "center",
                paddingHorizontal: 12,
              }}
            >
              <Txt
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  color: colors.muted,
                  textAlign: "center",
                }}
              >
                {index === 0 ? lesson.subtitle : "Avec Mochi"}
              </Txt>
              <Txt
                accessibilityRole="header"
                style={{
                  fontSize: compact ? 28 : 36,
                  lineHeight: compact ? 37 : 47,
                  fontWeight: "600",
                  letterSpacing: -0.6,
                  textAlign: "center",
                }}
              >
                {index === 0 ? lesson.title : "Conversation libre"}
              </Txt>
            </View>
            <Button
              disabled={page !== index}
              onPress={() => start(index === 0 ? lesson : freeScene)}
              style={{
                borderRadius: 32,
                minHeight: 58,
                paddingHorizontal: 30,
                marginTop: 8,
              }}
            >
              {index === 0 ? "Commencer ma leçon" : "Parler librement"}
            </Button>
          </ScrollView>
        ))}
      </ScrollView>
      <View style={h.pages}>
        {[0, 1].map((index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={
              index === 0 ? "Voir ma leçon" : "Voir la conversation libre"
            }
            accessibilityState={{ selected: page === index }}
            onPress={() => selectPage(index)}
            style={{ padding: 12 }}
          >
            <View
              style={{
                height: 7,
                width: page === index ? 22 : 7,
                borderRadius: 5,
                backgroundColor: page === index ? colors.purple : "#DED9E5",
              }}
            />
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => open("plan")}
        style={[h.bottom, { paddingVertical: compact ? 14 : 23 }]}
      >
        <View style={h.grip} />
        <Txt style={h.edgeText}>Mon plan</Txt>
      </Pressable>
      <Modal
        visible={panel !== "home"}
        transparent
        animationType="none"
        onRequestClose={close}
      >
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: "#F8F7FA",
            transform: [{ translateY: travel }],
          }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={h.panelHeader} {...dismissSwipe.panHandlers}>
              <View
                style={[
                  h.grip,
                  {
                    position: "absolute",
                    top: 8,
                    left: "50%",
                    marginLeft: -14,
                  },
                ]}
              />
              <Txt
                accessibilityRole="header"
                style={{ fontSize: 21, fontWeight: "600", flex: 1 }}
              >
                {panel === "progress"
                  ? "Ma progression"
                  : panel === "plan"
                    ? "Mon plan"
                    : "Mon carnet"}
              </Txt>
              <IconButton
                name="close"
                label="Retour à ma leçon"
                onPress={close}
              />
            </View>
            <ScrollView
              contentContainerStyle={{
                padding: Math.min(26, frameWidth / 14),
                paddingBottom: 50,
                maxWidth: 760,
                width: "100%",
                alignSelf: "center",
              }}
              keyboardShouldPersistTaps="handled"
            >
              {panel === "progress" && (
                <LearningDashboard
                  progress={progress}
                  practice={() => {
                    setPanel("home");
                    selectPage(1);
                  }}
                  notebook={() => open("words")}
                />
              )}
              {panel === "plan" && (
                <LearningPlan
                  progress={progress}
                  start={(goal) => startScene(lessonScene(goal))}
                />
              )}
              {panel === "words" && (
                <Notebook
                  progress={progress}
                  setProgress={setProgress}
                  onStart={() => startScene(lesson)}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </Modal>
    </View>
  );
}
const h = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    backgroundColor: "#FFF",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: "#FAF9F7",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    gap: 5,
  },
  level: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderRadius: 24,
    backgroundColor: "#F0EDE8",
  },
  flag: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#D52F50" },
  edgeButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 52,
    flexShrink: 1,
    paddingHorizontal: 4,
  },
  edgeText: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
    color: colors.purple,
    textAlign: "center",
  },
  grip: { width: 28, height: 4, borderRadius: 3, backgroundColor: "#CFC8DB" },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 22,
    backgroundColor: "#F5F0E6",
  },
  stage: {
    flexGrow: 1,
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    gap: 23,
    paddingHorizontal: 22,
  },
  pages: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 12,
  },
  bottom: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FAF9F7",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 21,
    paddingBottom: 10,
    paddingHorizontal: 20,
    minHeight: 82,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#F7F5FB",
  },
});
