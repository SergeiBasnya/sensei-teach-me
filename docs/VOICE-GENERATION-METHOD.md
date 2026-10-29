# Comparer la génération et la charge ASR du laboratoire vocal

Ce protocole accompagne `scripts/benchmark-voice-generation.ts`. Il prépare une expérience locale limitée après le laboratoire du commit `34e9ef6`. Il ne sélectionne aucun nouveau modèle ASR et ne change pas le vocal classique par défaut. Aucun résultat de performance n'est contenu dans ce document : les mesures nécessitent une exécution dédiée sur le Mac, puis une inspection linguistique et l'essai Android.

## Questions et limites de mesure

L'expérience cherche à savoir si un contrat de sortie plus court avance la disponibilité du premier fichier japonais validé, et si des reconnaissances Whisper répétées ralentissent Qwen lorsque leurs requêtes se chevauchent réellement.

La mesure principale est `firstJapaneseAudioEmittedMs` : délai entre l'entrée d'un texte déjà reconnu dans la fonction de réponse et l'émission de son premier WAV japonais complet. Ce délai inclut les contrôles et la synthèse, mais exclut la capture, la reconnaissance initiale, le silence de fin, le réseau et la lecture sur le téléphone. Il ne se compare donc pas directement aux 4,73 secondes de la chaîne progressive complète. La mesure Android entre fin de parole et premier événement du lecteur reste indispensable ; un événement du lecteur ne prouve pas à lui seul le son entendu par l'utilisateur.

`responseCompleteMs` indique la fin du travail de réponse, notamment les éléments secondaires. Il ne mesure ni la fin de lecture ni la reprise effective de l'écoute. Une réponse dont le premier WAV arrive plus tôt peut encore laisser un délai secondaire qui gêne la conversation. Ces deux délais doivent être examinés ensemble.

## Trois contrats, mêmes entrées

Les profils sont ceux de l'API locale de laboratoire :

| Profil       | Travail attendu avant le premier WAV                                                          | Travail différé                                                                           |
| ------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `structured` | Contrôle linguistique existant et génération de la réponse structurée complète                | Aucun nouveau calcul secondaire                                                           |
| `compact`    | Même contrôle, réponse complète selon un contrat plus court, puis adaptation au schéma commun | Aucun nouveau calcul secondaire                                                           |
| `ja-first`   | Même contrôle et réponse japonaise complète validée, puis première synthèse                   | Traduction française et conseil calculés après émission du premier WAV, avec le même Qwen |

Le benchmark appelle `LocalTutor.labTurn(input, profile)`. Pour `ja-first`, le callback de `createVoiceLabResponse` appelle `LocalTutor.labDetails` seulement après avoir observé le premier WAV. Il refuse un ajout secondaire qui change la réponse japonaise validée. Aucun fragment japonais issu des tokens partiels n'est lu par avance.

Le script vérifie le schéma complet du tuteur avant le son et l'en-tête WAV des segments émis. Ces contrôles mécaniques ne certifient pas la justesse du japonais. L'admissibilité linguistique et les protections contre les fausses corrections restent celles du moteur existant ; les réponses enregistrées doivent aussi être relues. Le rapport garde `humanLinguisticReview: pending` tant que cette inspection n'a pas été faite. Une latence inférieure ne suffit pas à justifier un changement de fonctionnement.

Six situations publiques existantes sont utilisées : prénom, origine, goûts, commande de café, température et destination. Chaque situation possède une question, une réponse japonaise rédigée et un WAV VOICEVOX public déjà présent dans `assets/speech/`. Les mêmes textes sont envoyés aux trois contrats. Les WAV sont décodés une seule fois en PCM16LE mono à 16 kHz et servent à la charge ASR ; leur empreinte et leur durée sont conservées. Le corpus humain et ses références privées n'entrent pas dans ce script.

Deux passes donnent 36 essais de réponse, avec ordre des contrats tournant selon la situation et inversé à la seconde passe. Cela répartit les effets de position sans constituer une randomisation complète. Un échauffement Qwen et japonais TTS est mesuré séparément. Le cache audio est désactivé. La synthèse porte donc sur la réponse réellement générée à chaque essai.

