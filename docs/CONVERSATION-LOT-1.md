# Cœur conversationnel — premier lot

Ajout du 28 octobre 2026. Périmètre : latence, continuité, fiabilité. React Native / Expo, Qwen3-14B, Whisper et VOICEVOX restent en place ; Vivienne reste le service français déjà approuvé. Ni nouvel hébergement ni API payante.

## Diagnostic du code initial

| Priorité | Constat vérifié et cause | Impact et fréquence établie | Sources |
|---|---|---|---|
| P1 | Trois générations séquentielles sur une réponse japonaise acceptée : contrôle, dialogue, traduction. Une correction claire prend une génération. | Coût systématique de cette branche ; proportion en usage humain inconnue. Mesures ci-dessous. | `server/conversation_worker.py`, `server/local-tutor.ts` |
| P1 | `/api/oral-turn` attend ASR, enseignement, japonais puis français ; la panne française retourne 502. | Perte de la réponse japonaise et du tour après chaque panne française sur un tour accompagné. Fréquence réseau inconnue. | `server/app.ts`, `src/lib/tutor-playback.ts` |
| P1 | `firstCoachedFollowup` remplace une réponse déjà calculée quand les conditions du premier suivi sont remplies. | Calcul perdu et possible ignorance d’un changement de commande ; la condition ne prouve aucune compétence. | `server/app.ts`, `shared/teaching.ts` |
| P1 | Whisper ne remonte que du texte filtré ; aucune incertitude n’atteint la correction ou la mémoire. | Une reconnaissance erronée peut devenir une faute mémorisée. Risque établi par le flux ; taux réel non mesuré. Whisper peut aussi normaliser une faute avant le tuteur. | `server/conversation_worker.py`, `shared/learning-memory.ts` |
| P2 | « もう一度 » est traité comme une demande de réponse modèle. | Réponse à la mauvaise intention, révélation inutile de la référence pendant une révision. Déclenchement reproductible sur ce texte. | `shared/teaching.ts`, `server/app.ts` |
| P2 | Silence sans transcription : la séance est arrêtée. | Reprise manuelle après chaque `heard:false`. | `src/lib/use-oral-session.ts` |
| P2 | Fin de parole après 1,8 s de silence, seuil uniforme. | Délai systématique après parole ; une hésitation plus longue peut être coupée. Changer ce seuil seul ne prouve aucun gain de fluidité. | `src/lib/voice-activity.ts` |
| P2 | Toute faute retenue provoque une répétition. | Interruption pédagogique systématique, même pour une petite faute. À conserver dans ce lot pour les erreurs claires, puis évaluer la correction différée. | `shared/tutor-feedback.ts` |

Ces constats ne démontrent ni une mauvaise prononciation, ni le taux de précision du modèle en conditions humaines. Les tests initiaux utilisent surtout des fournisseurs simulés.

## Mesures avant changement de comportement

Instrumentation numérique par requête : décodage, Whisper, contrôle de faute, dialogue, traduction, révision/aide, nombre de générations, aller-retour worker, ASR global, enseignement global, TTS japonais/français et durée serveur. Le compteur `generations` est un nombre, les autres valeurs sont en millisecondes. Les durées imbriquées ne s’additionnent pas. La trace initiale utilise `dur` pour le compteur `generations` ; la version finale utilise `desc`, afin de ne pas le présenter comme des millisecondes. Le sous-chronomètre d’aide initial ne comptait que la dernière génération : la comparaison de répétition repose sur la durée HTTP complète et le nombre d’appels, pas sur cette sous-durée.

Les valeurs sont transmises dans `Server-Timing` après authentification ; aucun texte, audio, jeton ou identifiant personnel dans les mesures. Pas de journal de conversations ajouté.

`scripts/benchmark-conversation.ts` exécute le même corpus avant/après, trois passages, avec premier appel d’inférence identifié séparément et démarrage processus mesuré. Le cas oral utilise un WAV synthétique VOICEVOX déjà présent localement. Les autres entrées sont des textes fictifs. Résultats bruts : `docs/evidence/conversation/before.json` et `after.json`.

