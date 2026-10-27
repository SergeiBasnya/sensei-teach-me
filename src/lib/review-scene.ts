import type { Scene } from "../data/lessons";
import {
  reviewQuestion,
  skills,
  type MemoryItem,
} from "../../shared/learning-memory";

export function reviewScene(item: MemoryItem): Scene {
  return {
    id: item.scenario,
    title: skills[item.skill].title,
    subtitle: "Révision ciblée",
    place: "Avec Mochi",
    color: "#EFE9FF",
    minutes: 3,
    icon: "chat",
    review: {
      id: item.id,
      skill: item.skill,
      reference: item.reference,
      explanation: item.explanation,
    },
    reviewAssisted:
      !!item.lastModelAt &&
      Date.now() - Date.parse(item.lastModelAt) < 86_400_000,
    turns: [{ tutor: reviewQuestion(), suggestion: item.reference }],
    ending: {
      japanese: "よくできました！",
      romaji: "Yoku dekimashita!",
      french: "Bien joué !",
    },
  };
}