Le résumé principal porte sur les essais réussis de la dernière passe. Le rapport conserve les deux passes et chaque échec ; un échec n'est pas converti en zéro ni supprimé du relevé brut. Les réponses peuvent varier en longueur et contenu entre contrats : comparer aussi les textes, le nombre de segments, les contrôles grammaticaux, les phases de génération, le premier token, la synthèse et les calculs secondaires. Les métriques numériques émises par les moteurs sont conservées dans les événements. Ni le premier token ni la fin d'un champ partiel ne constituent une réponse japonaise autorisée à la lecture.

## Charge concurrente Whisper et Qwen

Cette partie crée volontairement deux flux dans deux processus : Qwen et un worker ASR séparé déjà échauffé. Par défaut, elle utilise le contrat `structured` et trois situations (origine, café, destination), avec deux passes et trois conditions à ordre contrebalancé :

1. Qwen seul, sans requête ASR concurrente.
2. Qwen avec reconnaissances du même PCM, visant un début de requête par seconde.
3. Qwen avec reconnaissances continues, sans attente entre deux requêtes : condition de stress.

Le délai d'une seconde est une cible entre débuts de requêtes. Une reconnaissance lente ne crée pas de file d'attente. Le script lance au maximum une reconnaissance à la fois, avec une limite de 40 requêtes et de 20 secondes pour en commencer de nouvelles. À la fin de Qwen, il arrête les nouvelles requêtes et attend celle déjà en cours. La limite de temps de la requête ASR reste celle du worker existant. Un échec de ce flux termine l'expérience après sauvegarde, pour éviter de comparer ensuite un worker rechargé à un worker chaud.

`generationOnlyMs` mesure `labTurn`, avec ses contrôles et son contrat complet, sans synthèse ni appel secondaire. Les fenêtres de temps murales de Qwen et de chaque requête ASR sont enregistrées. `requestOverlapMs`, la fraction couverte et le nombre de requêtes chevauchantes vérifient que la charge a réellement été présente pendant la génération. Ce chevauchement des requêtes ne prouve pas une exécution simultanée des noyaux GPU.

Pour chaque cellule chargée, le script répète ensuite le même nombre observé de reconnaissances sans Qwen et conserve ces durées séparément (`asrOnlyMatchedWindows`). Cette comparaison détecte une différence sous charge, mais son ordre fixe « après la charge » laisse possibles des effets thermiques et de cache. Les petits effectifs et les conditions du Mac limitent toute conclusion causale générale. Comparer les cellules appariées par situation, passe et contrat, sans mélanger leurs distributions.

Ce stress ne reproduit pas à lui seul la production. Dans le laboratoire actuel, le verrou ASR global couvre aussi la réponse pour une session : les reconnaissances de ce client ne s'empilent pas pendant son propre Qwen. Les snapshots courts réutilisés ici ne reproduisent pas non plus la croissance d'une longue capture humaine. Une dégradation sous stress ne permet donc pas d'affirmer que cette concurrence a lieu pendant un appel réel. Il faut une trace temporelle du véritable essai pour établir ce point.

Le worker de conversation existant conserve ses propres modèles préchargés ; la condition chargée ajoute un worker Whisper distinct. Les résultats caractérisent ce montage précis. Aucun changement de modèle, langue ou prompt de production n'en découle. L'évaluation des quatre profils Whisper Small sur la voix humaine relève du protocole privé séparé.

## Exécution et conservation

Depuis la racine du projet, ces deux commandes n'ouvrent aucun modèle, microphone ou serveur :

```sh
node --import tsx scripts/benchmark-voice-generation.ts --self-check
node --import tsx scripts/benchmark-voice-generation.ts --dry-run
```

Après la fin de l'enregistrement humain et dans un créneau sans autre utilisation des modèles, l'opérateur peut lancer les contrats seuls, puis la charge seule dans des rapports distincts :

