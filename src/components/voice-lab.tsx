import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  View,
} from "react-native";
import {
  VOICE_LAB,
  voiceLabServerSchema,
  voiceLabTicketSchema,
  type VoiceLabLanguage,
  type VoiceLabScenario,
  type VoiceLabClientEvent,
} from "../../shared/voice-lab";
import type { Phrase, TutorReply } from "../../shared/contracts";
import { apiRequest, validServerUrl, type Connection } from "../lib/api";
import {
  VoiceLabPcm,
  VoiceLabEndpoint,
  VoiceLabEpoch,
  voiceLabPacket,
  type VoiceLabPcmBuffer,
} from "../lib/voice-lab-pcm";
import {
  VoiceLabMetrics,
  type VoiceLabIncident,
} from "../lib/voice-lab-metrics";
import { scenes, freeScene } from "../data/lessons";
import {
  applyVoiceLabDetails,
  applyPhraseDetails,
} from "../lib/voice-lab-details";
import { VoiceLabCapture } from "./voice-lab-capture";
import { useJapaneseSpeech } from "./japanese-speech";
import { Mochi } from "./art";
import { Button, colors, IconButton, Txt } from "./ui";

type Phase =
  | "idle"
  | "connecting"
  | "preparing"
  | "listening"
  | "recognizing"
  | "speaking"
  | "paused";
type Capture = { key: number; tag: { epoch: number; turn: number } };
const labels: Record<Phase, string> = {
  idle: "Prêt pour un essai",
  connecting: "Connexion au laboratoire…",
  preparing: "Préparation du micro…",
  listening: "À toi de parler",
  recognizing: "Vérification de ta phrase…",
  speaking: "Mochi parle…",
  paused: "En pause",
};

