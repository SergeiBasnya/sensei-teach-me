import type { DialogueCase, DialogueTurn } from "./dialogue-cases";

const turn = (
  id: string,
  text: string,
  referenceAssistant: string,
  manualChecks: string[],
): DialogueTurn => ({
  id,
  text,
  referenceAssistant,
  manualChecks,
  tags: [],
  correction: "none",
});

/** Twelve fictional text turns. No human ASR or objective naturality score. */
export const naturalDialogueCases: readonly DialogueCase[] = [
  {
    id: "intro-cinema",
    scenario: "meet",
    rollout: true,
    serviceFacts: [],
    initialHistory: [{ role: "assistant", content: "どこから来ましたか？" }],
    turns: [
      turn(
        "topic-change",
        "ベルギーから来ました。今日は映画の話をしたいです。",
        "映画の話ですね。最近、映画を見ましたか？",
        ["Suivre le cinéma, garder la Belgique, ne pas déduire un goût."],
      ),
      turn("short-answer", "はい、昨日見ました。", "何を見ましたか？", [
        "Réagir au film vu hier, sans redemander si un film a été vu.",
      ]),
      turn(
        "new-film",
        "猫の映画です。",
        "猫の映画ですね。おもしろかったですか？",
        [
          "Reprendre le film de chats, question concrète et courte ; pas de titre inventé.",
        ],
      ),
      turn(
        "word-help",
        "Que veut dire omoshirokatta ?",
        "おもしろかったですか？",
        [
          "Expliquer le mot demandé, sans prendre la demande pour un goût ni une réponse personnelle.",
        ],
      ),
    ],
  },
  {
    id: "cafe-repair",
    scenario: "cafe",
    rollout: true,
    serviceFacts: [
      "Fiction : un thé coûte 350 yens, aucune localisation des toilettes n’est donnée.",
    ],
    initialHistory: [
      {
        role: "assistant",
        content: "お茶は一つ三百五十円です。何にしますか？",
      },
    ],
    turns: [
      turn(
        "order",
        "お茶を二つください。",
        "お茶二つですね。ホットですか、アイスですか？",
        ["Deux thés, pas une commande de Mochi."],
      ),
      turn(
        "unknown-aside",
        "ホットでお願いします。トイレはどこですか？",
        "ホットのお茶二つですね。トイレの場所はわかりません。",
        [
          "Conserver chaud/deux et reconnaître le lieu inconnu sans invention ni arrêt.",
        ],
      ),
      turn(
        "quantity-repair",
        "やっぱり、一つでお願いします。",
        "ホットのお茶一つですね。",
        ["Modifier uniquement la quantité ; ne pas redemander chaud/glacé."],
      ),
      turn("elliptic-price", "いくらですか？", "一つ350円です。", [
        "Résoudre le prix du thé unique ; aucune arithmétique ni nouveau tarif.",
      ]),
    ],
  },
  {
    id: "station-help",
    scenario: "station",
    rollout: true,
    serviceFacts: [],
    initialHistory: [{ role: "assistant", content: "どちらまでですか？" }],
    turns: [
      turn(
        "destination",
        "京都までお願いします。",
        "京都までですね。片道ですか、往復ですか？",
        ["Kyoto, rôle d’agent conservé."],
      ),
      turn(
        "short-choices",
        "片道で、一枚お願いします。",
        "京都まで、片道で一枚ですね。",
        ["Un billet souhaité, aller simple ; ne pas reposer ces questions."],
      ),
      turn(
        "answer-help",
        "Je ne sais pas comment dire que je pars demain.",
        "明日行きます。",
        ["Un modèle, pas un fait personnel ou une réussite indépendante."],
      ),
      turn("actual-answer", "明日行きます。", "明日ですね。", [
        "Accepter le départ demain sans inventer heure, prix ou quai.",
      ]),
    ],
  },
];
