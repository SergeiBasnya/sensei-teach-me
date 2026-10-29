# Comparer la cohérence des conversations et leur délai vocal

Ce protocole accompagne `scripts/benchmark-voice-dialogue.ts` et le corpus public `scripts/dialogue-cases.ts`. Il complète la comparaison de génération du commit `ed70a3d` avec des historiques à plusieurs tours. Il ne charge aucun nouvel ASR, ne capture aucun microphone et ne remplace pas le mode habituel. Les prises de voix humaine restent reportées.

## Corpus limité et données fictives

Le corpus comporte cinq conversations de quatre tours, soit vingt entrées distinctes. Les prénoms, origines et faits de service sont rédigés pour le test. Le café à 350 yens et la voie 3 pour Kyoto sont des **faits fictifs explicitement fournis dans l’historique initial**, jamais des informations de voyage actuelles.

| Conversation           | Comportements examinés                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `meet-facts`           | Prénom avec hésitation transcrite, pays et ville, réponse courte et question inattendue sur Mochi.              |
| `cafe-change`          | Commande, remplacement café → thé, fragment « chaud », prix déjà donné et rôle de la serveuse.                  |
| `station-service`      | Destination, aller simple, deux billets, question sur une voie déjà donnée et rôle d’aide au voyageur.          |
| `repair-and-repeat`    | Particule incorrecte volontaire, réparation correcte, demande française de répétition et fragment après l’aide. |
| `help-and-preferences` | Aide française, répétition assistée, hésitation avec autocorrection et demande d’expression négative.           |

Les lignes `referenceAssistant` préparent des historiques stables pour les replays. Elles ne sont pas imposées comme réponse unique au modèle et ne certifient pas la qualité linguistique. Elles ne sont pas des références ASR ni des paroles de l’utilisateur.

## Deux comparaisons différentes

**Replays appariés : 60 réponses.** Chaque entrée reçoit le même texte élève et le même historique rédigé dans les trois profils `structured`, `compact` et `ja-first`. Chaque corps envoyé est conservé avec son empreinte SHA-256. Une mutation ou une réponse d’un profil ne peut pas modifier l’historique d’un autre. Les profils tournent en première, deuxième et troisième position selon la conversation et le tour.

**Rollouts : 48 réponses au maximum.** Les conversations identité/faits, café, gare et correction sont aussi jouées comme de vraies chaînes : chaque profil ajoute son propre japonais et son propre conseil au tour suivant, comme le transcript éphémère du laboratoire. Les textes élève sont identiques, mais les historiques divergent. **Ces entrées ne sont donc plus identiques entre profils.** Une réplique élève scénarisée peut ne pas répondre exactement à la dernière question générée ; ce décalage doit être examiné dans la chaîne complète et ne pas être imputé automatiquement au modèle.

Lorsqu’un tour échoue en rollout, son échec reste dans le rapport et l’entrée suivante est tentée contre le dernier historique ayant réellement abouti. Le champ `historyRecovery` précise les tours échoués et la stratégie `unchanged-last-successful-history`. Aucun corrigé rédigé ni réponse d’un autre profil ne vient remplacer l’historique manquant. Une réparation scénarisée après une correction non émise demande donc une lecture prudente de la chaîne. Les replays appariés continuent indépendamment, avec leurs entrées stables.

Une seule passe principale donne au maximum 108 réponses, plus un échauffement par profil sur le premier tour du café. Il ne s’agit ni de répétitions statistiques indépendantes, ni d’une étude de performance générale. Les petits pilotes sélectionnés sont séparés de la série complète. Aucun résultat de mesure n’est inventé dans ce document.

## Délais conservés

Le cache de synthèse est désactivé et le même moteur local est utilisé séquentiellement. Le chronomètre part d’un texte déjà reconnu. Il exclut capture, silence de fin, ASR, réseau, décodage sur le téléphone et observation humaine.

