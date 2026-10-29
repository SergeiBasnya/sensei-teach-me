# Conversations japonaises d’abord — résultat du lot

29 octobre 2026, suite de `ed70a3d`. **Décision : à retravailler.** Le chemin améliore la cohérence ciblée et avance le premier fichier japonais, mais ses formulations et certaines traductions ne sont pas encore assez fiables pour recommander l’essai humain comme prochaine validation du produit. Cette décision repose sur les dialogues synthétiques réellement examinés ; les prises de voix reportées ne bloquent pas ce lot. Le classique et le contrat `structured` restent les défauts. Aucun nouveau modèle, API payante, écran ou leçon n’est ajouté.

## Défauts compris et changements limités

Le rôle de Mochi était surtout implicite dans la situation. À la gare, les trois contrats pouvaient demander au voyageur le quai au lieu de l’aider ; le compact commandait parfois comme un client de café. Le japonais d’abord acceptait une salutation seule et pouvait ensuite inventer une origine humaine. Un JSON complet valide n’interdisait aucun de ces défauts conversationnels.

Les deux profils expérimentaux reçoivent désormais un rôle explicite et un contexte éphémère : faits déclarés par l’élève, valeurs de service citées avec leur provenance, intention et changements récents. Questions, négations et exemples ne deviennent pas automatiquement des faits. Les consignes demandent une réponse à l’intention avant une relance utile, sans prénom/téléphone inutiles pour des billets ordinaires, sans nouvelle demande sur un fait connu, et sans biographie humaine pour l’IA. Les données inconnues de gare ne sont pas inventées. Des gardes ciblées bloquent certains défauts reconnaissables ; elles ne certifient pas le japonais.

Le parseur attend toujours le JSON entier avant l’audio. Le préfixe `{"japanese":` est conservé pour `ja-first` et appliqué aussi au compact après des refus de format observés dans la première série. Le contrôle grammatical et ses gardes contre les fausses corrections ne sont pas remplacés par un chemin plus rapide. Les consignes classiques et les fichiers de correction restent inchangés. Le [comparatif intégral des textes](voice-dialogue-prompts-before-after.md) permet de lire les remplacements.

Le premier pilote a aussi révélé un faux rejet : une déclaration « voie 3 » suivie d’une question sur la même ligne était oubliée. Le contexte de service est maintenant lu par phrases, tout en conservant l’exclusion des exemples et questions. Les tests couvrent cette régression. Un second pilote a révélé l’origine humaine inventée et un registre japonais trop élaboré ; identité IA et formulations de base ont été renforcées avant les comparaisons complètes.

## Corpus et versions réellement exécutées

Le [protocole](VOICE-DIALOGUE-METHOD.md) décrit cinq conversations de quatre tours : présentation/faits, café avec changement de commande, gare, correction puis réparation, aide et négation. Les prénoms et données de service sont fictifs. La voie 3 et les 350 yens sont fournis comme faits de pratique, jamais comme informations de voyage réelles.

| Épreuve           | Portée                                                     | Rôle dans la décision                                                                    |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Série 01          | 60 réponses appariées + 48 en chaînes, 108 tentatives      | Diagnostiquer refus de format compact, budget français prématuré et conseil effacé.      |
| Série 02          | Même plan, 108 tentatives contrebalancées                  | Comparaison principale des trois contrats après préfixe compact et correction du budget. |
| Qualification 03  | 20 replays + 16 tours en chaînes `ja-first`, 36 tentatives | Vérifier le dernier correctif de conservation des conseils sur le code final.            |
| Annulation finale | Six préemptions, délais de 0/100/600 ms en deux ordres     | Mesurer l’accusé réel d’arrêt du secondaire et la requête suivante.                      |

Les vingt entrées appariées ont exactement la même empreinte d’entrée pour les trois contrats. Les chaînes réutilisent chacune leur véritable réponse et conseil précédents ; leurs historiques divergent. Elles ne sont pas une comparaison à contexte identique. Une réplique élève rédigée peut ne pas répondre à la question nouvellement produite : ces décalages ne sont pas automatiquement des erreurs du modèle.

Les versions ne sont pas fusionnées en un faux essai unique. La série 02 précède le correctif final de fusion des conseils ; la qualification 03 exécute ce correctif. Les vingt replays japonais d’abord gardent exactement les mêmes entrées, japonais, français et corrections entre 02 et 03. En chaînes, trois historiques de café changent parce que le conseil primaire conservé participe à la suite. Toutes les empreintes, échecs et sorties synthétiques restent dans les traces.

## Latence et échecs

**Ces délais vont d’un texte déjà reconnu à un WAV émis, pas de la fin de parole au son Android.** Capture, ASR, silence de fin, réseau, lecteur et oreille humaine sont exclus. Ils ne se comparent pas directement aux anciens 3,22/4,89 secondes obtenues sur six autres entrées isolées. Une passe contrebalancée n’est pas une étude statistique générale. Cache TTS désactivé, un seul Qwen actif.