```sh
node --import tsx scripts/benchmark-voice-generation.ts .local/voice-lab/generation-01.json --exclusive --scope=contracts --rounds=2
node --import tsx scripts/benchmark-voice-generation.ts .local/voice-lab/contention-01.json --exclusive --scope=contention --rounds=2
```

`--scope=all` enchaîne les deux parties. `--contention-profiles=all` étend la charge aux trois contrats ; le défaut est `structured`. `--rounds` accepte 1, 2 ou 3. `--exclusive` est l'attestation de l'opérateur qu'un créneau est disponible ; ce drapeau ne détecte pas automatiquement une autre session ou une application consommatrice du GPU. Ne pas lancer cette expérience en parallèle du test Android, d'un enregistrement humain ou d'un autre benchmark.

Le chemin de sortie est obligatoire et doit être neuf, ignoré par Git ou situé hors d'un dépôt. Le script refuse un fichier suivi, publiable ou existant, y compris lors de sa première création. Le répertoire créé reçoit le mode `0700` et le fichier `0600`. Aucun résultat n'est ajouté automatiquement à Git. Le rapport garde les textes synthétiques publics et les données utiles à leur inspection ; il ne contient aucun audio humain ni WAV encodé en base64. Les journaux de progression contiennent seulement les identifiants publics, conditions, compteurs et états, sans transcription ou jeton d'accès.

Le rapport enregistre une empreinte des sources pertinentes, le verrou de dépendances JavaScript, les versions Python installées connues, et les empreintes des manifestes locaux disponibles des modèles. Il ne calcule pas l'empreinte des poids volumineux : `weightHash` reste `not-measured`. Les chemins privés des modèles ne sont pas publiés dans les journaux. La mémoire RSS du processus Node est mesurée ; la RSS des workers, la mémoire GPU et l'énergie restent explicitement non mesurées. Aucune estimation n'est présentée comme une observation.

`Ctrl+C` arrête uniquement les workers créés par ce script. Le rapport est sauvegardé progressivement et marqué `incomplete` si l'expérience est interrompue ou échoue. Les requêtes sont bornées et attendues ; aucun travail en arrière-plan n'est volontairement laissé pour la cellule suivante. Le script n'ajoute ni service permanent ni dépendance.

## Décision après les essais

La décision doit combiner les mesures par phase, l'inspection linguistique, la compréhension de la voix humaine et l'observation Android. Examiner en particulier si le premier WAV arrive plus tôt sans réponse douteuse, si la suite reste contextualisée, si le calcul secondaire retarde la reprise d'écoute et si les hésitations sont respectées. La mémoire d'erreurs ne doit recevoir aucun nouvel apprentissage à partir d'un simple changement de contrat ou d'une transcription incertaine.

Un écart sur ces six textes est une indication locale, pas une validation de conversation naturelle. Tant que l'essai humain et la comparaison ASR ne sont pas terminés, le rapport reste en attente sur ces dimensions et `productionSelection` demeure `unchanged`. Si le gain est faible, irrégulier ou accompagné de régressions linguistiques, conserver le fonctionnement actuel et décrire les phases qui dominent encore le délai.

## Particularités du prototype livré

Le profil `ja-first` préremplit uniquement le préfixe JSON `{"japanese":` dans le prompt. Toute la valeur et l’objet fermé passent ensuite le même parseur strict : aucune fermeture, traduction ou correction n’est inventée pour réparer une sortie invalide. Le chronométrage inclut le préfixe connu pour repérer la fin du champ, mais le premier token reste le premier token effectivement produit. Les prompts du vocal classique sont inchangés.

Les détails restent attendus avant `response_done` : leur éventuel coût de fin de tour est donc conservé dans `secondary_tail_wait`. Une pause libère l’attente Node et bloque les publications tardives ; le worker Qwen séquentiel ne sait pas annuler son inférence déjà commencée. Celle-ci peut encore occuper le moteur et retarder une requête suivante. Ce prototype n’est pas présenté comme une solution de reprise immédiate ou de barge-in.

Les séries préparatoires, les rejets de contrat et les modifications limitées du prompt sont conservés dans le diagnostic. Les résultats d’une série interrompue ne sont pas présentés comme ceux d’une série complète.
