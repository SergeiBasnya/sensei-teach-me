import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Scene } from "./data/lessons";
import { addWords, dayKey } from "./lib/progress";
import { useProgress } from "./lib/use-progress";
import { useConnection } from "./lib/use-connection";
import {
  storedReadingTexts,
  fetchStoredReadings,
  applyStoredReadings,
} from "./lib/reading-refresh";
import { Conversation, type SessionResult } from "./components/conversation";
import { Mochi } from "./components/art";
import { colors, Txt } from "./components/ui";
import { Settings } from "./components/settings";
import { VoiceLab } from "./components/voice-lab";
import { Home } from "./screens/home";
import { JapaneseSpeechProvider } from "./components/japanese-speech";
import {
  recordLearningTurn,
  rememberLesson,
  exposeModel,
  type LearningTurn,
} from "../shared/learning-memory";

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
  const [voiceLab, setVoiceLab] = useState(false);
  const {
    connection,
    saved,
    status: connectionStatus,
    error: connectionError,
    suggestedUrl,
    setConnection,
    reconnect,
  } = useConnection();
  const readingRefresh = useRef("");
  useEffect(() => {
    if (!loaded || !connection || session || voiceLab) return;
    const texts = storedReadingTexts(progress);
    const signature = JSON.stringify([connection.url, texts]);
    if (signature === readingRefresh.current || !texts.length) return;
    readingRefresh.current = signature;
    const controller = new AbortController();
    let applied = false;
    void fetchStoredReadings(connection, texts, controller.signal)
      .then((readings) => {
        if (!controller.signal.aborted) {
          applied = true;
          setProgress((previous) => applyStoredReadings(previous, readings));
        }
      })
      .catch(() => {
        // Cleanup owns cancellation; an old callback must not reset a newer request.
      });
    return () => {
      controller.abort();
      if (!applied && readingRefresh.current === signature)
        readingRefresh.current = "";
    };
  }, [
    loaded,
    connection,
    session,
    voiceLab,
    progress.words,
    progress.learning.items,
    setProgress,
  ]);
  const [summary, setSummary] = useState<{
    scene: Scene;
    result: SessionResult;
  } | null>(null);
  const start = (scene: Scene) => {
    if (
      (scene.id === "free" && !connection) ||
      (scene.review && !connection?.oral)
    ) {
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
        const learning =
          session.lessonId && !session.review
            ? rememberLesson(
                next.learning,
                session.lessonId,
                session.turns[0]!.suggestion,
                session.id,
                new Date().toISOString(),
              )
            : next.learning;
        return {
          ...next,
          learning,
          sessions: [
            ...next.sessions,
            {
              id: String(Date.now()),
              date: dayKey(),
              scenario: session.id,
              ...(session.lessonId ? { lessonId: session.lessonId } : {}),
              ...(session.review
                ? { reviewId: session.review.id, reviewTitle: session.title }
                : {}),
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
        {voiceLab ? (
          <VoiceLab
            connection={connection}
            onClose={() => setVoiceLab(false)}
          />
        ) : session ? (
          <Conversation
            key={session.review?.id || session.lessonId || session.id}
            scene={session}
            progress={progress}
            connection={connection}
            onFinish={finish}
            onConfigure={() => setSettings(true)}
            onLearning={(event: LearningTurn) =>
              setProgress((previous) => ({
                ...previous,
                learning: recordLearningTurn(previous.learning, event),
              }))
            }
            onExposeReview={(id) =>
              setProgress((previous) => ({
                ...previous,
                learning: exposeModel(
                  previous.learning,
                  id,
                  new Date().toISOString(),
                ),
              }))
            }
            storageError={storageError}
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
                onOpenVoiceLab={() => {
                  setSettings(false);
                  setSession(null);
                  setVoiceLab(true);
                }}
              />
            </SafeAreaView>
          </View>
        </Modal>
      </SafeAreaView>
    </JapaneseSpeechProvider>
  );
}