Série 02, sous-ensemble généré commun de **17 entrées** : une correction et deux pratiques/aides communes sont exclues de ces médianes pour ne pas masquer la génération par un chemin partagé rapide.

| Contrat          | Premier WAV médian | `response_done` médian | Tout travail observé terminé, médiane |
| ---------------- | -----------------: | ---------------------: | ------------------------------------: |
| Structuré actuel |         4 526,1 ms |             4 882,0 ms |                            4 883,3 ms |
| Compact          |         4 261,9 ms |             4 873,9 ms |                            4 875,2 ms |
| Japonais d’abord |         3 538,3 ms |             4 150,3 ms |                            4 765,0 ms |

La différence des médianes premier WAV actuel/JA vaut 987,8 ms. Le **gain apparié médian** sur les mêmes entrées vaut 818,0 ms, avec 17 gains sur 17, de 15,8 à 1 548,1 ms. Ce sont deux calculs distincts. Le gain apparié médian sur `response_done` vaut 538,3 ms ; il tombe à seulement 1,3 ms pour la fin de tout le travail observé. Le français est surtout déplacé après le premier son, pas supprimé. Les contenus et longueurs de réponses diffèrent également entre contrats.

Les 60 tentatives appariées de 02 aboutissent : 20/20 par profil, français présent après nettoyage dans les 60. Sur les chaînes : structuré 15/16, compact 15/16, japonais d’abord 16/16 ; le compact est bloqué sur une réponse d’identité, le structuré échoue sur le tour de deux billets. Ces échecs restent dans les dénominateurs. Dans 02, un français JA de chaîne est absent après annulation ; il n’est jamais compté comme une traduction correcte. Les statistiques par chemin et sous-ensemble sont publiées, sans score global de langue.

La première série n’est pas cachée : compact échoue 13/20 en apparié et 9/16 en chaînes, principalement au parsing JSON sans préfixe. Après l’ajout de ce préfixe, ces refus ne sont plus représentatifs de la version finale du compact. Le garde de rôle n’est pas assoupli pour obtenir les réussites.

La qualification finale 03 réussit **36/36** avec français **36/36**, sans annulation dans cette épreuve. Les 17 replays générés ont des médianes descriptives de 3 406,9 ms au premier WAV, 4 055,1 ms à `response_done` et 4 700,7 ms à la fin du travail. Ces données JA seules ne remplacent pas la comparaison contrebalancée de 02.

## Français et reprise d’écoute

Le serveur émet maintenant `response_done` et rend la main après le dernier WAV, sans attendre la traduction française. Le client attend sa file de lecture puis peut reprendre le micro. Les détails tardifs restent permis uniquement pour le même tour actif, le même japonais et le même conseil primaire ; ils ne changent ni japonais, ni correction, ni rōmaji et ne réécrivent pas l’historique déjà commis. Un nouveau tour, une pause ou une erreur invalide les détails anciens.

Le secondaire dispose d’un plafond de 2,5 secondes après le premier WAV. Pendant les synthèses restantes, il n’utilise pas la durée incomplète du premier segment comme échéance. Après le dernier WAV, l’échéance est affinée avec leur durée totale. Le bug initial a été reproduit par un test : une seconde synthèse de 180 ms faisait annuler le français à la fin d’un premier WAV de 100 ms. Le test passe après correction. Le plafond et la durée WAV sont des estimations serveur, jamais une observation de lecture réelle.

L’annulation est coopérative : un lecteur JSONL observe seulement les contrôles, tandis que le thread principal reste seul à appeler MLX. Le secondaire utilise une génération contrôlée, vérifie l’annulation pendant le préfill et entre tokens, ferme le générateur puis synchronise avant l’accusé terminal. Les requêtes annulées occupent encore leur slot Node jusqu’à cet accusé. Un seul secondaire optionnel laisse un slot pour le travail prioritaire ; une nouvelle requête prioritaire le préempte. Une attente Node abandonnée ne suffit donc plus à prétendre que le moteur est libre.

Sur les six préemptions finales, toutes les traductions sont effectivement annulées et la lecture phonétique suivante réussit. L’accusé arrive entre **54,2 et 219,5 ms**, médiane **96,8 ms** ; la requête de lecture suivante prend 54,5–219,7 ms. Ce contrôle traverse le même worker, mais n’est ni une conversation suivante complète, ni une mesure de microphone, ni une borne matérielle universelle. Un noyau déjà lancé doit finir son étape.

Aucun tour complet de 02 ou 03 n’a une attente positive entre la fin idéale des WAV et `response_done`. Les callbacks observés finissent avant la reprise idéale estimée dans ces épreuves. Cela démontre l’absence de nouvelle attente logicielle du français dans ces traces, pas une reprise Android physiquement validée.

Une autre protection était défectueuse : `details.coaching=null` pouvait effacer un conseil déjà validé. Le dernier correctif rend le conseil primaire immuable dans l’émetteur, le transport et le client. Les deux tests qui reproduisaient la perte passent désormais. Dans 03, les **sept conseils primaires non nuls sont conservés**, et aucun conseil n’est remplacé par le français secondaire. Les trois historiques de café modifiés par cette conservation sont examinés comme une nouvelle qualification.

