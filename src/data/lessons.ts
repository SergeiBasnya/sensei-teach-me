import type { Phrase, ScenarioId } from "../../shared/contracts";

export type Scene = {
  id: ScenarioId;
  title: string;
  subtitle: string;
  place: string;
  color: string;
  minutes: number;
  icon: "smile" | "coffee" | "train" | "chat";
  turns: { tutor: Phrase; suggestion: Phrase }[];
  ending: Phrase;
};
export const scenes: Scene[] = [
  {
    id: "meet",
    title: "Faire connaissance",
    subtitle: "Les premières présentations",
    place: "Première rencontre",
    color: "#EFE9FF",
    minutes: 3,
    icon: "smile",
    turns: [
      {
        tutor: {
          japanese: "こんにちは！私はもちです。お名前は？",
          romaji: "Konnichiwa! Watashi wa Mochi desu. Onamae wa?",
          french: "Bonjour ! Je suis Mochi. Comment t’appelles-tu ?",
        },
        suggestion: {
          japanese: "私はオーギュストです。",
          romaji: "Watashi wa Ōgyusuto desu.",
          french: "Je m’appelle August.",
        },
      },
      {
        tutor: {
          japanese: "はじめまして！どこから来ましたか？",
          romaji: "Hajimemashite! Doko kara kimashita ka?",
          french: "Enchanté ! D’où viens-tu ?",
        },
        suggestion: {
          japanese: "フランスから来ました。",
          romaji: "Furansu kara kimashita.",
          french: "Je viens de France.",
        },
      },
      {
        tutor: {
          japanese: "そうですか！日本語は好きですか？",
          romaji: "Sō desu ka! Nihongo wa suki desu ka?",
          french: "Ah oui ! Tu aimes le japonais ?",
        },
        suggestion: {
          japanese: "はい、日本語が好きです。",
          romaji: "Hai, nihongo ga suki desu.",
          french: "Oui, j’aime le japonais.",
        },
      },
    ],
    ending: {
      japanese: "よろしくお願いします！また話しましょう。",
      romaji: "Yoroshiku onegaishimasu! Mata hanashimashō.",
      french: "Ravi de te connaître ! On se reparle bientôt.",
    },
  },
  {
    id: "cafe",
    title: "Un café à Tokyo",
    subtitle: "Commander comme au Japon",
    place: "Dans un petit café",
    color: "#F8EDDE",
    minutes: 4,
    icon: "coffee",
    turns: [
      {
        tutor: {
          japanese: "いらっしゃいませ！何にしますか？",
          romaji: "Irasshaimase! Nani ni shimasu ka?",
          french: "Bienvenue ! Qu’est-ce que vous prenez ?",
        },
        suggestion: {
          japanese: "コーヒーを一つください。",
          romaji: "Kōhī o hitotsu kudasai.",
          french: "Un café, s’il vous plaît.",
        },
      },
      {
        tutor: {
          japanese: "ホットですか、アイスですか？",
          romaji: "Hotto desu ka, aisu desu ka?",
          french: "Chaud ou glacé ?",
        },
        suggestion: {
          japanese: "ホットでお願いします。",
          romaji: "Hotto de onegaishimasu.",
          french: "Chaud, s’il vous plaît.",
        },
      },
      {
        tutor: {
          japanese: "かしこまりました。ほかに何か？",
          romaji: "Kashikomarimashita. Hoka ni nanika?",
          french: "Très bien. Autre chose ?",
        },
        suggestion: {
          japanese: "いいえ、ありがとうございます。",
          romaji: "Iie, arigatō gozaimasu.",
          french: "Non, merci beaucoup.",
        },
      },
    ],
    ending: {
      japanese: "ありがとうございます。ごゆっくりどうぞ！",
      romaji: "Arigatō gozaimasu. Goyukkuri dōzo!",
      french: "Merci. Prenez votre temps !",
    },
  },
  {
    id: "station",
    title: "Direction Kyoto",
    subtitle: "Trouver son chemin en gare",
    place: "À la gare de Tokyo",
    color: "#E7F0EB",
    minutes: 4,
    icon: "train",
    turns: [
      {
        tutor: {
          japanese: "こんにちは。どちらまでですか？",
          romaji: "Konnichiwa. Dochira made desu ka?",
          french: "Bonjour. Quelle est votre destination ?",
        },
        suggestion: {
          japanese: "京都までお願いします。",
          romaji: "Kyōto made onegaishimasu.",
          french: "Jusqu’à Kyoto, s’il vous plaît.",
        },
      },
      {
        tutor: {
          japanese: "片道ですか、往復ですか？",
          romaji: "Katamichi desu ka, ōfuku desu ka?",
          french: "Un aller simple ou un aller-retour ?",
        },
        suggestion: {
          japanese: "片道を一枚ください。",
          romaji: "Katamichi o ichimai kudasai.",
          french: "Un aller simple, s’il vous plaît.",
        },
      },
      {
        tutor: {
          japanese: "はい。新幹線は三番線です。",
          romaji: "Hai. Shinkansen wa sanbansen desu.",
          french: "Bien. Le Shinkansen est sur la voie trois.",
        },
        suggestion: {
          japanese: "ありがとうございます。",
          romaji: "Arigatō gozaimasu.",
          french: "Merci beaucoup.",
        },
      },
    ],
    ending: {
      japanese: "どういたしまして。よい旅を！",
      romaji: "Dō itashimashite. Yoi tabi o!",
      french: "Je vous en prie. Bon voyage !",
    },
  },
];
export const freeScene: Scene = {
  id: "free",
  title: "Conversation libre",
  subtitle: "Parle de ce qui te plaît",
  place: "Avec Mochi",
  color: "#EFE9FF",
  minutes: 5,
  icon: "chat",
  turns: [
    {
      tutor: {
        japanese: "こんにちは！今日は何を話しましょうか？",
        romaji: "Konnichiwa! Kyō wa nani o hanashimashō ka?",
        french: "Bonjour ! De quoi veux-tu parler aujourd’hui ?",
      },
      suggestion: {
        japanese: "日本の食べ物が好きです。",
        romaji: "Nihon no tabemono ga suki desu.",
        french: "J’aime la cuisine japonaise.",
      },
    },
  ],
  ending: {
    japanese: "また話しましょう！",
    romaji: "Mata hanashimashō!",
    french: "On se reparle bientôt !",
  },
};
export const dailyPhrase: Phrase = {
  japanese: "少しずつ、毎日。",
  romaji: "Sukoshi zutsu, mainichi.",
  french: "Un petit peu, chaque jour.",
};