Le démarrage de processus n’est pas un démarrage machine à cache disque vide. Le téléchargement et la lecture des modèles sur une autre machine restent à mesurer. Le temps HTTP sur boucle locale ne représente pas le Wi-Fi Android.

## Critères du lot

- Ne plus jeter une réponse contextualisée pour imposer une relance fixe.
- Garder un contrôle de faute séparé et prudent ; réduire les appels de dialogue/traduction seulement si le corpus le permet.
- Conserver le japonais même en panne française et respecter une pause utilisateur entre les langues.
- Répéter ou traduire la question sans fabriquer une réussite ni exposer une réponse de révision.
- Ne pas enregistrer de faute sur un résultat ASR explicitement incertain ; ne jamais présenter les indicateurs ASR comme une certitude.
- Conserver la mémoire locale et la distinction aide / rappel indépendant.
- Mesurer la lecture à partir des événements du lecteur, sans confondre réponse HTTP et son effectivement lancé.

Les résultats, limites et prochains lots seront complétés après vérification.

## Résultat implémenté

Le dialogue et sa traduction sont produits dans un JSON commun ; le contrôle des fautes reste séparé. Deux générations sur une réponse japonaise acceptable, une sur une faute claire ; une demande d’aide à formuler une réponse peut encore en demander trois. La répétition de la question n’appelle plus Qwen. Une traduction manquante ne supprime pas un japonais valide ; une sortie de contrôle grammatical mal formée ne devient jamais « aucune faute ».

Les neuf substitutions fixes et leur suivi par comparaison de texte ont été retirés. L’objectif de leçon, les faits de l’échange et les intentions possibles sont fournis avant génération. `conversation-curriculum.ts` prépare une extension par situation, rôle et variations possibles. Ce lot valide présentation, café et gare existants ; il n’ajoute aucun chapitre. Une aide vérifiée aux options hotto/aisu complète le modèle lorsqu’il omet les mots permettant de répondre ; elle ne remplace pas son dialogue et conserve les explications différentes.

La répétition, la traduction d’une question, son explication et l’aide à exprimer une intention ont des chemins distincts. Une explication conserve la demande précise. Les consignes de révision se répètent sans dévoiler leur réponse. Traduction et explication portent un marqueur d’aide ; les deux chemins client le mémorisent et le moteur de mémoire refuse de créditer un résultat explicitement assisté. L’aide, les rappels espacés, les 24 heures après exposition et la déduplication restent en place.

Whisper transmet un avertissement si un segment est écarté ou si ses indicateurs dépassent les seuils prudents du lot. Un tel résultat ne passe ni au contrôle des fautes, ni à la mémoire. Le client propose de réessayer automatiquement ; après trois enregistrements sans reconnaissance exploitable, il met le micro en pause. Ces seuils ne sont pas calibrés sur des débutants et ne détectent pas toutes les reconnaissances fausses.

Les synthèses existantes progressent dans deux workers indépendants. Le français dispose d’une attente maximale de 3 s, aussi à l’ouverture et pour l’aide. Son échec conserve le japonais et le coaching écrit ; le client ne redemande pas le même audio français absent. Le cache audio est limité à 32 entrées / 8 Mo en RAM, sans fichier ni journal. Une pause utilisateur annule toujours la suite de lecture. Il n’y a ni nouveau modèle, ni streaming, ni nouveau service.

## Comparaison mesurée

Avant : commit `86fc818` avec instrumentation ajoutée seule. Après : version du lot, empreinte des cinq sources principales dans `after.json`. Machine identique, requêtes séquentielles, un seul modèle Qwen actif. Deux répétitions à chaud par variante et par cas ; la moyenne est descriptive, sans intervalle statistique ni promesse sur une autre machine.

