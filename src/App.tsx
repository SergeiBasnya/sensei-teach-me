import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Scene } from "./data/lessons";
import { addWords, dayKey } from "./lib/progress";
import { useProgress } from "./lib/use-progress";
import { useConnection } from "./lib/use-connection";
import { Conversation, type SessionResult } from "./components/conversation";
import { Mochi } from "./components/art";
import { colors, Txt } from "./components/ui";
import { Settings } from "./components/settings";
import { Home } from "./screens/home";
import { JapaneseSpeechProvider } from "./components/japanese-speech";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Sensei />
    </SafeAreaProvider>
  );
}
function Sensei() {
  const { progress, setProgress, loaded, storageError } = useProgress();
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
      'html,body,#root{height:100%;margin:0;background:#FFF}*{box-sizing:border-box}button,[role="button"],input{transition:background-color 120ms,opacity 120ms}button:focus-visible,[role="button"]:focus-visible,input:focus-visible{outline:3px solid #7350C6;outline-offset:3px}input::placeholder{color:#8B8594}@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}';
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
              ...(session.lessonId ? { lessonId: session.lessonId } : {}),
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
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          backgroundColor: "#FFF",
        }}
      >
        <Mochi size={130} />
        <ActivityIndicator color={colors.purple} />
        <Txt>Préparation de ton espace…</Txt>
      </SafeAreaView>
    );
  return (
    <JapaneseSpeechProvider connection={connection}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#FFF" }}
        edges={["top", "bottom"]}
      >
        {session ? (
          <Conversation
            key={session.lessonId || session.id}
            scene={session}
            progress={progress}
            connection={connection}
            onFinish={finish}
            onConfigure={() => setSettings(true)}
          />
        ) : (
          <Home
            progress={progress}
            setProgress={setProgress}
            start={start}
            onConfigure={() => setSettings(true)}
            storageError={storageError}
            summary={summary}
            dismissSummary={() => setSummary(null)}
          />
        )}
        <Modal
          visible={settings}
          animationType="fade"
          transparent
          onRequestClose={() => setSettings(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#29233655",
              justifyContent: "center",
              alignItems: "center",
              padding: 16,
            }}
          >
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
