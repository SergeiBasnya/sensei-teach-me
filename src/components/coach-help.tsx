import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import {
  helpResponseSchema,
  type ConversationHelp,
  type Phrase,
  type ScenarioId,
} from "../../shared/contracts";
import { apiRequest, type Connection } from "../lib/api";
import { useJapaneseSpeech } from "./japanese-speech";
import { Button, colors, Txt } from "./ui";

type History = { role: "user" | "assistant"; content: string }[];
export function CoachHelp({
  connection,
  question,
  history,
  scenario,
  fallback,
  romaji,
  cache,
}: {
  connection: Connection | null;
  question: Phrase;
  history: History;
  scenario: ScenarioId;
  fallback?: Phrase;
  romaji: boolean;
  cache: Map<string, ConversationHelp>;
}) {
  const { speakJapanese } = useJapaneseSpeech();
  const [meaning, setMeaning] = useState("");
  const [result, setResult] = useState<ConversationHelp | null>(null);
  const [personal, setPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const latest = useRef({ connection, question, history, scenario, fallback });
  latest.current = { connection, question, history, scenario, fallback };
  const contextKey = JSON.stringify({
    question: question.japanese,
    history: history.slice(-8),
    scenario,
  });
  const ask = useCallback(
    async (intention: string) => {
      const id = ++sequence.current;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const current = () =>
        id === sequence.current && !controller.signal.aborted;
      const data = latest.current;
      const payload = {
        question: data.question.japanese,
        history: data.history.slice(-16),
        scenario: data.scenario,
        meaning: intention.trim(),
      };
      const key = JSON.stringify(payload);
      setError("");
      setPersonal(!!payload.meaning);
      if (!data.connection) {
        setResult(
          data.fallback
            ? {
                explanation: "Voici un exemple à adapter pour t’entraîner.",
                answer: data.fallback,
              }
            : null,
        );
        setBusy(false);
        return;
      }
      const saved = cache.get(key);
      if (saved) {
        setResult(saved);
        setBusy(false);
        return;
      }
      setBusy(true);
      setResult(null);
      try {
        const help = helpResponseSchema.parse(
          await apiRequest(
            data.connection,
            "/api/help",
            payload,
            controller.signal,
          ),
        );
        if (!current()) return;
        if (cache.size >= 20) cache.delete(cache.keys().next().value!);
        cache.set(key, help);
        setResult(help);
      } catch (cause) {
        if (current())
          setError(
            cause instanceof Error
              ? cause.message
              : "Mochi n’a pas trouvé d’aide. Réessaie.",
          );
      } finally {
        if (current()) setBusy(false);
      }
    },
    [cache],
  );
  useEffect(() => {
    void ask("");
    return () => {
      sequence.current++;
      abort.current?.abort();
    };
  }, [ask, contextKey, connection?.url, connection?.token]);
  return (
    <View style={{ gap: 18 }}>
      {!!question.french && (
        <Txt style={{ fontSize: 16, lineHeight: 25 }}>{question.french}</Txt>
      )}
      {busy && (
        <Txt
          accessibilityLiveRegion="polite"
          style={{ fontSize: 14, color: colors.muted }}
        >
          Mochi prépare ton coup de pouce…
        </Txt>
      )}
      {!!error && (
        <View accessibilityRole="alert" style={{ gap: 10 }}>
          <Txt style={{ fontSize: 13, color: "#8B443D" }}>{error}</Txt>
          <Button secondary onPress={() => void ask(meaning)}>
            Réessayer l’aide
          </Button>
        </View>
      )}
      {result && (
        <>
          <Txt style={{ fontSize: 14, color: colors.muted }}>
            {result.explanation}
          </Txt>
          <View
            style={{
              padding: 18,
              borderRadius: 18,
              backgroundColor: colors.light,
              gap: 9,
            }}
          >
            <Txt
              style={{ fontSize: 12, color: colors.purple, fontWeight: "600" }}
            >
              {personal ? "Ta phrase en japonais" : "Exemple à adapter"}
            </Txt>
            <Txt style={{ fontSize: 22, lineHeight: 34 }}>
              {result.answer.japanese}
            </Txt>
            {romaji && (
              <Txt
                style={{ fontSize: 14, lineHeight: 23, color: colors.purple }}
              >
                {result.answer.romaji}
              </Txt>
            )}
            <Txt style={{ fontSize: 14, color: colors.muted }}>
              {result.answer.french}
            </Txt>
            <Button
              secondary
              icon="volume"
              onPress={() => void speakJapanese(result.answer.japanese)}
            >
              Écouter cette réponse
            </Button>
          </View>
        </>
      )}
      {connection && (
        <View style={{ gap: 10 }}>
          <Txt style={{ fontSize: 13, fontWeight: "600" }}>
            Ta réponse, en français
          </Txt>
          <TextInput
            accessibilityLabel="Ce que tu veux dire en français"
            placeholder="Par exemple : je viens de Belgique"
            value={meaning}
            maxLength={500}
            onChangeText={setMeaning}
            editable={!busy}
            multiline
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#F5F3F8",
              fontSize: 15,
              color: colors.ink,
              minHeight: 64,
              textAlignVertical: "top",
            }}
          />
          <Button
            secondary
            loading={busy}
            disabled={!meaning.trim()}
            onPress={() => void ask(meaning)}
          >
            M’aider à le dire
          </Button>
        </View>
      )}
    </View>
  );
}
