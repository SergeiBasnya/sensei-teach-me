import type { LessonId, ScenarioId } from "./contracts";

export type Lesson = {
  id: LessonId;
  scenario: Exclude<ScenarioId, "free">;
  title: string;
  focus: string;
  turnIndex: number;
};
export const chapters: { title: string; lessons: Lesson[] }[] = [
  {
    title: "Faire connaissance",
    lessons: [
      {
        id: "meet-name",
        scenario: "meet",
        title: "Te présenter",
        focus: "Introduce yourself and ask a person's name.",
        turnIndex: 0,
      },
      {
        id: "meet-origin",
        scenario: "meet",
        title: "Dire d’où tu viens",
        focus:
          "Say where you come from and ask about someone's home country or city.",
        turnIndex: 1,
      },
      {
        id: "meet-likes",
        scenario: "meet",
        title: "Parler de tes goûts",
        focus: "Say what you like and ask about simple interests.",
        turnIndex: 2,
      },
    ],
  },
  {
    title: "Au café",
    lessons: [
      {
        id: "cafe-order",
        scenario: "cafe",
        title: "Commander une boisson",
        focus: "Order one drink politely at a Japanese cafe.",
        turnIndex: 0,
      },
      {
        id: "cafe-choice",
        scenario: "cafe",
        title: "Choisir chaud ou glacé",
        focus:
          "Choose a hot or iced drink and answer simple choices at a cafe.",
        turnIndex: 1,
      },
      {
        id: "cafe-finish",
        scenario: "cafe",
        title: "Compléter ta commande",
        focus: "Ask for something else or politely finish an order.",
        turnIndex: 2,
      },
    ],
  },
  {
    title: "Prendre le train",
    lessons: [
      {
        id: "station-destination",
        scenario: "station",
        title: "Indiquer ta destination",
        focus: "Say your train destination and ask where to go.",
        turnIndex: 0,
      },
      {
        id: "station-ticket",
        scenario: "station",
        title: "Acheter un billet",
        focus:
          "Ask for one train ticket and choose a one-way or return ticket.",
        turnIndex: 1,
      },
      {
        id: "station-thanks",
        scenario: "station",
        title: "Remercier et conclure",
        focus:
          "Understand a short platform indication, thank the person and end the exchange.",
        turnIndex: 2,
      },
    ],
  },
];
export const lessons = chapters.flatMap((chapter) => chapter.lessons);
export function getLesson(id?: LessonId) {
  return lessons.find((lesson) => lesson.id === id);
}
