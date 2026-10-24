import { useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { z } from "zod";
import type { Progress } from "../lib/progress";
import {
  apiRequest,
  defaultApiUrl,
  validServerUrl,
  type Connection,
} from "../lib/api";
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
  setConnection,
  onClose,
}: {
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  connection: Connection | null;
  setConnection: (value: Connection | null) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(connection?.url || defaultApiUrl);
  const [token, setToken] = useState(connection?.token || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const next = { url: validServerUrl(url), token: token.trim() };
      if (next.token.length < 16)
        throw new Error(
          "Le code personnel doit contenir au moins 16 caractères et correspondre à celui du serveur.",
        );
      const response = z
        .object({ ready: z.boolean() })
        .parse(await apiRequest(next, "/api/health"));
      if (!response.ready)
        throw new Error(
          "Le serveur répond, mais sa clé OpenAI n’est pas configurée.",
        );
      setConnection(next);
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
            title="Conversation avec l’IA"
            detail="Un serveur personnel pour protéger ta clé OpenAI."
          />
          {connection && (
            <Badge color={colors.green} background="#EDF4EF" icon="check">
              Serveur connecté
            </Badge>
          )}
          <Txt style={{ color: colors.muted, fontSize: 12 }}>
            Adresse du serveur
          </Txt>
          <TextInput
            accessibilityLabel="Adresse du serveur IA"
            style={s.field}
            autoCapitalize="none"
            keyboardType="url"
            value={url}
            onChangeText={setUrl}
            placeholder="https://mon-serveur.exemple.fr"
          />
          <Txt style={{ color: colors.muted, fontSize: 12 }}>
            Code d’accès personnel du serveur
          </Txt>
          <TextInput
            accessibilityLabel="Code d’accès personnel"
            secureTextEntry
            autoCapitalize="none"
            style={s.field}
            value={token}
            onChangeText={setToken}
            placeholder="Ton code SENSEI_ACCESS_TOKEN"
          />
          <Txt style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
            Ce code reste en mémoire jusqu’à la fermeture. Ta clé OpenAI reste
            sur le serveur. Les enregistrements et messages envoyés à l’IA sont
            traités par OpenAI ; le carnet et la progression restent sur cet
            appareil.
          </Txt>
          {error && (
            <Txt
              accessibilityRole="alert"
              style={{ color: "#A34845", fontSize: 13 }}
            >
              {error}
            </Txt>
          )}
          <Button loading={busy} onPress={() => void connect()} icon="spark">
            {connection ? "Vérifier la connexion" : "Connecter mon serveur"}
          </Button>
          {connection && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
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