| Cas identique | Avant, moyenne à chaud | Après, moyenne à chaud | Écart observé |
|---|---:|---:|---:|
| Réponse courte sur l’origine | 4 188 ms | 3 201 ms | −23,6 % |
| Changement du café vers le thé | 4 305 ms | 3 531 ms | −18,0 % |
| Faute claire de particule | 2 219 ms | 2 135 ms | −3,8 % ; même chemin, variation de mesure |
| Demande de répétition | 1 031 ms | 4 ms | −99,7 % ; aucune génération |
| Tour oral, même WAV synthétique | 6 342 ms | 3 321 ms | −47,6 % |

Le premier tour oral, avec démarrage vocal, prend 6 887 ms avant et 5 208 ms après. Le premier appel d’inférence prend 4 956 ms avant et 3 335 ms après. Préparation du processus modèle : 4 748 / 2 857 ms ; ce n’est pas un démarrage machine sans caches. Le cas oral répète exactement la même réponse et bénéficie du cache audio à chaud : son gain ne représente pas une conversation de réponses toutes différentes. Les textes générés ont changé avec le lot ; ce tableau mesure le lot complet, pas l’effet isolé d’un paramètre.

Le premier essai combiné a été rejeté : plus lent sur l’origine et coaching parfois consacré à la grammaire française. Sa trace est conservée dans `experiment-combined-v1.json`. Un prompt plus court et le corpus ont permis de corriger ces écarts avant de retenir la génération commune.

Ces durées HTTP ne mesurent pas le premier son entendu. Les mesures client enregistrent le temps d’enregistrement, la queue de silence, l’aller-retour, la lecture du corps, sa taille en caractères, le démarrage et la fin du lecteur. Le démarrage repose sur `onplaying` / le statut natif « playing, non buffering », pas sur l’affichage « Mochi parle ». `oralMetricsSnapshot()` retourne les 30 dernières traces numériques en mémoire. Aucune conversation ni donnée d’identité n’y est stockée. La différence HTTP / serveur inclut transfert, sérialisation et ordonnanceur ; elle ne constitue pas une mesure pure du réseau. Le Wi-Fi Android reste à mesurer.

## Vérifications et preuves

- 67 tests TypeScript locaux : contrats, authentification, origine, enchaînement oral, panne et blocage français, annulation entre langues, ASR incertain, intentions, mémoire assistée et comptage de lecture.
- 10 tests Python hors réseau : Vivienne et signaux ASR / extraction des questions. Ils ne mesurent pas la précision de Whisper sur une voix humaine.
- TypeScript, formatage et contrôle design réussis ; exports web, Android et iOS réussis. Un export n’est pas un essai sur téléphone.
- Corpus réel de 14 requêtes au modèle local, avec sorties dans `corpus.json` et critères d’observation dans `scripts/conversation-cases.ts`. Aucun score automatique de qualité pédagogique n’est inventé.
- Observé sur ce corpus : fragment et registre familier acceptés ; autocorrection acceptée ; faute de provenance corrigée ; thé conservé après changement ; question répétée sans pays fictif ; intention « j’habite à Lyon » traduite en déclaration ; kara expliqué ; répétition assistée distinguée du rappel ; fragment en révision classé « non démontré ».
- Limites observées : la relance sur les goûts reste générale ; certaines formulations françaises sont maladroites. Une réponse grammaticalement juste ne démontre pas à elle seule une maîtrise durable. Les cas de mémoire utilisent une préparation explicite et les tests de planification ; le corpus HTTP seul ne prouve pas la persistance du téléphone.

Le rendu n’a pas été refondu : aucun style, famille de police, avatar, écran ou libellé de navigation modifié. Les modifications de texte et suppressions de relances sont documentées intégralement dans `conversation-copy-before-after.md`. Les contrôles PRISMA restent raccordés ; aucune nouvelle conformité artistique n’est revendiquée pour un changement de comportement.

## Vérification du parcours dans le navigateur

