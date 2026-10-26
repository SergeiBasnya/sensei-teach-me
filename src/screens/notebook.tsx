import { useMemo, useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { useJapaneseSpeech } from "../components/japanese-speech";
import type { Progress } from "../lib/progress";
import { Icon, Mochi } from "../components/art";
import { appStyles as s } from "../styles";
import {
  Badge,
  Button,
  colors,
  IconButton,
  Panel,
  SectionTitle,
  Txt,
} from "../components/ui";
export function Notebook({
  progress,
  setProgress,
  onStart,
}: {
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  onStart: () => void;
}) {
  const { speakJapanese, error: speechError } = useJapaneseSpeech();
  const [search, setSearch] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const words = useMemo(
    () =>
      progress.words.filter(
        (word) =>
          (!onlyNew || !word.learned) &&
          `${word.japanese} ${word.romaji} ${word.french}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
      ),
    [progress.words, search, onlyNew],
  );
  return (
    <View style={{ gap: 22 }}>
      {speechError && (
        <Txt accessibilityRole="alert" style={{ color: "#8B443D" }}>
          {speechError}
        </Txt>
      )}
      <SectionTitle
        title="Ton petit carnet japonais"
        detail={`${progress.words.length} expressions rencontrées · ${progress.words.filter((w) => w.learned).length} marquées comme acquises`}
      />
      {progress.words.length === 0 ? (
        <Panel style={{ alignItems: "center", gap: 17, paddingVertical: 35 }}>
          <Mochi size={150} />
          <Txt style={{ fontSize: 20, fontWeight: "700" }}>
            Les premiers mots t’attendent.
          </Txt>
          <Txt
            style={{ textAlign: "center", color: colors.muted, maxWidth: 330 }}
          >
            Tes conversations enrichissent ce carnet. Tu peux aussi enregistrer
            la phrase du jour.
          </Txt>
          <Button onPress={onStart}>Faire ma première conversation</Button>
        </Panel>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Rechercher dans mon carnet"
            value={search}
            onChangeText={setSearch}
            placeholder="Un mot en japonais, romaji ou français…"
            style={s.field}
          />
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Switch
              value={onlyNew}
              onValueChange={setOnlyNew}
              trackColor={{ true: colors.purple }}
              accessibilityLabel="Afficher uniquement les expressions à revoir"
            />
            <Txt style={{ fontSize: 13, color: colors.muted }}>
              À revoir seulement
            </Txt>
          </View>
          {words.length === 0 && (
            <Txt>Aucune expression pour cette recherche.</Txt>
          )}
          {words.map((word) => (
            <Panel key={word.id} style={{ gap: 8 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Txt style={{ flex: 1, fontSize: 23, lineHeight: 34 }}>
                  {word.japanese}
                </Txt>
                <IconButton
                  name="volume"
                  label={`Écouter ${word.japanese}`}
                  onPress={() => void speakJapanese(word.japanese)}
                />
              </View>
              {progress.romaji && (
                <Txt style={{ fontSize: 13, color: colors.purple }}>
                  {word.romaji}
                </Txt>
              )}
              <Txt style={{ color: colors.muted, fontSize: 14 }}>
                {word.french}
              </Txt>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: word.learned }}
                onPress={() =>
                  setProgress((previous) => ({
                    ...previous,
                    words: previous.words.map((w) =>
                      w.id === word.id ? { ...w, learned: !w.learned } : w,
                    ),
                  }))
                }
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  alignSelf: "flex-start",
                  paddingVertical: 10,
                }}
              >
                <Icon
                  name={word.learned ? "check" : "book"}
                  size={16}
                  color={colors.green}
                />
                <Txt style={{ fontSize: 12, color: colors.green }}>
                  {word.learned
                    ? "Expression acquise"
                    : "Marquer comme acquise"}
                </Txt>
              </Pressable>
            </Panel>
          ))}
        </>
      )}
    </View>
  );
}
