import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { healthSchema } from "../../shared/contracts";
import type { Progress } from "../lib/progress";
import { apiRequest, validServerUrl, type Connection } from "../lib/api";
import { isLoopbackUrl, type ConnectionConfig } from "../lib/connection-config";
import type { ConnectionStatus } from "../lib/use-connection";
import { appStyles as s } from "../styles";
import { voiceCredit } from "../data/recorded-speech";
import {
  Badge,
  Button,
  colors,
  IconButton,
  Panel,
  SectionTitle,
  Txt,
} from "../components/ui";
export function Settings({
  progress,
  setProgress,
  connection,
  savedConnection,
  connectionStatus,
  connectionError,
  suggestedUrl,
  reconnect,
  setConnection,
  onClose,
}: {
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  connection: Connection | null;
  savedConnection: ConnectionConfig | null;
  connectionStatus: ConnectionStatus;
  connectionError: string;
  suggestedUrl: string;
  reconnect: () => Promise<boolean>;
  setConnection: (value: Connection | null) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(
    connection?.url || savedConnection?.url || suggestedUrl,
  );
  const [token, setToken] = useState(
    connection?.token || savedConnection?.token || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edited = useRef(false);
  useEffect(() => {
    if (edited.current) return;
    setUrl(connection?.url || savedConnection?.url || suggestedUrl);
    setToken(connection?.token || savedConnection?.token || "");
  }, [connection, savedConnection, suggestedUrl]);
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const next = { url: validServerUrl(url), token: token.trim() };
      if (Platform.OS !== "web" && isLoopbackUrl(next.url))
        throw new Error(
          "Sur ton téléphone, utilise l’adresse Wi-Fi de ton Mac. localhost désigne le téléphone lui-même.",
        );
      if (next.token.length < 16)
        throw new Error(
          "Le code personnel doit contenir au moins 16 caractères et correspondre à celui du serveur.",
        );
      const response = healthSchema.parse(
        await apiRequest(next, "/api/health"),
      );
      if (!response.ready)
        throw new Error(
          response.warming
            ? "Les moteurs locaux démarrent. Réessaie dans quelques secondes."
            : "Le serveur répond, mais le moteur local doit être installé et lancé.",
        );
      setConnection({
        ...next,
        mode: response.mode === "openai" ? "openai" : "local",
        oral: response.oral,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connexion impossible. Vérifie l’adresse du serveur.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.settings}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 22,
        }}
      >
        <Txt style={{ fontSize: 23, fontWeight: "700" }}>À ton rythme</Txt>
        <IconButton
          name="close"
          label="Fermer les réglages"
          onPress={onClose}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 28,
          gap: 22,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 14 }}>
          <SectionTitle title="Ton apprentissage" />
          <Txt style={{ fontSize: 13, color: colors.muted }}>
            Objectif quotidien
          </Txt>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {([5, 10, 15] as const).map((goal) => (
              <Pressable
                key={goal}
                accessibilityRole="radio"
                accessibilityState={{ selected: progress.goal === goal }}
                onPress={() =>
                  setProgress((previous) => ({ ...previous, goal }))
                }
                style={{
                  paddingVertical: 12,
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor:
                    progress.goal === goal ? colors.purple : "#F2EFF8",
                }}
              >
                <Txt
                  style={{
                    textAlign: "center",
                    color: progress.goal === goal ? "#FFF" : colors.muted,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {goal} min
                </Txt>
              </Pressable>
            ))}
          </View>
          {(
            [
              { key: "romaji", label: "Afficher le romaji" },
              { key: "translation", label: "Traduction française" },
              { key: "autoSpeak", label: "Lire les réponses de Mochi" },
            ] as const
          ).map((item) => (
            <View
              key={item.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 15,
              }}
            >
              <Txt style={{ fontSize: 14, flex: 1 }}>{item.label}</Txt>
              <Switch
                accessibilityLabel={item.label}
                value={progress[item.key]}
                onValueChange={(value) =>
                  setProgress((previous) => ({
                    ...previous,
                    [item.key]: value,
                  }))
                }
                trackColor={{ true: colors.purple }}
              />
            </View>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Txt style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
          Voix de synthèse : {voiceCredit}. Les exercices sont lus à vitesse
          normale, sans connexion.
        </Txt>
        <View style={{ gap: 12 }}>
          <SectionTitle
            title="Conversation orale"
            detail="Associe ton téléphone à Mochi une fois, puis retrouve ta connexion à chaque ouverture."
          />
          {connectionStatus === "ready" && connection && (
            <Badge color={colors.green} background="#EDF4EF" icon="check">
              {connection.mode === "local"
                ? "Vocal gratuit prêt"
                : "Serveur OpenAI connecté"}
            </Badge>
          )}
          {connectionStatus === "checking" && (
            <Txt
              accessibilityLiveRegion="polite"
              style={{ color: colors.muted, fontSize: 13 }}
            >
              Vérification du vocal…
            </Txt>
          )}
          {connectionStatus === "partial" && (
            <Txt style={{ color: colors.muted, fontSize: 13 }}>
              Le dialogue est connecté, mais la voix est indisponible.
            </Txt>
          )}
          {connectionStatus === "offline" && (
            <Txt style={{ color: colors.muted, fontSize: 13 }}>
              Mochi n’est pas joignable. Vérifie que ton Mac est allumé et
              accessible depuis ton téléphone.
            </Txt>
          )}
          {(connectionStatus === "offline" || connectionStatus === "empty") &&
            (savedConnection || Platform.OS === "web") && (
              <Pressable
                accessibilityRole="button"
                onPress={() => void reconnect()}
                style={{ paddingVertical: 8 }}
              >
                <Txt style={{ color: colors.purple, fontSize: 13 }}>
                  Réessayer la connexion au vocal
                </Txt>
              </Pressable>
            )}
          <Txt style={{ color: colors.muted, fontSize: 12 }}>
            Adresse du serveur
          </Txt>
          <TextInput
            accessibilityLabel="Adresse du serveur IA"
            style={s.field}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={url}
            maxLength={500}
            onChangeText={(value) => {
              edited.current = true;
              setUrl(value);
            }}
            placeholder="https://mon-serveur.exemple.fr"
          />
          <Txt style={{ color: colors.muted, fontSize: 12 }}>
            Code d’accès personnel du serveur
          </Txt>
          <TextInput
            accessibilityLabel="Code d’accès personnel"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={s.field}
            value={token}
            maxLength={512}
            onChangeText={(value) => {
              edited.current = true;
              setToken(value);
            }}
            placeholder="Le code fourni pour ton téléphone"
          />
          <Txt style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
            {connection?.mode === "openai"
              ? "Ce serveur utilise OpenAI : audio et messages lui sont transmis. Les explications françaises sont aussi envoyées à Microsoft pour la voix Vivienne."
              : "Le dialogue et la reconnaissance restent sur ton Mac, qui doit rester allumé. La voix française Vivienne utilise Internet : ses textes sont transmis à Microsoft. Aucun compte ni clé OpenAI nécessaire."}
            {Platform.OS !== "web"
              ? " La connexion est conservée dans le stockage sécurisé de ton téléphone."
              : " L’aperçu sur ce Mac se reconnecte automatiquement au serveur local."}
          </Txt>
          {error && (
            <Txt
              accessibilityRole="alert"
              style={{ color: "#A34845", fontSize: 13 }}
            >
              {error}
            </Txt>
          )}
          {connectionError && (
            <Txt
              accessibilityRole="alert"
              style={{ color: "#A34845", fontSize: 13 }}
            >
              {connectionError}
            </Txt>
          )}
          <Button loading={busy} onPress={() => void connect()} icon="spark">
            {connection ? "Vérifier la connexion" : "Connecter mon serveur"}
          </Button>
          {connection && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                edited.current = false;
                setConnection(null);
                setToken("");
              }}
              style={{ alignItems: "center", padding: 9 }}
            >
              <Txt style={{ fontSize: 13, color: colors.muted }}>
                Déconnecter le serveur
              </Txt>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
