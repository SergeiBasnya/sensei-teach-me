import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  useWindowDimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Speech from "expo-speech";
import { File } from "expo-file-system";
import type { Phrase, TutorReply } from "../../shared/contracts";
import type { Scene } from "../data/lessons";
import type { Progress } from "../lib/progress";
import { apiRequest, requestTurn, type Connection } from "../lib/api";
import { Icon, Mochi } from "./art";
import { Badge, Button, colors, IconButton, Txt } from "./ui";

type Message = {
  id: number;
  role: "assistant" | "user";
  phrase: Phrase;
  correction?: TutorReply["correction"];
};
export type SessionResult = { seconds: number; turns: number; words: Phrase[] };
export function Conversation({
  scene,
  progress,
  connection,
  onFinish,
  onConfigure,
}: {
  scene: Scene;
  progress: Progress;
  connection: Connection | null;
  onFinish: (result: SessionResult) => void;
  onConfigure: () => void;
}) {
  const { width } = useWindowDimensions();
  const first = scene.turns[0]!;
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "assistant", phrase: first.tutor },
  ]);
  const [turn, setTurn] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const words = useRef<Phrase[]>([]);
  const activeSeconds = useRef(0);
  const foreground = useRef(AppState.currentState === "active");
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const abort = useRef(new AbortController());
  const locked = useRef(false);
  const mounted = useRef(true);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recording = useAudioRecorderState(recorder, 200);
  const recordingActive = useRef(false);
  const finish = () => {
    if (busy || recordingActive.current) return;
    void Speech.stop();
    onFinish({
      seconds: Math.max(1, activeSeconds.current),
      turns: messages.filter((m) => m.role === "user").length,
      words: words.current,
    });
  };
  useEffect(() => {
    const appState = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
      if (state !== "active" && recordingActive.current) {
        recordingActive.current = false;
        void recorder.stop();
        setError(
          "Enregistrement interrompu. Appuie sur le micro pour recommencer.",
        );
      }
    });
    const timer = setInterval(() => {
      if (foreground.current) {
        activeSeconds.current++;
        setElapsedSeconds(activeSeconds.current);
      }
    }, 1000);
    return () => {
      mounted.current = false;
      abort.current.abort();
      clearInterval(timer);
      appState.remove();
      void Speech.stop();
      if (recordingActive.current) void recorder.stop();
    };
  }, [recorder]);
  const speak = (text: string) => {
    void Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language: "ja-JP",
      rate: 0.78,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false);
        setError(
          "La voix japonaise n’est pas disponible sur cet appareil. Tu peux continuer avec le texte.",
        );
      },
    });
  };
  const send = async (text: string, guided?: Phrase) => {
    if (locked.current || !text.trim() || complete) return;
    if (!connection && !guided) {
      setError(
        "Pour répondre librement ou utiliser le micro, connecte le serveur IA dans les réglages. Les exemples guidés restent disponibles.",
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      let reply: Phrase;
      let correction: TutorReply["correction"] = null;
      let newWords: Phrase[] = [];
      if (connection) {
        const result = await requestTurn(
          connection,
          scene.id,
          messages.map((m) => ({ role: m.role, content: m.phrase.japanese })),
          text,
          abort.current.signal,
        );
        reply = result.reply;
        correction = result.correction;
        newWords = result.vocabulary;
      } else {
        const next = scene.turns[turn + 1];
        reply = next ? next.tutor : scene.ending;
        newWords = guided ? [guided] : [];
        if (!next) setComplete(true);
      }
      if (!mounted.current) return;
      const userPhrase = guided || { japanese: text, romaji: "", french: "" };
      setMessages((previous) => [
        ...previous,
        { id: Date.now(), role: "user", phrase: userPhrase, correction },
        { id: Date.now() + 1, role: "assistant", phrase: reply },
      ]);
      words.current.push(...newWords);
      setInput("");
      setTurn((previous) => previous + 1);
      if (progress.autoSpeak) speak(reply.japanese);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "La réponse a échoué. Réessaie.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const transcribe = async () => {
    if (!connection || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await recorder.stop();
      recordingActive.current = false;
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const uri = recorder.uri;
      if (!uri) throw new Error("Aucun enregistrement trouvé. Réessaie.");
      let audio: string;
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(String(reader.result).split(",")[1] || "");
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const file = new File(uri);
        audio = await file.base64();
        file.delete();
      }
      const result = await apiRequest(
        connection,
        "/api/transcribe",
        { audio, format: Platform.OS === "web" ? "webm" : "m4a" },
        abort.current.signal,
      );
      if (!mounted.current) return;
      if (
        typeof result !== "object" ||
        result === null ||
        !("text" in result) ||
        typeof result.text !== "string" ||
        !result.text.trim()
      )
        throw new Error("Je n’ai pas entendu de phrase. Tu peux recommencer.");
      setInput(result.text);
      setShowKeyboard(true);
    } catch (cause) {
      recordingActive.current = false;
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Le micro est indisponible.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const toggleRecording = async () => {
    if (!connection) {
      setError(
        "Connecte ton serveur IA dans les réglages pour transcrire ta voix.",
      );
      return;
    }
    if (locked.current) return;
    if (recordingActive.current) {
      await transcribe();
      return;
    }
    locked.current = true;
    setError("");
    try {
      await Speech.stop();
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "L’accès au micro est refusé. Autorise-le dans les réglages de ton appareil ou réponds au clavier.",
        );
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingActive.current = true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Le micro est indisponible.",
      );
    } finally {
      locked.current = false;
    }
  };
  useEffect(() => {
    if (recording.isRecording && recording.durationMillis >= 59_000)
      void transcribe();
  });
  const suggestion = scene.turns[connection ? 0 : turn]?.suggestion;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, minHeight: 0 }}
    >
      <View
        style={[
          s.header,
          width < 370 && { flexDirection: "column", alignItems: "stretch" },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 13,
            alignItems: "center",
            flex: 1,
          }}
        >
          <IconButton
            name="back"
            label="Terminer et revenir à l’accueil"
            onPress={finish}
          />
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: "700", fontSize: 18 }}>{scene.title}</Txt>
            <Txt style={{ fontSize: 12, color: colors.muted }}>
              {scene.place} · Débutant
            </Txt>
          </View>
        </View>
        <Badge icon={connection ? "spark" : "book"}>
          {connection ? "IA connectée" : "Exercice guidé"}
        </Badge>
      </View>
      <ScrollView
        ref={scroll}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
        contentContainerStyle={s.messages}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <Mochi size={100} />
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            {connection
              ? "Mochi s’adapte à tes réponses."
              : "Écoute Mochi, puis essaie les réponses proposées."}
          </Txt>
        </View>
        {messages.map((message) => (
          <View
            key={message.id}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              width: "92%",
              maxWidth: 560,
              gap: 8,
            }}
          >
            <Txt
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: colors.muted,
                marginLeft: 3,
              }}
            >
              {message.role === "assistant" ? "MOCHI" : "TOI"}
            </Txt>
            <View
              style={[
                s.bubble,
                message.role === "user" && {
                  backgroundColor: colors.light,
                  borderColor: colors.light,
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <Txt style={{ fontSize: 20, lineHeight: 33, flex: 1 }}>
                  {message.phrase.japanese}
                </Txt>
                <IconButton
                  name="volume"
                  label={`Écouter : ${message.phrase.japanese}`}
                  onPress={() => speak(message.phrase.japanese)}
                  size={32}
                />
              </View>
              {progress.romaji && !!message.phrase.romaji && (
                <Txt
                  style={{ color: colors.purple, fontSize: 13, marginTop: 6 }}
                >
                  {message.phrase.romaji}
                </Txt>
              )}
              {progress.translation && !!message.phrase.french && (
                <Txt
                  style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}
                >
                  {message.phrase.french}
                </Txt>
              )}
            </View>
            {message.correction && (
              <View style={s.correction}>
                <Txt style={{ fontWeight: "700", fontSize: 13 }}>
                  Une petite correction
                </Txt>
                <Txt style={{ fontSize: 13 }}>
                  Ta phrase : {message.correction.original}
                </Txt>
                <Txt style={{ fontSize: 13 }}>
                  Plus naturel : {message.correction.corrected}
                </Txt>
                <Txt style={{ fontSize: 13, color: colors.muted }}>
                  {message.correction.explanation}
                </Txt>
              </View>
            )}
          </View>
        ))}
        {busy && (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <ActivityIndicator color={colors.purple} />
            <Txt style={{ fontSize: 13, color: colors.muted }}>
              Mochi prépare la suite…
            </Txt>
          </View>
        )}
        {error ? (
          <View accessibilityRole="alert" style={s.error}>
            <Txt style={{ fontSize: 13, color: "#8B443D" }}>{error}</Txt>
            {!connection && (
              <Button secondary onPress={onConfigure}>
                Ouvrir les réglages
              </Button>
            )}
          </View>
        ) : null}
        {complete && (
          <View style={s.correction}>
            <Txt style={{ fontWeight: "700" }}>
              Première conversation, c’est fait.
            </Txt>
            <Txt style={{ color: colors.muted, fontSize: 13 }}>
              Retrouve les {words.current.length} phrases rencontrées dans ton
              carnet. Cet exercice guidé n’évalue pas ta prononciation.
            </Txt>
            <Button onPress={finish} icon="check">
              Terminer la séance
            </Button>
          </View>
        )}
      </ScrollView>
      {!complete && (
        <View style={s.composer}>
          {showHelp && suggestion && (
            <Pressable
              disabled={busy || recording.isRecording}
              accessibilityRole="button"
              accessibilityLabel={`Utiliser la réponse : ${suggestion.japanese}`}
              onPress={() => void send(suggestion.japanese, suggestion)}
              style={({ pressed }) => [
                s.suggestion,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Icon name="spark" size={15} color={colors.purple} />
                <Txt
                  style={{
                    fontSize: 11,
                    color: colors.purple,
                    fontWeight: "700",
                  }}
                >
                  TU PEUX RÉPONDRE
                </Txt>
              </View>
              <Txt style={{ fontSize: 16, marginTop: 5 }}>
                {suggestion.japanese}
              </Txt>
              {progress.romaji && (
                <Txt style={{ fontSize: 12, color: colors.muted }}>
                  {suggestion.romaji}
                </Txt>
              )}
            </Pressable>
          )}
          {showKeyboard && (
            <View style={s.inputRow}>
              <TextInput
                accessibilityLabel="Ta réponse en japonais"
                placeholder="Écris ta réponse…"
                value={input}
                maxLength={1500}
                onChangeText={setInput}
                editable={!busy && !recording.isRecording}
                onSubmitEditing={() => void send(input)}
                style={s.input}
              />
              <IconButton
                name="send"
                label="Envoyer ma réponse"
                onPress={() => void send(input)}
                active={!!input.trim()}
              />
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 28,
            }}
          >
            <IconButton
              name="keyboard"
              label={
                showKeyboard ? "Masquer le clavier" : "Répondre au clavier"
              }
              onPress={() => setShowKeyboard((value) => !value)}
              active={showKeyboard}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                recording.isRecording
                  ? "Arrêter et transcrire mon enregistrement"
                  : "Enregistrer ma réponse"
              }
              disabled={busy}
              onPress={() => void toggleRecording()}
              style={({ pressed }) => [
                s.mic,
                {
                  backgroundColor: recording.isRecording
                    ? "#B44853"
                    : colors.purple,
                  opacity: pressed || busy ? 0.7 : 1,
                },
              ]}
            >
              <Icon
                name={recording.isRecording ? "check" : "mic"}
                size={28}
                color="#FFF"
              />
            </Pressable>
            <IconButton
              name="book"
              label={showHelp ? "Masquer l’aide" : "Afficher l’aide"}
              onPress={() => setShowHelp((value) => !value)}
              active={showHelp}
            />
          </View>
          <Txt
            accessibilityLiveRegion="polite"
            style={{ textAlign: "center", fontSize: 11, color: colors.muted }}
          >
            {recording.isRecording
              ? `Enregistrement · ${Math.floor(recording.durationMillis / 1000)} s · touche pour terminer`
              : speaking
                ? "Mochi parle…"
                : connection
                  ? "Touche le micro pour parler · 60 s maximum"
                  : "Explore les réponses guidées ou connecte l’IA"}
          </Txt>
          {connection && (
            <Txt
              style={{
                fontSize: 10,
                textAlign: "center",
                color: colors.muted,
                lineHeight: 15,
              }}
            >
              L’audio est envoyé à OpenAI pour transcription. Vérifie le texte
              avant de l’envoyer.
            </Txt>
          )}
          <Txt
            style={{
              textAlign: "center",
              fontSize: 10,
              color: colors.muted,
              lineHeight: 14,
            }}
          >
            {Math.floor(elapsedSeconds / 60)}:
            {String(elapsedSeconds % 60).padStart(2, "0")} de pratique
          </Txt>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: "#FFF",
  },
  messages: {
    padding: 22,
    paddingBottom: 28,
    gap: 22,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  bubble: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  correction: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#EDF4EF",
    gap: 9,
  },
  error: { padding: 16, borderRadius: 16, backgroundColor: "#FCEDEA", gap: 12 },
  composer: {
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    padding: 16,
    gap: 12,
    alignItems: "stretch",
  },
  suggestion: {
    backgroundColor: "#F7F4FC",
    padding: 15,
    borderRadius: 15,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  mic: {
    width: 64,
    height: 64,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    maxWidth: 620,
    alignSelf: "center",
    width: "100%",
  },
  input: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#F5F3F8",
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
  },
});