Chromium isolé, fenêtre 390 × 844 : ouverture d’une leçon avec parole automatique ; injection de deux réponses `heard:false` (dont une incertaine) ; deux nouvelles écoutes sans clic ; troisième enregistrement synthétique envoyé au vrai Whisper/Qwen/VOICEVOX/Vivienne ; réponse japonaise lue puis quatrième écoute. Pause utilisateur exécutée ensuite. Premier événement `playing` à environ **5 287 ms après l’envoi** sur ce passage. Preuve numérique : `docs/evidence/conversation/browser.json`.

C’est un essai fonctionnel avec micro artificiel et deux réponses API simulées, suivi d’un vrai tour local. Il ne démontre ni une reconnaissance humaine, ni une latence Wi-Fi ou Android, ni 15 minutes de conversation. Les 5 287 ms commencent à l’envoi et n’incluent pas le silence de fin de parole. Deux erreurs réseau sont visibles dans la console : le favicon absent (404) et un appel de synthèse indisponible (502). Le parcours a néanmoins repris et lu le tour japonais ; aucune exception JavaScript de l’application n’a été relevée. Le service français reste donc une dépendance faillible, malgré sa borne et sa tolérance.

## Rejouer les mesures

Après installation locale existante, arrêter le serveur Sensei de ce projet pour éviter deux modèles Qwen concurrents, puis :

```sh
npm run check
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
node --import tsx scripts/benchmark-conversation.ts output/conversation/after.json
node --import tsx scripts/benchmark-conversation.ts output/conversation/corpus.json --corpus
npm run local:lan
```

Le script démarre un serveur de boucle locale à port aléatoire avec un code éphémère interne et ferme ses workers. Il n’affiche aucun code personnel. Le WAV public `tests/fixtures/origin-synthetic.wav` est synthétique, voix **VOICEVOX:雨晴はう**, style 10 ; mêmes conditions et crédits que `docs/VOICE.md`. Il ne représente ni une voix humaine, ni un accent de débutant.

## Limites restantes et lots suivants

1. **Validation orale humaine, priorité suivante.** Une séance Android de 15 minutes et un essai iOS restent nécessaires : interruptions, hésitations, bruit ambiant, Bluetooth, veille/reprise, Wi-Fi, compréhension des corrections et envie de continuer. Mesurer premier son, fréquence des relances inutiles et erreurs de reconnaissance. Le seuil de silence de 1,8 s reste conservé dans ce lot : le raccourcir sans voix humaine pourrait couper les hésitations. Ces mesures serviront à une politique de pause adaptative, sans confondre niveau sonore et fin sémantique.
2. **Calibration pédagogique.** Faire relire un corpus plus large par une personne compétente en japonais, en distinguant erreurs importantes, variantes acceptables, faux positifs ASR et répétitions inutiles. Tester la réutilisation différée après correction ; introduire ensuite une correction différée des petites fautes. Aucune précision chiffrée du correcteur n’est démontrée ici.
3. **Adaptation suivie.** Observer plusieurs jours de rappels indépendants et de demandes d’aide. Vérifier que le français diminue au bon moment, que les constructions reviennent avec des variations et que les questions ne se répètent pas au-delà du contexte récent. La mémoire actuelle suit les constructions ; elle ne conserve pas une biographie ni toutes les conversations.
4. **Extension de situations.** Ajouter d’abord un seul scénario hôtel ou achat, avec objectif, vocabulaire minimal, variantes, fragments acceptables et corpus d’erreurs. Valider avant de multiplier le contenu ; directions et imprévus de voyage viennent ensuite. La structure de situation du lot prépare ce travail sans créer des dizaines de leçons.

Une pause ou la fermeture du client empêche une réponse tardive d’être jouée ou mémorisée ; l’inférence déjà engagée peut encore se terminer sur le serveur. Le français dépend toujours du service Edge déjà choisi. Les indicateurs Whisper peuvent manquer une normalisation ou demander inutilement de répéter : aucune évaluation de prononciation n’a été ajoutée. L’objectif des 15 minutes agréables reste à confirmer par une vraie séance.
