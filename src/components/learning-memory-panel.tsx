import { useState } from "react";
import { Platform, Pressable, View, type TextStyle } from "react-native";
import {
  dueReviews,
  exposeModel,
  forgetMemory,
  learnerContext,
  skills,
  supportLabels,
} from "../../shared/learning-memory";
import type { Progress } from "../lib/progress";
import type { Scene } from "../data/lessons";
import { reviewScene } from "../lib/review-scene";
import { Button, colors, Panel, Txt } from "./ui";

const balancedJapanese: TextStyle & { textWrap?: "balance" } =
  Platform.OS === "web" ? { textWrap: "balance" } : {};

export function LearningMemoryPanel({
  progress,
  setProgress,
  start,
}: {
  progress: Progress;
  setProgress: React.Dispatch<React.SetStateAction<Progress>>;
  start: (scene: Scene) => void;
}) {
  const [opened, setOpened] = useState(new Set<string>());
  const due = dueReviews(progress.learning),
    learner = learnerContext(progress.learning);
  const items = [...progress.learning.items].sort(
    (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt),
  );
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Txt style={{ fontSize: 23, lineHeight: 31, fontWeight: "600" }}>
          {due.length
            ? `${due.length} point${due.length > 1 ? "s" : ""} à reprendre`
            : "Tes prochains rappels"}
        </Txt>
        <Txt style={{ color: colors.muted }}>
          Accompagnement : {supportLabels[learner.support]}
        </Txt>
        <Txt style={{ fontSize: 14, lineHeight: 22, color: colors.muted }}>
          Mochi adapte son aide d’après tes révisions sans modèle.
        </Txt>
      </View>
      {items.length === 0 && (
        <Txt>
          Les corrections et les objectifs pratiqués seront gardés ici pour les
          revoir plus tard.
        </Txt>
      )}
      {items.map((item) => {
        const isDue = Date.parse(item.dueAt) <= Date.now(),
          expanded = opened.has(item.id);
        const date = new Date(item.dueAt).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
        });
        return (
          <Panel key={item.id} style={{ gap: 14, padding: 20 }}>
            <Txt style={{ fontSize: 19, lineHeight: 27, fontWeight: "600" }}>
              {skills[item.skill].title}
            </Txt>
            <Txt style={{ fontSize: 13, lineHeight: 21, color: colors.muted }}>
              {isDue ? "À revoir aujourd’hui" : `Prochain rappel : ${date}`} ·{" "}
              {item.occurrences
                ? `${item.occurrences} erreur${item.occurrences > 1 ? "s" : ""} corrigée${item.occurrences > 1 ? "s" : ""}`
                : "Point pratiqué"}
            </Txt>
            <Button onPress={() => start(reviewScene(item))}>
              {isDue ? "Réviser ce point" : "S’entraîner"}
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => {
                if (!expanded)
                  setProgress((previous) => ({
                    ...previous,
                    learning: exposeModel(
                      previous.learning,
                      item.id,
                      new Date().toISOString(),
                    ),
                  }));
                setOpened((previous) => {
                  const next = new Set(previous);
                  if (expanded) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
              }}
              style={{ paddingVertical: 8 }}
            >
              <Txt style={{ color: colors.purple, fontSize: 14 }}>
                {expanded ? "Masquer la correction" : "Voir la correction"}
              </Txt>
            </Pressable>
            {expanded && (
              <View style={{ gap: 12 }}>
                {!!item.original && (
                  <Txt
                    style={{
                      fontSize: 14,
                      lineHeight: 23,
                      color: colors.muted,
                    }}
                  >
                    Tu avais dit : {item.original}
                  </Txt>
                )}
                <Txt
                  textBreakStrategy="balanced"
                  style={[
                    { fontSize: 22, lineHeight: 34, fontWeight: "600" },
                    balancedJapanese,
                  ]}
                >
                  {item.reference.japanese}
                </Txt>
                {progress.romaji && (
                  <Txt style={{ color: colors.purple }}>
                    {item.reference.romaji}
                  </Txt>
                )}
                <Txt>{item.reference.french}</Txt>
                <Txt style={{ fontSize: 14, lineHeight: 23 }}>
                  {item.explanation}
                </Txt>
                <Txt
                  style={{ fontSize: 13, lineHeight: 21, color: colors.muted }}
                >
                  Modèle consulté : ce point sera repris sans aide plus tard.
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setProgress((previous) => ({
                      ...previous,
                      learning: forgetMemory(previous.learning, item.id),
                    }))
                  }
                  style={{ paddingVertical: 12 }}
                >
                  <Txt style={{ fontSize: 14, color: colors.muted }}>
                    Retirer ce point
                  </Txt>
                </Pressable>
              </View>
            )}
          </Panel>
        );
      })}
    </View>
  );
}
