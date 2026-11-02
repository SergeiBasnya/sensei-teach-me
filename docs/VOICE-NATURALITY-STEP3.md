# Étape 3 — bilan du dialogue hybride

2 novembre 2026. Référence `cf8fae9`, branche `codex/voice-recovery-diagnostics`.
PR #1 conservée en brouillon, aucune fusion. **GO technique pour soumettre un seul
essai humain expérimental libre de cinq minutes ; NO-GO production maintenu.**
L’expérience Android reste à observer après la revue de l’utilisateur.

## Défauts reproduits et corrections

| Cas | Avant observé | Après observé / correction |
| --- | --- | --- |
| Origine puis cinéma | `ベルギーから来ました。今日は映画の話をしたいです。` → `どこに住んでいますか？` | `映画の話ですね。最近、どんな映画を見ましたか？` : changement de sujet prioritaire, Qwen garde la formulation. Aucun goût pour le cinéma attribué. |
| Sens d’un mot | « Que veut dire omoshirokatta ? » produit une fausse règle de politesse, puis en chaîne une fausse correction kanji/kana. | Parcours d’aide, explication française contrôlée de « c’était intéressant / amusant », puis reprise de la question. Pas une correction ni une réponse personnelle. |
| Toilettes inconnues + commande | Apparié : repli correct ; en chaîne : Qwen change une valeur de service, le garde-fou rejette et la conversation s’arrête. | Choix de la réponse prudente avant génération pour cette intention étroite : deux thés chauds conservés, localisation inconnue reconnue. Le rejet d’un candidat réellement invalide reste en place. |
| Un thé au lieu de deux | Le repli de l’étape 1 conservait déjà chaud en apparié ; tour non exécuté après l’arrêt en chaîne. | Même conservation confirmée en chaîne, sans redemander la température. Protection conservée, pas un gain nouveau. |
| « Combien ? » elliptique | `いくらですか？` aboutit par génération en apparié. | Réponse contrôlée uniquement si un article unique est connu ; prix explicitement lié au thé, jamais total calculé ou tarif inventé. |
| Question quotidienne répétée | Le correcteur de question trop ouverte repose `日本語を毎日勉強しますか？` même après exploration. | Confirmation pertinente sans question obligatoire ; ne redemande plus cette même habitude. Reproduction mécanique, pas essai humain. |
| Préférences explicites | `お茶も好きです。` absent du registre temporaire ; oui/non à une question de goût non retenu. | Ces formes explicites sont conservées. Un souhait de sujet reste distinct d’un goût. Le registre reste borné, sans prétention d’analyse universelle. |
| Traduction du film | `面白かったですか？` devient notamment « As-tu trouvé ça drôle ? ». | « C’était intéressant ? », avec le film de chats conservé. Une structure entière doit être couverte pour utiliser la traduction contrôlée. |
| Départ demain demandé en français | Modèle `あした出かけます。`, « Je sors demain », trop spécifique pour ce départ en gare. | Paire exacte `明日出発します。` / « Je pars demain. », fournie sur demande, sans l’enregistrer comme fait de l’élève. |
| Origine dans la vérification de latence | `フランスから来ましたね。どんなところですか？` persiste malgré les consignes N5. | Protection étroite sur ce candidat après une origine seule : réutilise la question simple de domicile inconnu. Ne remplace ni un autre candidat, ni un changement de sujet, ni un domicile connu. |

Le contrôleur laisse passer le changement de sujet avant le canevas de présentation.
Les consignes partagées prennent l’intention et les faits comme contraintes, sans
imposer une relance à chaque tour. L’objectif guidé ne contredit plus une question
ou un aparté explicite. Qwen reste génératif pour la conversation appropriée ; les
choix de service restent contrôlés. Aucun nouveau modèle, délai de silence,
dépendance ou écran. Les [consignes complètes avant/après](VOICE-NATURALITY-PROMPTS-STEP3.md)
sont conservées pour revue.

