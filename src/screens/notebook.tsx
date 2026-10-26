import { useMemo, useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { useJapaneseSpeech } from "../components/japanese-speech";
import { addWords, type Progress } from "../lib/progress";
import { dailyPhrase } from "../data/lessons";
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
  const hasPracticePhrase = progress.words.some(
    (word) => word.japanese === dailyPhrase.japanese,
  );
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
            Ajoute une première phrase pour la retrouver ici et la revoir quand
            tu veux.
          </Txt>
          <Button onPress={onStart}>Commencer ma leçon</Button>
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
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: word.learned }}
                  aria-checked={word.learned}
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
                {word.japanese === dailyPhrase.japanese && (
                  <IconButton
                    name="star"
                    label="Retirer la phrase du carnet"
                    active
                    onPress={() =>
                      setProgress((previous) => ({
                        ...previous,
                        words: previous.words.filter(
                          (item) => item.id !== word.id,
                        ),
                      }))
                    }
                  />
                )}
              </View>
            </Panel>
          ))}
        </>
      )}
      {!hasPracticePhrase && (
        <Panel style={{ gap: 12 }}>
          <Txt style={{ fontWeight: "600" }}>Une phrase à pratiquer</Txt>
          <Txt style={{ fontSize: 23, lineHeight: 34 }}>
            {dailyPhrase.japanese}
          </Txt>
          {progress.romaji && (
            <Txt style={{ color: colors.purple, fontSize: 13 }}>
              {dailyPhrase.romaji}
            </Txt>
          )}
          <Txt style={{ color: colors.muted }}>{dailyPhrase.french}</Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Button
              secondary
              onPress={() =>
                setProgress((previous) => addWords(previous, [dailyPhrase]))
              }
            >
              Ajouter au carnet
            </Button>
            <IconButton
              name="volume"
              label="Écouter la phrase à pratiquer"
              onPress={() => void speakJapanese(dailyPhrase.japanese)}
            />
          </View>
        </Panel>
      )}
    </View>
  );
}