/** Isolated experiment: no learning event, no barge-in and no production replacement. */
export function VoiceLab({
  connection,
  onClose,
}: {
  connection: Connection | null;
  onClose: () => void;
}) {
  const speech = useJapaneseSpeech();
  const [phase, setPhase] = useState<Phase>("idle");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [scenario, setScenario] = useState<VoiceLabScenario>("meet");
  const [language, setLanguage] = useState<VoiceLabLanguage>("auto");
  const [respond, setRespond] = useState(true);
  const [continuous, setContinuous] = useState(true);
  const [automatic, setAutomatic] = useState(true);
  const [keepSample, setKeepSample] = useState(false);
  const [sampleId, setSampleId] = useState("");
  const [partial, setPartial] = useState("");
  const [final, setFinal] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [tutor, setTutor] = useState<TutorReply | null>(null);
  const [question, setQuestion] = useState<Phrase | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signal, setSignal] = useState({ rate: 0, channels: 0, peak: 0 });
  const metrics = useRef(new VoiceLabMetrics()).current;
  const gate = useRef(new VoiceLabEpoch()).current;
  const alive = useRef(true);
  const wire = useRef(0);
  const socket = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const active = useRef(false);
  const capturing = useRef(false);
  const sourceStarted = useRef(false);
  const finishing = useRef(false);
  const permission = useRef(false);
  const initialAsked = useRef(false);
  const captureKey = useRef(0);
  const pcm = useRef<VoiceLabPcm | null>(null);
  const endpoint = useRef<VoiceLabEndpoint | null>(null);
  const sequence = useRef(0);
  const audioIndex = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const speechGeneration = useRef(0);
  const lastBuffer = useRef(0);
  const captureStartedAt = useRef(0);
  const automaticResume = useRef(false);
  const preparingAt = useRef(0);
  const lastSignal = useRef(0);
  const unclear = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const ticketAbort = useRef<AbortController | null>(null);
  const options = useRef({
    scenario,
    language,
    respond,
    continuous,
    automatic,
    keepSample,
  });
  options.current = {
    scenario,
    language,
    respond,
    continuous,
    automatic,
    keepSample,
  };
  const actions = useRef({
    begin: (_automatic?: boolean) => {},
    pause: (_reason?: VoiceLabIncident) => {},
    finish: () => {},
  });
  const send = (event: VoiceLabClientEvent) => {
    if (socket.current?.readyState !== WebSocket.OPEN)
      throw new Error("socket_closed");
    socket.current.send(JSON.stringify(event));
  };
  const pause = useCallback(
    (reason?: VoiceLabIncident) => {
      if (reason && active.current) metrics.incident(reason);
      const tag = gate.tag();
      const didStart = sourceStarted.current;
      active.current = false;
      capturing.current = false;
      sourceStarted.current = false;
      permission.current = false;
      gate.pause();
      speechGeneration.current++;
      clearTimeout(timer.current);
      clearTimeout(readyTimer.current);
      ticketAbort.current?.abort();
      if (didStart && socket.current?.readyState === WebSocket.OPEN) {
        try {
          socket.current.send(
            JSON.stringify({ type: "pause", turn: tag.turn }),
          );
        } catch {}
      }
      queue.current = Promise.resolve();
      void speech.stopJapanese();
      if (alive.current) {
        setCapture(null);
        setPhase("paused");
      }
    },
    [gate, metrics, speech.stopJapanese],
  );
  const fail = useCallback(
    (message: string, reason: VoiceLabIncident) => {
      metrics.incident(reason);
      pause();
      if (alive.current) setError(message);
    },
    [metrics, pause],
  );
  const closeWire = useCallback(() => {
    wire.current++;
    clearTimeout(readyTimer.current);
    ready.current = false;
    ticketAbort.current?.abort();
    const old = socket.current;
    socket.current = null;
    if (old) {
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try {
        old.send(JSON.stringify({ type: "close" }));
      } catch {}
      old.close();
    }
  }, []);
  const begin = (automatic = false) => {
    if (
      !alive.current ||
      !ready.current ||
      socket.current?.readyState !== WebSocket.OPEN
    )
      return;
    const tag = gate.begin();
    automaticResume.current = automatic;
    speechGeneration.current++;
    captureKey.current++;
    capturing.current = true;
    active.current = true;
    sourceStarted.current = false;
    finishing.current = false;
    sequence.current = 0;
    audioIndex.current = 0;
    queue.current = Promise.resolve();
    pcm.current = new VoiceLabPcm();
    endpoint.current = null;
    lastBuffer.current = 0;
    captureStartedAt.current = 0;
    preparingAt.current = performance.now();
    setPartial("");
    setError("");
    setNotice("");
    setPhase("preparing");
    setCapture({ key: captureKey.current, tag });
  };
  const captureReady = (tag: Capture["tag"]) => {
    if (!gate.current(tag) || !capturing.current || sourceStarted.current)
      return;
    try {
      send({
        type: "start",
        turn: tag.turn,
        language: options.current.language,
        scenario: options.current.scenario,
        respond: options.current.respond,
        keepSample: options.current.keepSample,
      });
      sourceStarted.current = true;
      captureStartedAt.current = performance.now();
      lastBuffer.current = captureStartedAt.current;
      endpoint.current = new VoiceLabEndpoint(captureStartedAt.current);
      metrics.begin(captureStartedAt.current, automaticResume.current);
      setPhase("listening");
    } catch {
      fail(
        "La connexion a été interrompue. Reprends l’essai.",
        "network_error",
      );
    }
  };
  const pushPacket = (tag: Capture["tag"], data: Uint8Array) => {
    if (!gate.current(tag) || !capturing.current) return;
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN)
      throw new Error("socket_closed");
    if (ws.bufferedAmount > 64_000) throw new Error("backpressure");
    ws.send(voiceLabPacket(tag.turn, sequence.current++, data));
    metrics.chunk(data.byteLength);
  };
  const finish = (forced = true) => {
    if (!capturing.current || !sourceStarted.current || finishing.current)
      return;
    finishing.current = true;
    const tag = gate.tag();
    // Keep a final capture margin before stopping the native 100 ms reader.
    timer.current = setTimeout(() => {
      if (!gate.current(tag) || !capturing.current) return;
      if (!forced && !endpoint.current?.canFinish(performance.now())) {
        finishing.current = false;
        return;
      }
      try {
        const tail = pcm.current?.flush();
        if (tail) pushPacket(tag, tail);
        capturing.current = false;
        setCapture(null);
        metrics.finish(endpoint.current?.lastDetectedVoiceAt ?? null);
        send({ type: "finish", turn: tag.turn });
        setPhase("recognizing");
      } catch {
        fail(
          "L’envoi audio a été interrompu. Reprends l’essai.",
          "network_error",
        );
      }
    }, 150);
  };
  const onBuffer = (tag: Capture["tag"], buffer: VoiceLabPcmBuffer) => {
    if (!gate.current(tag) || !capturing.current) return;
    captureReady(tag);
    if (!gate.current(tag) || !capturing.current) return;
    try {
      if (
        buffer.timestamp !== undefined &&
        Number.isFinite(buffer.timestamp) &&
        performance.now() - captureStartedAt.current - buffer.timestamp * 1000 >
          3000
      ) {
        fail(
          "Les données du micro sont trop anciennes. Reprends la capture.",
          "capture_gap",
        );
        return;
      }
      lastBuffer.current = performance.now();
      for (const packet of pcm.current!.push(buffer)) {
        pushPacket(tag, packet);
        const decision = endpoint.current!.observe(packet, performance.now());
        if (decision === "quiet") {
          setNotice(
            "Le micro est en pause après ce silence. Reprends quand tu es prêt.",
          );
          pause();
          return;
        }
        if (decision === "limit") {
          setNotice("Cette prise a atteint la limite du laboratoire.");
          finish();
        }
        if (options.current.automatic && decision === "finish") finish(false);
      }
      const snapshot = pcm.current!.snapshot();
      metrics.capture(snapshot);
      if (performance.now() - lastSignal.current > 400) {
        lastSignal.current = performance.now();
        setSignal({
          rate: snapshot.sourceRateHz,
          channels: snapshot.sourceChannels,
          peak: snapshot.peak,
        });
      }
    } catch (cause) {
      const slow = cause instanceof Error && cause.message === "backpressure";
      fail(
        slow
          ? "Le réseau ne suit plus la capture. Reprends l’essai pour éviter une phrase tronquée."
          : "Le format ou la capture audio a changé. Reprends l’essai.",
        slow ? "backpressure" : "capture_error",
      );
    }
  };
  const startConnected = (owner: number) => {
    if (options.current.respond && !initialAsked.current) {
      initialAsked.current = true;
      const initial = (
        options.current.scenario === "free"
          ? freeScene
          : scenes.find((scene) => scene.id === options.current.scenario)
      )!.turns[0]!.tutor;
      const generation = ++speechGeneration.current;
      setQuestion(initial);
      setPhase("speaking");
      void speech
        .speakJapanese(initial.japanese)
        .then((played) => {
          if (
            !alive.current ||
            wire.current !== owner ||
            !active.current ||
            generation !== speechGeneration.current
          )
            return;
          if (played) actions.current.begin();
          else
            fail("La question initiale n’a pas pu être lue.", "playback_error");
        })
        .catch(() => {
          if (alive.current && generation === speechGeneration.current)
            fail("La question initiale n’a pas pu être lue.", "playback_error");
        });
    } else actions.current.begin();
  };
  const start = async () => {
    if (!connection) {
      setError(
        "Connecte ton serveur dans les réglages, puis ouvre le laboratoire.",
      );
      return;
    }
    if (Platform.OS !== "android" && Platform.OS !== "web") {
      setError(
        "Cette capture expérimentale est proposée sur Android et web. Le vocal classique reste disponible sur iOS.",
      );
      return;
    }
    setError("");
    setNotice("");
    active.current = true;
    if (ready.current && socket.current?.readyState === WebSocket.OPEN) {
      startConnected(wire.current);
      return;
    }
    closeWire();
    const owner = wire.current;
    const controller = new AbortController();
    ticketAbort.current = controller;
    const ticketTimeout = setTimeout(() => controller.abort(), 10_000);
    setPhase("connecting");
    try {
      const ticket = voiceLabTicketSchema.parse(
        await apiRequest(
          connection,
          "/api/voice-lab/session",
          {},
          controller.signal,
        ),
      );
      if (!alive.current || wire.current !== owner || !active.current) return;
      const base = new URL(validServerUrl(connection.url));
      base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
      base.pathname = ticket.path;
      base.search = "";
      base.searchParams.set("ticket", ticket.ticket);
      const ws = new WebSocket(base.toString());
      socket.current = ws;
      readyTimer.current = setTimeout(() => {
        if (
          alive.current &&
          wire.current === owner &&
          active.current &&
          !ready.current
        ) {
          fail(
            "Le laboratoire ne répond pas. Reprends l’essai ou utilise le vocal classique.",
            "network_error",
          );
          closeWire();
        }
      }, 10_000);
      ws.onmessage = (message) => {
        if (!alive.current || wire.current !== owner) return;
        let raw: unknown;
        try {
          if (
            typeof message.data !== "string" ||
            message.data.length > 2_000_000
          )
            throw new Error();
          raw = JSON.parse(message.data);
        } catch {
          fail("Le serveur a envoyé une réponse invalide.", "network_error");
          return;
        }
        const parsed = voiceLabServerSchema.safeParse(raw);
        if (!parsed.success) {
          fail("Le protocole du laboratoire est invalide.", "network_error");
          return;
        }
        const event = parsed.data;
        if (event.type === "ready") {
          clearTimeout(readyTimer.current);
          ready.current = true;
          if (!active.current) return;
          startConnected(owner);
          return;
        }
        if (event.type === "error") {
          if (event.turn !== undefined && !gate.accepts(event.turn)) return;
          fail(event.message, "network_error");
          return;
        }
        if (!gate.accepts(event.turn)) return;
        if (event.type === "partial") {
          setPartial(event.text);
          if (event.text) {
            setFinal("");
            setUncertain(event.uncertain);
          }
          endpoint.current?.notePartial(event.text, event.uncertain);
          metrics.partial();
          metrics.server(event.metrics);
        }
        if (event.type === "final") {
          setFinal(event.text);
          setPartial("");
          setUncertain(event.uncertain);
          metrics.final(event.uncertain);
          metrics.server(event.metrics);
          unclear.current =
            event.uncertain || !event.text ? unclear.current + 1 : 0;
        }
        if (event.type === "metrics") metrics.server(event.metrics);
        if (event.type === "sample_saved") setSampleId(event.id);
        if (event.type === "tutor") {
          setTutor(event.tutor);
          setQuestion(event.tutor.reply);
        }
        if (event.type === "details") {
          setTutor((previous) => applyVoiceLabDetails(previous, event));
          setQuestion((previous) => applyPhraseDetails(previous, event));
        }
        if (event.type === "state" && event.state === "recognizing") {
          capturing.current = false;
          setCapture(null);
          setPhase("recognizing");
        }
        if (
          event.type === "state" &&
          event.state === "complete" &&
          !options.current.respond
        ) {
          active.current = false;
          setPhase("paused");
        }
        if (event.type === "audio") {
          if (event.index !== audioIndex.current++) {
            fail(
              "Un segment vocal est arrivé dans le désordre. Reprends l’essai.",
              "network_error",
            );
            return;
          }
          const tag = gate.tag();
          queue.current = queue.current
            .then(async () => {
              if (!gate.current(tag)) return;
              setPhase("speaking");
              const played = await speech.playJapaneseAudio(event.audio, () => {
                if (gate.current(tag)) metrics.playing();
              });
              if (gate.current(tag) && played) metrics.playbackEnded();
              if (gate.current(tag) && !played)
                fail(
                  "La lecture japonaise a été interrompue.",
                  "playback_error",
                );
            })
            .catch(() => {
              if (gate.current(tag))
                fail("La lecture japonaise a échoué.", "playback_error");
            });
        }
        if (event.type === "response_done") {
          metrics.responseDone();
          const tag = gate.tag();
          void queue.current.then(() => {
            if (!gate.current(tag)) return;
            if (unclear.current >= 3) {
              setNotice(
                "Le micro est en pause après trois prises incertaines.",
              );
              pause();
              return;
            }
            if (options.current.continuous) actions.current.begin(true);
            else {
              active.current = false;
              setPhase("paused");
            }
          });
        }
      };
      ws.onerror = () => {
        if (wire.current !== owner || !alive.current) return;
        clearTimeout(readyTimer.current);
        if (wire.current === owner && alive.current)
          fail("La connexion au laboratoire a échoué.", "network_error");
      };
      ws.onclose = () => {
        if (wire.current !== owner || !alive.current) return;
        clearTimeout(readyTimer.current);
        ready.current = false;
        if (active.current)
          fail(
            "La connexion au laboratoire a été fermée. Reprends l’essai.",
            "network_error",
          );
      };
    } catch {
      if (alive.current && wire.current === owner && active.current)
        fail(
          "Le laboratoire est indisponible. Active-le sur ton serveur ou utilise le vocal classique.",
          "network_error",
        );
    } finally {
      clearTimeout(ticketTimeout);
    }
  };
  actions.current = { begin, pause, finish };
  useEffect(() => {
    const timer = setInterval(() => {
      if (!capturing.current) return;
      if (!sourceStarted.current) {
        if (
          !permission.current &&
          performance.now() - preparingAt.current > 15_000
        )
          fail(
            "Le micro n’a pas démarré. Reprends l’essai avec son autorisation active.",
            "capture_error",
          );
        return;
      }
      if (performance.now() - lastBuffer.current > 3000)
        fail(
          "Le micro ne transmet plus de données. Reprends l’essai.",
          "capture_gap",
        );
      else if (
        performance.now() - captureStartedAt.current >
        VOICE_LAB.maxTurnMs - 250
      )
        actions.current.finish();
    }, 250);
    return () => clearInterval(timer);
  }, [fail]);
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && !permission.current && active.current)
        actions.current.pause("pause_background");
    });
    return () => {
      alive.current = false;
      subscription.remove();
      actions.current.pause();
      closeWire();
    };
  }, [closeWire]);
  const change = () => {
    pause();
    closeWire();
    initialAsked.current = false;
    setTutor(null);
    setQuestion(null);
    setFinal("");
    setPartial("");
    setUncertain(false);
    setSampleId("");
  };
  const explanation = tutor?.coaching || tutor?.correction?.explanation;
  const explain = async () => {
    if (!explanation) return;
    pause();
    const generation = ++speechGeneration.current;
    active.current = true;
    setPhase("speaking");
    try {
      await speech.speakFrench(explanation);
    } finally {
      if (alive.current && generation === speechGeneration.current) {
        active.current = false;
        setPhase("paused");
      }
    }
  };
  const exportMetrics = async () => {
    try {
      const value = JSON.stringify(metrics.report(Platform.OS), null, 2);
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setNotice("Bilan numérique copié, sans audio ni transcription.");
      } else
        await Share.share({
          title: "Bilan laboratoire vocal Sensei",
          message: value,
        });
    } catch {
      setNotice("Le partage n’a pas abouti. Réessaie.");
    }
  };
  const busy = !["idle", "paused"].includes(phase);
  const close = () => {
    pause();
    closeWire();
    onClose();
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View
        style={{
          padding: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Txt style={{ fontSize: 22, fontWeight: "700", flex: 1 }}>
          Laboratoire vocal
        </Txt>
        <IconButton
          name="close"
          label="Revenir au vocal classique"
          onPress={close}
        />
      </View>
      {capture && (
        <VoiceLabCapture
          key={capture.key}
          onReady={() => captureReady(capture.tag)}
          onBuffer={(buffer) => onBuffer(capture.tag, buffer)}
          onPermission={(value) => {
            if (gate.current(capture.tag)) {
              permission.current = value;
              if (!value && !sourceStarted.current)
                preparingAt.current = performance.now();
            }
          }}
          onError={(message) => {
            if (gate.current(capture.tag)) fail(message, "capture_error");
          }}
        />
      )}
      <ScrollView
        contentContainerStyle={{ padding: 22, gap: 20, paddingBottom: 32 }}
      >
        <View style={{ alignItems: "center", gap: 8 }}>
          <Mochi size={110} />
          <Txt accessibilityLiveRegion="polite" style={{ fontWeight: "600" }}>
            {labels[phase]}
          </Txt>
          <Txt
            style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}
          >
            Prototype isolé. Les transcriptions provisoires ne sont ni corrigées
            ni mémorisées.
          </Txt>
        </View>
        <View style={{ gap: 12 }}>
          <Txt style={{ fontWeight: "600" }}>Situation</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                ["meet", "Présentation"],
                ["cafe", "Café"],
                ["station", "Gare"],
                ["free", "Libre"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: scenario === id,
                  disabled: busy,
                }}
                onPress={() => {
                  change();
                  setScenario(id);
                }}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: scenario === id ? colors.light : colors.bg,
                }}
              >
                <Txt style={{ fontSize: 13 }}>{label}</Txt>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                ["auto", "Japonais et français"],
                ["ja", "Japonais uniquement"],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: language === id,
                  disabled: busy,
                }}
                onPress={() => {
                  change();
                  setLanguage(id);
                }}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: language === id ? colors.light : colors.bg,
                }}
              >
                <Txt style={{ fontSize: 13 }}>{label}</Txt>
              </Pressable>
            ))}
          </View>
          {(
            [
              ["Réponse japonaise de Mochi", respond, setRespond],
              ["Reprendre l’écoute après Mochi", continuous, setContinuous],
              [
                "Fin de phrase automatique expérimentale",
                automatic,
                setAutomatic,
              ],
              ["Garder mes extraits sur le Mac", keepSample, setKeepSample],
            ] as const
          ).map(([label, value, set]) => (
            <View
              key={label}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Txt style={{ flex: 1, fontSize: 14 }}>{label}</Txt>
              <Switch
                accessibilityLabel={label}
                disabled={busy}
                value={value}
                onValueChange={(next) => {
                  change();
                  set(next);
                }}
                trackColor={{ true: colors.purple }}
              />
            </View>
          ))}
          <Txt style={{ color: colors.muted, fontSize: 12 }}>
            Extraits : uniquement pour comparer les transcriptions. Audio privé,
            jamais dans le bilan partagé.
          </Txt>
        </View>
        {question && (
          <View style={{ gap: 5 }}>
            <Txt style={{ fontSize: 20, lineHeight: 29 }}>
              {question.japanese}
            </Txt>
            <Txt style={{ color: colors.muted, fontSize: 14 }}>
              {question.romaji}
            </Txt>
            <Txt style={{ fontSize: 14 }}>
              {question.french.replace(/\s+([?!:;])/g, "\u00a0$1")}
            </Txt>
            {explanation && <Txt style={{ fontSize: 14 }}>{explanation}</Txt>}
            {explanation && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void explain();
                }}
              >
                <Txt style={{ color: colors.purple, paddingVertical: 8 }}>
                  Écouter l’explication
                </Txt>
              </Pressable>
            )}
          </View>
        )}
        {(partial || final) && (
          <View style={{ gap: 6 }}>
            <Txt style={{ fontSize: 12, color: colors.muted }}>
              {partial
                ? "Transcription provisoire, à vérifier"
                : "Dernière transcription finale, à vérifier"}
              {uncertain ? " · incertaine" : ""}
            </Txt>
            <Txt selectable style={{ fontSize: 18, lineHeight: 27 }}>
              {partial || final}
            </Txt>
          </View>
        )}
        {!!sampleId && (
          <View style={{ gap: 4 }}>
            <Txt style={{ fontSize: 12, color: colors.muted }}>
              Dernier extrait privé sur le Mac
            </Txt>
            <Txt selectable style={{ fontSize: 12 }}>
              {sampleId}
            </Txt>
          </View>
        )}
        {!!signal.rate && (
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            Capture réelle : {signal.rate} Hz · {signal.channels} canal · crête{" "}
            {Math.round(signal.peak * 100)} %
          </Txt>
        )}
        {!!error && (
          <Txt
            accessibilityRole="alert"
            style={{ color: "#A34845", fontSize: 14 }}
          >
            {error}
          </Txt>
        )}
        {!!notice && (
          <Txt
            accessibilityLiveRegion="polite"
            style={{ fontSize: 13, color: colors.muted }}
          >
            {notice}
          </Txt>
        )}
        <View style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void exportMetrics()}
            style={{ paddingVertical: 10, alignItems: "center" }}
          >
            <Txt style={{ fontSize: 13, color: colors.purple }}>
              {Platform.OS === "web"
                ? "Copier les mesures"
                : "Partager les mesures"}
            </Txt>
          </Pressable>
        </View>
        {Platform.OS === "ios" && (
          <Txt style={{ fontSize: 13, color: colors.muted }}>
            Cette capture expérimentale reste à valider sur iOS. Reviens au
            vocal classique pour continuer.
          </Txt>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 22,
          paddingTop: 12,
          paddingBottom: 16,
          gap: 10,
          backgroundColor: colors.white,
        }}
      >
        <Button
          onPress={() => void (busy ? pause("pause_user") : start())}
          disabled={Platform.OS !== "android" && Platform.OS !== "web"}
        >
          {busy
            ? "Mettre en pause"
            : phase === "idle"
              ? "Démarrer l’essai"
              : "Reprendre l’écoute"}
        </Button>
        {phase === "listening" && (
          <Button secondary onPress={() => finish()}>
            Terminer ma phrase
          </Button>
        )}
      </View>
    </View>
  );
}