Dans le classique, les messages d’aide restent affichés mais ne sont plus envoyés
comme faits conversationnels. Dans le laboratoire, l’aide ne remplace plus la
question utilisée pour interpréter la réponse suivante. Les règles de révision,
mémoire et progression ne sont pas modifiées ; le laboratoire n’y écrit toujours
pas. Le classique et l’hybride restent disponibles, sans promotion du comparateur
entièrement génératif.

## Comparaison et revue explicite

Trois conversations fictives de quatre tours : cinéma après présentation, café avec
changement de quantité et question inconnue, gare avec aide et réponse effective.
Cas connus prolongés et nouveaux tours utiles, pas de nouvelles voix humaines.
Un seul contrat `ja-first`, hybride, VOICEVOX existant, cache audio désactivé.

- **Apparié** : les douze entrées et historiques sont identiques, empreintes
  vérifiées. Avant : 12 réponses disponibles ; après : 12. Des réponses disponibles
  avant étaient pédagogiquement fausses, notamment l’explication du mot.
- **En chaîne** : l’historique utilise les vraies réponses, sans remplacer un échec
  par la référence. Avant : 10 tentatives, 9 réponses, 1 arrêt au café, 2 tours non
  exécutés. Après : 12 tentatives, 12 réponses, aucun arrêt technique.
- Les demandes d’aide et leurs modèles sont exclus de l’historique comme dans le
  laboratoire. Les contextes en chaîne divergent : une même phrase d’élève peut
  mieux répondre à la question de référence qu’à celle effectivement générée.

**Jugement d’agent, pas certification linguistique :** les sorties finales suivent
le cinéma, ne déduisent pas un goût, gardent Kyoto/aller simple/un billet et le thé
chaud après changement de quantité. Les relances cinéma portent successivement sur
un film, son contenu et un avis ; le service sait confirmer sans ajouter de question.
Les traductions du corpus final conservent les intentions. Les explications et
phrases finales ont été lues en contexte, au-delà de la validité JSON.

La revue détaillée par tour distingue intention, faits, invention, pertinence,
variété, simplicité, traduction, continuité et disponibilité dans
[la preuve publique fictive](evidence/voice-naturality/step3.json). Aucun score de
naturalité n’est calculé. Les contrôles mécaniques démontrent les cas couverts,
les rejets et l’intégrité des contrats ; ils ne démontrent pas un japonais parfait
ni une sensation agréable au téléphone. La revue humaine reste en attente.

Trois passages intermédiaires sur ce même corpus ont servi à corriger les défauts
retrouvés avant qualification finale ; leurs effectifs et échecs sont déclarés
dans la preuve. Ils ne sont pas agrégés comme des utilisateurs ou des preuves
indépendantes. Les modèles de développement sont restés chargés ; GPU non exclusif.

## Latences et compromis

**Après texte, corpus apparié, premier WAV émis sur le Mac** : médiane
2,988 → 2,061 s, maximum 6,269 → 4,354 s, 0 échec technique sur 12 de chaque côté.
Fin de réponse médiane 2,988 → 2,061 s ; fin de tout traitement observé
3,574 → 2,062 s. Ces agrégats mélangent les chemins et les aides corrigées : ce
n’est pas une mesure causale d’un gain Qwen ou Android. En chaîne : 1 échec avant,
0 après ; les historiques et effectifs diffèrent, donc pas de gain global comparable.

**Vérification de non-régression de l’étape 2** : mêmes quatre fichiers synthétiques
publics, entrées et transcriptions identiques, trois passages, cache désactivé.
Référence : session finale de l’étape 2 déjà conservée ; une nouvelle session après.
Chaque médiane à chaud ci-dessous porte sur quatre observations par chemin.

| Fin explicite de tour → premier WAV reçu sur le Mac | Médiane avant → après | Maximum avant → après | Échecs |
| --- | ---: | ---: | --- |
| Contrôlé, chaud | 0,666 → 0,665 s | 0,776 → 0,785 s | 0/4 → 0/4 |
| Génératif, chaud | 3,182 → 3,248 s | 3,708 → 3,858 s | 0/4 → 0/4 |