## Qualité : progrès réels et limites bloquantes

La [revue d’agent](VOICE-DIALOGUE-AGENT-REVIEW.md) donne les exemples et sa portée exacte. Il ne s’agit pas d’une revue humaine ou native certifiée. Les contrôles automatiques distinguent schéma/ordre/correction attendue de signaux lexicaux et d’annotations linguistiques. L’absence de signal n’est pas une bonne note de japonais.

Les améliorations constatées comprennent la salutation suivie d’une question, Belgique/Bruxelles conservées, café remplacé par thé, température rattachée à la nouvelle commande, prix de 350 yens et voie 3 repris depuis la fiction, et identité IA à la place d’une origine humaine inventée. L’erreur volontaire `私はベルギーを来ました。` garde la même correction ciblée en `から`, puis l’échange reprend sans note de maîtrise.

Les vingt objets de correction appariés sont identiques entre profils : dix-neuf nuls et un objet complet identique. Cela soutient l’absence de régression sur ces entrées et le maintien des gardes ; cela ne certifie pas toutes les erreurs possibles. Les chaînes du structuré montrent aussi des corrections excessives de politesse et des explications douteuses ; les historiques y diffèrent, donc on ne peut pas en déduire un taux causal comparatif du correcteur. Le laboratoire ne crée aucun événement d’apprentissage ou de mémoire d’erreur.

Des défauts empêchent encore la recommandation d’essai humain :

- `何枚の切符をお持ちになりますか？` reste trop élaboré et demande les billets possédés plutôt que voulus, malgré les consignes de niveau.
- Le compact émet aussi une confirmation « deux billets » suivie d’une demande portant sur « trois billets » dans le même tour de la série 02. Ce changement de quantité est un défaut réel malgré le JSON accepté.
- La réponse d’identité peut utiliser `来ているわけではありません`, trop complexe pour une introduction orale simple.
- Le français garde du vouvoiement et des tags « hein », et certaines confirmations sont maladroites.
- `ベルギーはどんなところですか？` devient « qu’est-ce que c’est, la Belgique ? », ce qui détourne la demande de description et peut guider l’élève vers une mauvaise réponse.
- Le chemin d’aide commun aux trois profils produit notamment « Je ne t’aime pas le café » pour une phrase japonaise négative sur le café. Le contrôle de négation mécanique laisse passer ce français incorrect. Ce défaut partagé n’est pas dissimulé comme une réussite de traduction ou attribué au seul `ja-first`.

Le lot améliore la structure des échanges et protège le déroulement vocal, mais un prompt plus précis ne garantit pas des formulations adaptées ni une traduction pédagogique fiable. Ajouter un autre chronomètre ou déclarer un JSON correct ne résout pas ces défauts.

## Décision et périmètre livré

**À retravailler ; piste conservée, activation par défaut refusée.** Le prochain travail justifié concerne des relances réellement simples et la fidélité du français, y compris l’aide commune, avec vérification des sens et exemples de non-régression. Une revue linguistique humaine ciblée des textes serait utile avant un essai oral ; elle n’est pas présentée comme accomplie. Aucun nouveau modèle ou fonction pédagogique n’est lancé dans ce lot.

Le serveur remis en route pour le téléphone utilise `structured`. Les variantes restent des choix explicites de développement via `SENSEI_LAB_GENERATION`; l’interface, les voix, les leçons et le mode classique conservent leur fonctionnement. Les prises humaines, la comparaison des quatre Small sur cette voix et la sensation réelle Android restent reportées et non inventées.

Traces publiques exclusivement synthétiques : [avant les corrections de budget/format](evidence/voice-dialogue/comparison-before.json), [comparaison principale 02](evidence/voice-dialogue/comparison.json), [qualification finale JA 03](evidence/voice-dialogue/qualification-ja.json), [annulation réelle](evidence/voice-dialogue/cancellation.json), [calculs 02](evidence/voice-dialogue/analysis-run02.json), [calculs 03](evidence/voice-dialogue/analysis-run03.json). Les corpus audio et références humaines privés ne sont pas publiés.

## Vérifications de livraison

149 tests TypeScript et 117 tests Python passent, ainsi que le typage, le formatage et les exports web/Android/iOS. Ces exports ne sont pas une compilation APK/IPA ni une validation physique sur téléphone. Le contrôle des liserés et ses hooks/CI spécialisée sont conservés ; aucune CI générale n’est ajoutée. Le rendu existant du conseil conservé a été observé dans un Chromium isolé sur l’export web, avec flux synthétique : [relevés](evidence/voice-dialogue/ui-observations.json) et [revue technique](voice-dialogue-technical-review.json). Ce contrôle ne donne aucune validation artistique ou linguistique humaine. Le serveur habituel et Expo ont été vérifiés disponibles après les mesures.
