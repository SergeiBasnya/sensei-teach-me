import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { scenes, type Scene } from "./data/lessons";
import { addWords, dayKey, getStats } from "./lib/progress";
import { useProgress } from "./lib/use-progress";
import { useConnection } from "./lib/use-connection";
import { formatDuration } from "./lib/format";
import { Conversation, type SessionResult } from "./components/conversation";
import { Icon, Mochi, type IconName } from "./components/art";
import { colors, IconButton, Panel, Txt } from "./components/ui";
import { Settings } from "./components/settings";
import { Home } from "./screens/home";
import { Practice } from "./screens/practice";
import { Notebook } from "./screens/notebook";
import { ProgressScreen } from "./screens/progress";
import { appStyles as s } from "./styles";
import { JapaneseSpeechProvider } from "./components/japanese-speech";
type Tab = "home" | "practice" | "words" | "progress";
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Mon espace", icon: "home" },
  { id: "practice", label: "Pratiquer", icon: "chat" },
  { id: "words", label: "Mon carnet", icon: "book" },
  { id: "progress", label: "Mes progrès", icon: "chart" },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Sensei />
    </SafeAreaProvider>
  );
}
function Sensei() {
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const { progress, setProgress, loaded, storageError } = useProgress();
  const [tab, setTab] = useState<Tab>("home");
  const [session, setSession] = useState<Scene | null>(null);
  const [settings, setSettings] = useState(false);
  const {
    connection,
    saved,
    status: connectionStatus,
    error: connectionError,
    suggestedUrl,
    setConnection,
    reconnect,
  } = useConnection();
  const [summary, setSummary] = useState<{
    scene: Scene;
    result: SessionResult;
  } | null>(null);
  const stats = getStats(progress);
  const start = (scene: Scene) => {
    if (scene.id === "free" && !connection) {
      setSettings(true);
      return;
    }
    setSummary(null);
    setSession(scene);
  };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.title = "Sensei — Ton japonais prend la parole";
    const style = document.createElement("style");
    style.textContent =
      'html,body,#root{height:100%;margin:0;background:#F8F7FB}*{box-sizing:border-box}button,[role="button"],input{transition:background-color 120ms,opacity 120ms}button:focus-visible,[role="button"]:focus-visible,input:focus-visible{outline:3px solid #7350C6;outline-offset:4px}input::placeholder{color:#8B8594}@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  const finish = (result: SessionResult) => {
    if (!session) return;
    if (result.turns > 0) {
      setProgress((previous) => {
        const next = addWords(previous, result.words);
        return {
          ...next,
          sessions: [
            ...next.sessions,
            {
              id: String(Date.now()),
              date: dayKey(),
              scenario: session.id,
              seconds: result.seconds,
              turns: result.turns,
            },
          ],
        };
      });
      setSummary({ scene: session, result });
    }
    setSession(null);
  };
  if (!loaded)
    return (
      <SafeAreaView style={s.loading}>
        <Mochi size={130} />
        <ActivityIndicator color={colors.purple} />
        <Txt>Préparation de ton espace…</Txt>
      </SafeAreaView>
    );
  return (
    <JapaneseSpeechProvider connection={connection}>
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        {desktop && (
          <View style={s.sidebar}>
            <Brand />
            <View style={{ gap: 8, marginTop: 48 }}>
              {tabs.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  disabled={!!session}
                  accessibilityState={{
                    selected: tab === item.id && !session,
                    disabled: !!session,
                  }}
                  onPress={() => {
                    if (!session) setTab(item.id);
                  }}
                  style={({ pressed }) => [
                    s.navItem,
                    tab === item.id &&
                      !session && { backgroundColor: colors.light },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    size={21}
                    color={
                      tab === item.id && !session ? colors.purple : colors.muted
                    }
                  />
                  <Txt
                    style={{
                      fontWeight: tab === item.id ? "600" : "500",
                      color:
                        tab === item.id && !session
                          ? colors.purple
                          : colors.muted,
                      fontSize: 14,
                    }}
                  >
                    {item.label}
                  </Txt>
                </Pressable>
              ))}
            </View>
            <View style={{ flex: 1 }} />
            <View style={s.sidebarTutor}>
              <Mochi size={95} />
              <Txt
                style={{ fontWeight: "700", textAlign: "center", fontSize: 14 }}
              >
                Ton compagnon Mochi
              </Txt>
              <Txt
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: colors.muted,
                  lineHeight: 19,
                }}
              >
                Des conversations adaptées à tes premiers pas.
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettings(true)}
              style={s.navItem}
            >
              <Icon name="settings" size={21} />
              <Txt style={{ color: colors.muted, fontSize: 14 }}>Réglages</Txt>
            </Pressable>
            <View style={s.profile}>
              <View style={s.avatar}>
                <Txt style={{ fontWeight: "700", color: colors.purple }}>A</Txt>
              </View>
              <View>
                <Txt style={{ fontSize: 13, fontWeight: "600" }}>
                  Mon apprentissage
                </Txt>
                <Txt style={{ fontSize: 11, color: colors.muted }}>
                  Japonais · Débutant
                </Txt>
              </View>
            </View>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {session ? (
            <Conversation
              key={session.id}
              scene={session}
              progress={progress}
              connection={connection}
              onFinish={finish}
              onConfigure={() => setSettings(true)}
            />
          ) : (
            <>
              <View style={[s.topbar, !desktop && { paddingHorizontal: 22 }]}>
                {desktop ? (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 9,
                      alignItems: "center",
                    }}
                  >
                    <View style={s.japan}>
                      <View style={s.japanSun} />
                    </View>
                    <Txt
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: colors.muted,
                      }}
                    >
                      Japonais
                    </Txt>
                    <View
                      style={{
                        width: 3,
                        height: 3,
                        backgroundColor: "#C4BECE",
                        borderRadius: 2,
                      }}
                    />
                    <Txt style={{ fontSize: 12, color: colors.muted }}>
                      Débutant
                    </Txt>
                  </View>
                ) : (
                  <Brand small />
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 15,
                  }}
                >
                  <View
                    accessibilityLabel={`${stats.streak} jours de pratique consécutifs`}
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <Icon name="fire" size={21} color="#C78B52" />
                    <Txt style={{ fontSize: 13, fontWeight: "600" }}>
                      {stats.streak}
                      <Txt style={{ fontSize: 12, color: colors.muted }}>
                        {" "}
                        {desktop ? "jour" + (stats.streak > 1 ? "s" : "") : ""}
                      </Txt>
                    </Txt>
                  </View>
                  <IconButton
                    name="settings"
                    label="Ouvrir les réglages"
                    onPress={() => setSettings(true)}
                  />
                </View>
              </View>
              <ScrollView
                key={tab}
                contentContainerStyle={[
                  s.page,
                  {
                    paddingHorizontal: desktop ? 38 : 22,
                    paddingTop: desktop ? 32 : 24,
                  },
                ]}
              >
                {storageError ? (
                  <Panel
                    style={{ backgroundColor: "#FCEDEA", marginBottom: 20 }}
                  >
                    <Txt
                      accessibilityRole="alert"
                      style={{ color: "#8B443D", fontSize: 13 }}
                    >
                      {storageError}
                    </Txt>
                  </Panel>
                ) : null}
                {summary && (
                  <Panel
                    style={{
                      backgroundColor: "#EDF4EF",
                      marginBottom: 24,
                      gap: 7,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <Icon name="check" color={colors.green} />
                      <Txt style={{ flex: 1, fontWeight: "700" }}>
                        Séance enregistrée : {summary.scene.title}
                      </Txt>
                      <IconButton
                        name="close"
                        label="Fermer le bilan"
                        onPress={() => setSummary(null)}
                      />
                    </View>
                    <Txt style={{ color: colors.green, fontSize: 13 }}>
                      {summary.result.turns} réponses ·{" "}
                      {formatDuration(summary.result.seconds)} de pratique ·{" "}
                      {summary.result.words.length} expressions rencontrées
                    </Txt>
                  </Panel>
                )}
                {tab === "home" && (
                  <Home
                    progress={progress}
                    desktop={desktop}
                    start={start}
                    setProgress={setProgress}
                  />
                )}
                {tab === "practice" && (
                  <Practice
                    start={start}
                    connected={!!connection}
                    onConfigure={() => setSettings(true)}
                  />
                )}
                {tab === "words" && (
                  <Notebook
                    progress={progress}
                    setProgress={setProgress}
                    onStart={() => start(scenes[0]!)}
                  />
                )}
                {tab === "progress" && (
                  <ProgressScreen
                    progress={progress}
                    start={() => start(scenes[0]!)}
                  />
                )}
              </ScrollView>
              {!desktop && (
                <View style={s.bottomNav}>
                  {tabs.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: tab === item.id }}
                      onPress={() => setTab(item.id)}
                      style={s.bottomNavItem}
                    >
                      <View
                        style={{
                          width: 47,
                          height: 30,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor:
                            tab === item.id ? colors.light : "transparent",
                        }}
                      >
                        <Icon
                          name={item.icon}
                          color={tab === item.id ? colors.purple : colors.muted}
                          size={21}
                        />
                      </View>
                      <Txt
                        style={{
                          fontSize: 10,
                          lineHeight: 16,
                          color: tab === item.id ? colors.purple : colors.muted,
                          fontWeight: tab === item.id ? "700" : "500",
                        }}
                      >
                        {item.id === "home"
                          ? "Accueil"
                          : item.id === "progress"
                            ? "Progrès"
                            : item.label}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
        <Modal
          visible={settings}
          animationType="fade"
          transparent
          onRequestClose={() => setSettings(false)}
        >
          <View style={s.modalBackdrop}>
            <SafeAreaView
              style={{ width: "100%", maxWidth: 540, maxHeight: "94%" }}
            >
              <Settings
                progress={progress}
                setProgress={setProgress}
                connection={connection}
                savedConnection={saved}
                connectionStatus={connectionStatus}
                connectionError={connectionError}
                suggestedUrl={suggestedUrl}
                reconnect={reconnect}
                setConnection={setConnection}
                onClose={() => setSettings(false)}
              />
            </SafeAreaView>
          </View>
        </Modal>
      </SafeAreaView>
    </JapaneseSpeechProvider>
  );
}
function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
      <View
        style={{
          width: small ? 31 : 37,
          height: small ? 31 : 37,
          borderRadius: 13,
          backgroundColor: colors.purple,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt
          style={{
            color: "#FFF",
            fontSize: small ? 18 : 23,
            fontWeight: "600",
            lineHeight: 30,
          }}
        >
          せ
        </Txt>
      </View>
      <Txt
        style={{
          fontSize: small ? 23 : 28,
          fontWeight: "700",
          letterSpacing: -1.1,
          lineHeight: 36,
        }}
      >
        sensei<Txt style={{ color: colors.purple, fontSize: 28 }}>.</Txt>
      </Txt>
    </View>
  );
}
