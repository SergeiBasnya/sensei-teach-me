import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useJapaneseSpeech } from "./japanese-speech";
import { useOralSession } from "../lib/use-oral-session";
import type {
  ConversationHelp,
  Phrase,
  TutorReply,
} from "../../shared/contracts";
import { CoachHelp } from "./coach-help";
import { conversationMood } from "../lib/avatar-state";
import { teaching } from "../../shared/teaching";
import {
  learnerContext,
  lessonSkills,
  reviewCoaching,
  type LearningTurn,
} from "../../shared/learning-memory";
import { readTutor } from "../lib/tutor-playback";
import type { Scene } from "../data/lessons";
import type { Progress } from "../lib/progress";
import { requestTurn, type Connection } from "../lib/api";
import { Icon, Mochi } from "./art";
import { Button, colors, IconButton, Txt } from "./ui";

type Message = {
  id: number;
  role: "assistant" | "user";
  phrase: Phrase;
  correction?: TutorReply["correction"];
  coaching?: string | null;
  practice?: boolean;
};
const balancedJapanese: TextStyle & { textWrap?: "balance" } =
  Platform.OS === "web" ? { textWrap: "balance" } : {};
export type SessionResult = { seconds: number; turns: number; words: Phrase[] };
export function Conversation({
  scene,
  progress,
  connection,
  onFinish,
  onConfigure,
  onLearning,
  onExposeReview,
  storageError,
}: {
  scene: Scene;
  progress: Progress;
  connection: Connection | null;
  onFinish: (result: SessionResult) => void;
  onConfigure: () => void;
  onLearning: (event: LearningTurn) => void;
  onExposeReview: (id: string) => void;
  storageError: string;
}) {
  const { width, height } = useWindowDimensions();
  const compact = height < 720;
  const first = scene.turns[0]!;
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      phrase: first.tutor,
      coaching: scene.review
        ? reviewCoaching(scene.review, scene.reviewAssisted)
        : null,
    },
  ]);
  const [turn, setTurn] = useState(0);
  const [openingStep, setOpeningStep] = useState<{
    phrase: Phrase;
    coaching: string;
  } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [sheet, setSheet] = useState<"help" | "history" | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const speechReader = useJapaneseSpeech();
  const {
    speakJapanese: speak,
    stopJapanese,
    isSpeaking: speaking,
    error: speechError,
  } = speechReader;
  const assistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")!;
  const words = useRef<Phrase[]>([]);
  const memorySession = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
  ).current;
  const eventCounter = useRef(0);
  const reviewAssisted = useRef(!!scene.reviewAssisted);
  const reviewFinished = useRef(false);
  const learner = learnerContext(progress.learning);
  const exposeCurrentPoint = () => {
    const id =
      scene.review?.id ||
      (scene.lessonId ? `skill:${lessonSkills[scene.lessonId]}` : undefined);
    if (id) onExposeReview(id);
  };
  const remember = (tutor: TutorReply) =>
    onLearning({
      id: `${memorySession}:${++eventCounter.current}`,
      sessionId: memorySession,
      at: new Date().toISOString(),
      scenario: scene.id,
      lessonId: scene.lessonId,
      tutor,
      reviewId: scene.review?.id,
      independent: !reviewAssisted.current,
    });
  const activeSeconds = useRef(0);
  const foreground = useRef(AppState.currentState === "active");
  const abort = useRef(new AbortController());
  const locked = useRef(false);
  const mounted = useRef(true);
  const autoStarted = useRef(false);
  const helpCache = useRef(new Map<string, ConversationHelp>()).current;
  const oral = useOralSession({
    connection,
    scenario: scene.id,
    lessonId: scene.lessonId,
    learner,
    review: scene.review
      ? { target: scene.review, assisted: reviewAssisted.current }
      : undefined,
    finished: () => reviewFinished.current,
    question: {
      phrase: assistant.phrase,
      coaching: assistant.coaching,
      practice: assistant.practice,
    },
    opening:
      scene.lessonId &&
      !(
        learner.support === "light" &&
        learner.stable.includes(lessonSkills[scene.lessonId])
      )
        ? { explanation: teaching[scene.lessonId], model: first.suggestion }
        : undefined,
    onOpeningStep(step) {
      if (step) exposeCurrentPoint();
      setOpeningStep(step);
    },
    onAssistance(tutor) {
      exposeCurrentPoint();
      if (scene.review) {
        reviewAssisted.current = true;
      }
      setOpeningStep(null);
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now(),
          role: "assistant",
          phrase: tutor.reply,
          coaching: tutor.coaching,
          correction: null,
          practice: tutor.practice,
        },
      ]);
    },
    history: messages.map((message) => ({
      role: message.role,
      content: [message.coaching, message.phrase.japanese]
        .filter(Boolean)
        .join("\n"),
    })),
    onReply(result) {
      remember(result.tutor);
      if (result.tutor.practice || result.tutor.assisted) exposeCurrentPoint();
      if (scene.review) {
        if (result.tutor.review?.outcome === "correct") {
          reviewFinished.current = true;
          setComplete(true);
        } else if (
          result.tutor.practice ||
          result.tutor.correction ||
          result.tutor.assisted
        )
          reviewAssisted.current = true;
      }
      setOpeningStep(null);
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now(),
          role: "user",
          phrase: { japanese: result.transcript, romaji: "", french: "" },
          correction: result.tutor.correction,
        },
        {
          id: Date.now() + 1,
          role: "assistant",
          phrase: result.tutor.reply,
          correction: result.tutor.correction,
          coaching: result.tutor.coaching,
          practice: result.tutor.practice,
        },
      ]);
      words.current.push(...result.tutor.vocabulary);
      setTurn((previous) => previous + 1);
    },
  });
  useEffect(() => {
    if (!connection?.oral || autoStarted.current) return;
    // Différer d’un cycle permet à un montage annulé de libérer le démarrage.
    const timer = setTimeout(() => {
      autoStarted.current = true;
      void oral.start();
    }, 0);
    return () => clearTimeout(timer);
  }, [connection?.oral, oral.start]);
  const finish = () => {
    abort.current.abort();
    void oral.stop();
    void stopJapanese();
    onFinish({
      seconds: Math.max(1, activeSeconds.current),
      turns: messages.filter((m) => m.role === "user").length,
      words: words.current,
    });
  };
  useEffect(() => {
    mounted.current = true;
    abort.current = new AbortController();
    const appState = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
    });
    const timer = setInterval(() => {
      if (foreground.current) {
        activeSeconds.current++;
      }
    }, 1000);
    return () => {
      mounted.current = false;
      abort.current.abort();
      clearInterval(timer);
      appState.remove();
      void stopJapanese();
    };
  }, [stopJapanese]);
  const send = async (text: string, guided?: Phrase) => {
    if (locked.current || oral.active || !text.trim() || complete) return;
    if (!connection && !guided) {
      setError("Connecte Mochi pour lui répondre librement.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      let reply: Phrase;
      let correction: TutorReply["correction"] = null;
      let newWords: Phrase[] = [];
      let coaching: string | null | undefined;
      let practice: boolean | undefined;
      if (connection) {
        const result = await requestTurn(
          connection,
          scene.id,
          messages.map((m) => ({
            role: m.role,
            content: [m.coaching, m.phrase.japanese].filter(Boolean).join("\n"),
          })),
          text,
          abort.current.signal,
          scene.lessonId,
          undefined,
          {
            learner,
            review: scene.review
              ? { target: scene.review, assisted: reviewAssisted.current }
              : undefined,
          },
        );
        reply = result.reply;
        remember(result);
        if (result.practice || result.assisted) exposeCurrentPoint();
        if (scene.review) {
          if (result.review?.outcome === "correct") {
            reviewFinished.current = true;
            setComplete(true);
          } else if (result.practice || result.correction || result.assisted)
            reviewAssisted.current = true;
        }
        correction = result.correction;
        newWords = result.vocabulary;
        coaching = result.coaching;
        practice = result.practice;
      } else {
        const next = scene.turns[turn + 1];
        reply = next ? next.tutor : scene.ending;
        newWords = guided ? [guided] : [];
        if (!next) setComplete(true);
      }
      if (!mounted.current) return;
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now(),
          role: "user",
          phrase: guided || { japanese: text, romaji: "", french: "" },
          correction,
        },
        {
          id: Date.now() + 1,
          role: "assistant",
          phrase: reply,
          correction,
          coaching,
          practice,
        },
      ]);
      words.current.push(...newWords);
      setInput("");
      setTurn((previous) => previous + 1);
      if (progress.autoSpeak)
        void readTutor(
          { reply, coaching, correction, vocabulary: newWords },
          speechReader,
          () => mounted.current && !abort.current.signal.aborted,
        );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Réessaie ta réponse.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const question = openingStep?.phrase || assistant.phrase;
  const correction = assistant.correction;
  const coaching = openingStep?.coaching || assistant.coaching;
  const displayedJapanese = correction?.corrected || question.japanese;
  const suggestion = connection
    ? messages.length === 1
      ? first.suggestion
      : undefined
    : scene.turns[turn]?.suggestion;
  const status =
    oral.phase === "listening"
      ? correction
        ? "À toi de réessayer"
        : "À toi de parler"
      : oral.phase === "thinking" || busy
        ? "Mochi réfléchit…"
        : oral.phase === "speaking" || speaking
          ? "Mochi parle…"
          : oral.phase === "starting"
            ? "Préparation du micro…"
            : oral.quiet
              ? "Besoin d’un coup de pouce ?"
              : "En pause";
  const openSheet = async (next: "help" | "history") => {
    await oral.stop();
    if (next === "help") exposeCurrentPoint();
    if (next === "help" && scene.review) {
      const tutor = {
        reply: scene.review.reference,
        correction: null,
        vocabulary: [],
        review: { id: scene.review.id, outcome: "helped" as const },
      };
      remember(tutor);
      reviewAssisted.current = true;
    }
    if (mounted.current) setSheet(next);
  };
  const resume = () => {
    setSheet(null);
    setShowKeyboard(false);
    setError("");
    if (connection?.oral) void oral.start();
  };
  const issue = error || speechError || oral.error || storageError;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.root}
    >
      <View style={s.header}>
        <IconButton
          name="close"
          label="Terminer et revenir à l’accueil"
          onPress={finish}
        />
        <Txt accessibilityRole="header" style={s.title}>
          {scene.title}
        </Txt>
      </View>
      <ScrollView
        contentContainerStyle={s.stage}
        keyboardShouldPersistTaps="handled"
      >
        <Mochi
          size={compact ? 115 : 175}
          mood={conversationMood(oral.phase, speaking)}
        />
        <View style={s.question}>
          {correction && <Txt style={s.feedbackLabel}>Essaie plutôt</Txt>}
          <Txt
            textBreakStrategy="balanced"
            style={[
              s.japanese,
              balancedJapanese,
              width < 370 && { fontSize: 24, lineHeight: 36 },
              width < 600 &&
                displayedJapanese.length <= 16 && {
                  fontSize: Math.max(
                    20,
                    Math.min(
                      28,
                      Math.floor((width - 52) / displayedJapanese.length),
                    ),
                  ),
                },
            ]}
          >
            {displayedJapanese}
          </Txt>
          {progress.romaji && !!question.romaji && (
            <Txt style={s.romaji}>{correction?.romaji || question.romaji}</Txt>
          )}
          {progress.translation && !!question.french && (
            <Txt style={s.translation}>
              {correction?.french || question.french}
            </Txt>
          )}
          {(correction || coaching) && (
            <Txt accessibilityLiveRegion="polite" style={s.feedbackTip}>
              {correction?.explanation || coaching}
            </Txt>
          )}
        </View>
        {!!issue && (
          <View accessibilityRole="alert" style={s.error}>
            <Txt style={{ color: "#8B443D", fontSize: 13 }}>{issue}</Txt>
          </View>
        )}
      </ScrollView>
      <View style={s.composer}>
        {complete ? (
          <Button onPress={finish} icon="check">
            {scene.review ? "Terminer la révision" : "Terminer la séance"}
          </Button>
        ) : !connection?.oral && !showKeyboard ? (
          <Button onPress={onConfigure} icon="mic">
            Connecter le vocal
          </Button>
        ) : (
          <>
            {showKeyboard && (
              <View style={s.inputRow}>
                <TextInput
                  accessibilityLabel="Ta réponse en japonais"
                  placeholder="Ta réponse…"
                  value={input}
                  maxLength={1500}
                  onChangeText={setInput}
                  editable={!busy}
                  onSubmitEditing={() => void send(input)}
                  style={s.input}
                />
                <Button
                  disabled={busy || !input.trim()}
                  onPress={() => void send(input)}
                  style={{ paddingHorizontal: 14 }}
                >
                  Envoyer
                </Button>
              </View>
            )}
            <View style={s.controls}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => openSheet("history")}
                style={s.tool}
              >
                <Icon name="chat" size={22} color={colors.muted} />
                <Txt style={s.toolLabel}>Historique</Txt>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  oral.active
                    ? "Mettre la conversation en pause"
                    : "Reprendre la conversation orale"
                }
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => {
                  setShowKeyboard(false);
                  setError("");
                  void (oral.active ? oral.stop() : oral.start());
                }}
                style={({ pressed }) => [
                  s.mic,
                  {
                    backgroundColor: oral.active ? "#3C2A60" : colors.purple,
                    opacity: pressed || busy ? 0.7 : 1,
                  },
                ]}
              >
                {oral.phase === "starting" || oral.phase === "thinking" ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Icon
                    name={oral.active ? "pause" : "mic"}
                    size={30}
                    color="#FFF"
                  />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => openSheet("help")}
                style={s.tool}
              >
                <Icon name="book" size={22} color={colors.muted} />
                <Txt
                  style={[
                    s.toolLabel,
                    oral.quiet && { color: colors.purple, fontWeight: "600" },
                  ]}
                >
                  Je bloque
                </Txt>
              </Pressable>
            </View>
            <Txt accessibilityLiveRegion="polite" style={s.status}>
              {status}
            </Txt>
          </>
        )}
        {!connection?.oral && !complete && !showKeyboard && (
          <Pressable
            accessibilityRole="button"
            onPress={() => openSheet("help")}
            style={s.offlineHelp}
          >
            <Txt style={s.toolLabel}>Essayer un exemple guidé</Txt>
          </Pressable>
        )}
      </View>
      {sheet && (
        <ConversationSheet
          title={
            sheet === "history" ? "Notre conversation" : "Un coup de pouce"
          }
          onClose={() => {
            setSheet(null);
            void stopJapanese();
          }}
        >
          {sheet === "history" ? (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  s.historyBubble,
                  message.role === "user" && {
                    backgroundColor: colors.light,
                    alignSelf: "flex-end",
                  },
                ]}
              >
                <Txt style={s.speaker}>
                  {message.role === "assistant" ? "Mochi" : "Toi"}
                </Txt>
                <Txt style={{ fontSize: 18, lineHeight: 29 }}>
                  {message.phrase.japanese}
                </Txt>
                {progress.romaji && !!message.phrase.romaji && (
                  <Txt style={{ fontSize: 13, color: colors.purple }}>
                    {message.phrase.romaji}
                  </Txt>
                )}
                {progress.translation && !!message.phrase.french && (
                  <Txt style={{ fontSize: 13, color: colors.muted }}>
                    {message.phrase.french}
                  </Txt>
                )}
                {!!message.coaching && (
                  <Txt style={{ fontSize: 13, lineHeight: 21 }}>
                    {message.coaching}
                  </Txt>
                )}
                {message.correction && (
                  <View style={s.correction}>
                    <Txt style={{ fontWeight: "600" }}>
                      {message.correction.corrected}
                    </Txt>
                    <Txt style={{ fontSize: 13 }}>
                      {message.correction.explanation}
                    </Txt>
                  </View>
                )}
              </View>
            ))
          ) : (
            <>
              {scene.review ? (
                <View style={s.correction}>
                  <Txt style={{ fontSize: 22, lineHeight: 34 }}>
                    {scene.review.reference.japanese}
                  </Txt>
                  {progress.romaji && (
                    <Txt>{scene.review.reference.romaji}</Txt>
                  )}
                  <Txt>{scene.review.reference.french}</Txt>
                  <Txt>{scene.review.explanation}</Txt>
                </View>
              ) : correction ? (
                <View style={s.correction}>
                  <Txt style={{ fontSize: 22, lineHeight: 34 }}>
                    {correction.corrected}
                  </Txt>
                  {progress.romaji && <Txt>{correction.romaji}</Txt>}
                  <Txt>{correction.french}</Txt>
                  <Txt>{correction.explanation}</Txt>
                </View>
              ) : (
                <CoachHelp
                  connection={connection}
                  question={question}
                  history={messages.map((message) => ({
                    role: message.role,
                    content: message.phrase.japanese,
                  }))}
                  scenario={scene.id}
                  fallback={suggestion}
                  romaji={progress.romaji}
                  cache={helpCache}
                />
              )}
              <Button
                secondary
                icon="volume"
                onPress={() =>
                  void speak(
                    scene.review?.reference.japanese ||
                      correction?.corrected ||
                      question.japanese,
                  )
                }
              >
                {scene.review || correction
                  ? "Réécouter la phrase"
                  : "Réécouter la question"}
              </Button>
              {!connection && suggestion && (
                <Button
                  secondary
                  onPress={() => {
                    setSheet(null);
                    void send(suggestion.japanese, suggestion);
                  }}
                >
                  Essayer cette réponse
                </Button>
              )}
              {connection && (
                <Button
                  secondary
                  icon="keyboard"
                  onPress={() => {
                    setSheet(null);
                    setShowKeyboard(true);
                  }}
                >
                  Écrire plutôt
                </Button>
              )}
            </>
          )}
          <Button icon={connection?.oral ? "mic" : "close"} onPress={resume}>
            {connection?.oral
              ? sheet === "help"
                ? "À moi de parler"
                : "Reprendre"
              : "Fermer"}
          </Button>
        </ConversationSheet>
      )}
    </KeyboardAvoidingView>
  );
}
function ConversationSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.backdrop}
      >
        <View
          style={[s.sheet, { paddingBottom: Math.max(24, insets.bottom + 12) }]}
          accessibilityViewIsModal
        >
          <View style={s.sheetHeader}>
            <Txt
              accessibilityRole="header"
              style={{ fontSize: 21, fontWeight: "700", flex: 1 }}
            >
              {title}
            </Txt>
            <IconButton
              name="close"
              label="Fermer le panneau"
              onPress={onClose}
            />
          </View>
          <ScrollView
            contentContainerStyle={s.sheetBody}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: "#FFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { flex: 1, fontSize: 17, fontWeight: "600", lineHeight: 25 },
  stage: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 26,
    paddingVertical: 24,
    gap: 24,
  },
  question: { gap: 12, maxWidth: 580, width: "100%" },
  feedbackLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.purple,
    textAlign: "center",
  },
  feedbackTip: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    marginTop: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.light,
  },
  japanese: {
    fontSize: 28,
    lineHeight: 42,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  romaji: {
    fontSize: 14,
    lineHeight: 23,
    color: colors.purple,
    textAlign: "center",
  },
  translation: {
    fontSize: 14,
    lineHeight: 23,
    color: colors.muted,
    textAlign: "center",
  },
  composer: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
    backgroundColor: "#FFF",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  tool: {
    minWidth: 70,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  toolLabel: { fontSize: 12, color: colors.muted },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  status: { fontSize: 13, color: colors.muted, textAlign: "center" },
  error: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FCEDEA",
    width: "100%",
    maxWidth: 580,
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
  offlineHelp: { alignSelf: "center", padding: 10 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#29233666",
  },
  sheet: {
    maxHeight: "86%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    backgroundColor: "#FFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sheetBody: { padding: 24, paddingTop: 8, gap: 18 },
  historyBubble: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#F7F5FB",
    gap: 8,
    width: "94%",
  },
  speaker: { fontSize: 12, fontWeight: "600", color: colors.muted },
  correction: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#F5F2FA",
    gap: 8,
  },
});