| Mesure                           | Ce qu’elle observe                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstJapaneseAudioEmittedMs`    | Premier WAV complet après validation du tuteur. Ni premier token, ni son au haut-parleur.                                                                     |
| `responseDoneMs`                 | Événement autorisant la fin de réponse ; le client attend aussi sa file de lecture.                                                                           |
| `respondReturnedMs`              | Retour de la fonction principale, même si le français continue ensuite.                                                                                       |
| `secondaryCallbacks[].settledMs` | Résolution ou rejet de la **promesse réelle** de `labDetails`, avec métriques du contexte de timing. Un signal d’annulation seul ne remplit pas cette mesure. |
| `allObservedWorkSettledMs`       | Fin de la fonction principale et des callbacks secondaires observés, après publication de leurs métriques. Ce n’est pas une mesure d’inactivité du GPU.       |
| `totalJapaneseWaveMs`            | Durée des échantillons WAV, calculée avec le même parseur RIFF que le budget de réponse. Elle comprend aussi les éventuels silences.                          |
| `estimatedListeningGateMs`       | File idéale des WAV depuis leur émission, puis attente éventuelle de `response_done`.                                                                         |
| `estimatedHoldAfterLastWaveMs`   | Partie positive de `response_done` après la fin de cette file idéale : risque de blocage, **pas délai Android réellement mesuré**.                            |

Le benchmark attend les promesses secondaires après le retour principal avant de lancer la cellule suivante. Cela évite qu’une traduction précédente perturbe la comparaison suivante, sans confondre fin du français et disponibilité du micro. Les annulations, rejets et traductions absentes sont comptés séparément. Une traduction absente n’est pas comptée comme une traduction fidèle.

Les événements de timing, tuteur et détails sont conservés. Les WAV sont remplacés dans le rapport par leur taille et leur durée : aucun audio base64 n’est sauvegardé. Le japonais déjà émis ne peut pas être remplacé par un détail français. Une sortie de contrat invalide ou un WAV incomplet fait échouer le tour ; elle ne devient pas une mesure à zéro milliseconde.

## Contrôles mécaniques et inspection linguistique

Le rapport vérifie les schémas, l’ordre des segments, la présence d’une réponse complète et des attentes explicites sur la correction de particule. Il signale séparément une correction inattendue sur une entrée conçue comme acceptable ou assistée. Ces attentes sont limitées au corpus ; elles ne constituent pas un correcteur universel.

Les motifs de rôle inversé, de salutation sans question, de prix et de négation sont des **signaux lexicaux à relire**. La question sur l’identité de Mochi comporte aussi un signal ciblé d’origine humaine affirmée sans identification comme IA ; il ne couvre pas toutes les biographies possibles. Un modèle peut citer un exemple ou exprimer une négation avec une autre paraphrase : un motif ne certifie pas le sens. Les compteurs portent sur les contrôles, pas sur un score global de japonais. Une même réponse peut déclencher plusieurs signaux.

L’inspection complète doit examiner ensemble japonais, rōmaji, français, conseil, éventuelle correction et historique réel : rôle de Mochi, faits de l’élève, nouveaux choix, réponse à la question avant relance, niveau débutant, naturel du japonais et fidélité de traduction. Les observations d’un agent doivent être nommées comme telles. La revue linguistique humaine reste `pending` tant qu’une personne ne l’a pas réellement réalisée. Aucun jugement de prononciation, aucune mémoire d’erreur et aucun progrès d’apprentissage ne sont calculés ici.

## Exécution exclusive sur le Mac

Ces commandes de préparation ne lancent aucun moteur ou serveur :

```sh
node --import tsx scripts/benchmark-voice-dialogue.ts --self-check
node --import tsx scripts/benchmark-voice-dialogue.ts --dry-run
```

Après avoir réservé les modèles à cette expérience, un pilote de quatre entrées peut précéder la série complète. Les sorties doivent être neuves et privées :

```sh
node --import tsx scripts/benchmark-voice-dialogue.ts .local/voice-lab/dialogue-pilot-01.json --exclusive --paired-only --case=station-service --profiles=ja-first
node --import tsx scripts/benchmark-voice-dialogue.ts .local/voice-lab/dialogue-01.json --exclusive
```

`--case=` accepte plusieurs identifiants du tableau séparés par virgules ; `--profiles=` accepte un sous-ensemble des trois profils. `--paired-only` et `--rollout-only` permettent de séparer les deux volets. Les deux options simultanées, un profil inconnu ou une sélection vide sont refusés. Un `--rollout-only --case=help-and-preferences` est vide et donc refusé : cette chaîne appartient uniquement au volet apparié.

`--exclusive` est une attestation de créneau, pas un détecteur de charge. Ne pas exécuter pendant un essai Android, un autre benchmark ou une utilisation des moteurs. Les modèles sont ceux déjà installés ; aucune API payante ou dépendance supplémentaire n’est appelée. `Ctrl+C` arrête seulement les workers créés par le script et conserve un rapport `incomplete`.

Le script refuse un fichier existant, suivi par Git ou placé dans un chemin publiable. Les répertoires nouvellement créés sont privés (`0700`) et le rapport est écrit en `0600`. La sauvegarde est progressive ; les erreurs et les tours non exécutés restent visibles. Les journaux ne contiennent que les identifiants fictifs, profils, compteurs et statuts.

Le rapport conserve les empreintes des sources actives `server/`, `shared/`, du corpus, du script, du verrou JavaScript et des leçons utilisées. Il enregistre aussi les versions installées et les manifestes disponibles des modèles, sans publier leur chemin privé. Les poids volumineux, la mémoire GPU, l’énergie et la RSS des workers ne sont pas mesurés. La RSS Node n’est pas présentée comme celle du modèle.

## Décision après comparaison

Les médianes portent uniquement sur les tours complets, avec leur dénominateur, et les échecs sont comptés à côté. Les chemins `generated`, `correction`, `assisted`, `practice`, `shared-response` et `no-tutor` possèdent des agrégats distincts dans `summary[mode][profile].byPath`. Une aide commune rapide ne diminue donc jamais la médiane de la génération expérimentale. Le nombre d’appels au fournisseur de dialogue est aussi conservé par tour.

Examiner les différences appariées sur les mêmes empreintes d’entrée et le même chemin effectif ; si les chemins ou les réussites diffèrent, présenter aussi le sous-ensemble commun et les exclus. Comparer ensuite les chaînes produites sans mélanger leurs distributions ni choisir uniquement les succès favorables.

Une amélioration chronométrique ne suffit pas à promouvoir le chemin. La décision du lot doit combiner cohérence des chaînes, corrections préservées, traduction, échecs et risque de blocage secondaire, puis choisir explicitement : prêt pour un essai humain, à retravailler ou à abandonner. Le contrat actuel et le vocal classique restent les défauts tant que cette décision ne justifie pas un essai limité du nouveau chemin.