Texte reconnu → WAV : contrôlé 0,560 → 0,565 s ; génératif 3,068 → 3,131 s.
Énergie estimée → WAV : contrôlé 2,654 → 2,673 s ; génératif 5,187 → 5,244 s.
Fin de réponse générative : médiane 3,497 → 3,687 s, maximum 3,708 → 4,756 s :
une sortie a maintenant deux segments synthétisés. Cela allonge ce tour, même si
le premier WAV reste voisin. Ce n’est pas une nouvelle attente de traduction.
Les douze tentatives après ont abouti ; tous les échecs restent comptés.

Le cinéma passe d’une question contrôlée hors sujet à une réponse générée pertinente :
**ce tour est plus lent** (en chaîne, environ 1,639 → 3,652 s après texte).
La pertinence a un coût ici. Les exemples de service conservent le gain grammatical
et le préchargement de l’étape 2. Aucun gain de reconnaissance de la voix réelle,
de temps réellement entendu ou de reprise du microphone Android n’est revendiqué.

Le secondaire français n’a pas ajouté d’attente après la lecture simulée dans le
corpus final ; cette estimation idéale n’est pas un événement du lecteur Android.
La lecture française d’une aide explicite peut précéder la question japonaise sur
le téléphone et reste hors de la mesure du premier WAV japonais serveur.

## Limites, régressions et protections

Les formulations de gare restent parfois formelles (`お時間はいつごろですか？`) et
la traduction générée peut encore ajouter « hein ». La vérification de latence
fait apparaître un éloge automatique `とてもいいですね！` avant une question :
**régression de style observée**, conservée comme limite secondaire à juger, pas
présentée comme un dialogue débarrassé de toute rigidité. Le mot demandé reçoit une
explication contrôlée ; les demandes hors catalogue restent génératives et ne sont
pas des règles vérifiées par un professeur humain. La description d’un pays a un
repli limité, pas un filtre universel du niveau N5.

Les questions inconnues complexes/conditionnelles et commandes multiples restent
hors du repli étroit et peuvent encore échouer. La mémoire temporaire de contexte
est bornée et prudente ; les protections ne prouvent pas l’absence de toute
invention. La reconnaissance Android, les hésitations coupées, la voix et le
ressenti n’ont pas été revalidés. Aucune nouvelle prise n’est demandée dans ce lot.

191 tests Node, 193 tests Python, TypeScript, format, export Android et garde studio
passent. Les contre-tests conservent le rejet des JSON incomplets, rôles inversés,
quantités/prix/températures faux, échecs de modèle et de lecture. Les tests du secours
post-génération l’exercent explicitement en politique générative ; un test distinct
vérifie que l’hybride ne génère même plus ce candidat sur l’intention étroite connue.
Signaux faibles, ASR final prioritaire, silences et marge de capture, grammaire
strictement contrôlée, préchargement, pause/annulation/reprise restent protégés.
Aucun fichier vocal personnel n’a été créé ni publié.

## Prochaine observation, puis arrêt

Procédure : [un seul essai Android libre de cinq minutes](VOICE-NATURALITY-ANDROID.md),
sans phrases imposées ni conservation audio obligatoire, après revue de ce bilan.
Lot client/serveur attendu : `2026-11-02.dialogue-3`, commit serveur de livraison,
sources propres. Le bilan numérique existant expose ces métadonnées sûres.
Le serveur de développement était antérieur aux trois étapes ; un redémarrage du
seul processus API du projet est nécessaire pour charger le commit qualifié.
Le bilan de livraison précise sa vérification, distincte de celle du téléphone.

**Décision limitée : prêt pour cet essai humain expérimental**, avec les limites
ci-dessus visibles, sans GO de production. Jugement attendu : compréhension,
rapidité ressentie, naturel et utilité pédagogique. Aucun nouveau lot, fusion ou
autre demande de test manuel n’est lancé après cette livraison.
