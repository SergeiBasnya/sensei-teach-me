# Reprise vocale après échec Android — décision du 30 octobre 2026

**GO uniquement pour un mini-test Android de diagnostic de reconnaissance. NO-GO pour promouvoir le laboratoire ou considérer le génératif comme un professeur suffisamment fiable.** Le retour humain au commit `50dff54` reste la référence : mauvaise compréhension, attente longue, dialogue scripté. Aucune nouvelle voix humaine n’a été validée ; zéro extrait et zéro référence validée au contrôle local. Le classique et l’hybride restent disponibles, aucun modèle ni API payante ajoutés.

## Ce qui a réellement été corrigé

| Défaut démontré | Correction et limite |
| --- | --- |
| Un démarrage natif annulé pouvait confirmer/arrêter une nouvelle capture. | Cycles isolés et démarrages sérialisés. Tests de courses reproduits, matériel Android encore à observer. |
| Une parole faible entourée de silence pouvait être éliminée avant Whisper. | Gate RMS par fenêtres100ms, même seuil−60dBFS, PCM conservé intégralement. Un bruit bref peut aussi déclencher le gate ; filtres d’incertitude conservés. |
| Désaccord80/100ms entre serveur et worker. | Minimum aligné80ms ; aucune promesse d’intelligibilité à cette durée. |
| Réponse `はい` très courte sans fin automatique ; `ホットで` considéré inachevé. | Exceptions étroites avec contexte, deux partiels fiables et PCM supplémentaire ; marge3,2s. Hésitations/phrases incomplètes gardent5s, règle générale1,8/3,2s conservée. |
| Partiel en file devenu périmé après `finish`. | Il est abandonné avant Whisper. Un partiel déjà en cours ne peut pas être préempté sans redémarrer son worker. |
| Lieu de toilettes inventé ; chaud oublié lors d’un changement de quantité ; prix thé/café non liés. | Gardes et snapshot laboratoire renforcés. L’hybride conserve chaud/un et retrouve350yens. Les lieux inventés sont rejetés avant tuteur/audio ; le tour s’arrête plutôt que prononcer une fausse information. |

Fichiers principaux : capture/endpoint dans `src/components/voice-lab-capture.tsx`, `src/lib/voice-lab-capture.ts`, `src/lib/voice-lab-pcm.ts` ; reconnaissance et transport dans `server/voice_lab_worker.py`, `server/voice-lab-asr.ts`, `server/voice-lab.ts` ; contexte/génération dans `server/lab_conversation.py`, `server/beginner_dialogue.py`, `server/lab_generation.py`, `server/conversation_worker.py`. L’intégration est limitée au laboratoire.

## Reconnaissance : comparaison limitée, pas de sélection de modèle

Quatre profils Small existants, **mêmes trois PCM synthétiques publics** : origine, chaud et chaud atténué avec six secondes de silence. Douze décodages, une seule répétition. Aucun écart de caractère après normalisation de ponctuation/espaces, aucune incertitude sur ces sons faciles. Médianes locales : auto+prompt92ms, ja+prompt61ms, auto sans prompt94ms, ja sans prompt57ms. La première inférence et l’ordre chaud diffèrent ; ces nombres ne classent pas les profils sur la voix humaine. Le signal faible franchissait l’ancien gate global, mais est bien décodé par le nouveau sans retirer le silence.

Le laboratoire conserve **auto sans prompt**, le classique **auto avec prompt bilingue**. Accent débutant, hésitations, erreurs normalisées, français et bruit restent non départagés. [Mesures synthétiques](evidence/voice-recovery/asr-synthetic.json), [diagnostic ASR](VOICE-RECOVERY-ASR-LATENCY.md).

## Latence : aucun gain Android démontré

Sur huit entrées appariées avant les trois derniers correctifs, premier WAV après texte : hybride2,84s, génératif4,15s. Après correctifs, chacun réussit7/8 entrées ; les mêmes deux tours de lieu inconnu sont rejetés. Sur les **sept mêmes entrées abouties** par politique :

| Médiane depuis texte reconnu | Hybride avant → après | Génératif avant → après |
| --- | ---: | ---: |
| Premier WAV émis | 2,44 → 2,59s | 4,07 → 4,63s |
| Fin de réponse | 3,09 → 3,42s | 4,82 → 5,38s |
| Tout travail observé terminé | 3,76 → 4,04s | 5,37 → 5,74s |

Les rejets restent au dénominateur7/8, pas comptés comme une réponse rapide. Une série, pas de conclusion statistique ni de gain annoncé. Contrôle grammatical puis génération complète restent séquentiels. Le premier token ne peut pas être lu : il faut encore terminer et valider la réponse japonaise avant synthèse. La fin automatique ajoute d’abord1,8 à5s et une marge150ms. **Trois secondes de ressenti ne sont pas démontrées et paraissent incompatibles avec plusieurs de ces chemins actuels.**

Le stress Whisper/Qwen séparé montre un risque de contention : commande, Qwen seul1,10s, ASR cadencé2,43s ; destination1,09s contre1,23s. Série unique, avec ordre/cache et contrôle grammatical, pas un effet causal isolé. Le cas origine utilise un contrôleur sans génération et n’est pas une mesure de concurrence Qwen. Dans le vrai WebSocket, le drain sérialise ASR et réponse principale ; le risque restant concerne attente d’un partiel actif, autre client et secondaire du tour précédent. Le français secondaire n’est pas attendu par `response_done` ; sa fin plus tardive est mesurée séparément. Aucun accusé d’annulation réel observé dans ce pilote : son coût sur le tour Android suivant reste à relever. [Stress borné](evidence/voice-recovery/contention.json).

Contrôle intégré supplémentaire du serveur relancé : PCM synthétique public envoyé par WebSocket en temps réel, ASR final puis diagnostic puis tuteur puis deux WAV et fin de réponse reçus ; conservation désactivée. Fin explicite du tour → premier WAV reçu sur le Mac : **3,67s** sur cette seule prise. Décomposition observée après redémarrage : finalASR0,48s, dont0,38s de file ; contrôle grammatical1,68s ; premier TTS1,48s, avec réponse de dialogue contrôlée. Le premier chargement de reconnaissance et la première synthèse participent à ce cas ; ce n’est pas une médiane à chaud. Ce nombre inclut le serveur et la boucle locale, mais pas l’endpoint automatique, le téléphone ou la lecture. [Trace synthétique intégrée](evidence/voice-recovery/live-synthetic-smoke.json).

**Latence bout en bout Android nouvelle : aucune observation disponible.** Le panneau relève désormais énergie estimée, fin de tour, finalASR, contrôle/génération/TTS serveur, réceptionWAV, demande de lecture, événement lecteur, fin de lecture et micro prêt. Le résidu transport inclut aller-retour et distribution ; l’événement du lecteur n’est pas le son entendu. Les tests Chromium à réseau simulé prouvent le parcours, pas une rapidité humaine.

## Conversation et décision

La première série lit32sorties réelles fictives ; le rejeu compte28tentatives,24complètes et4rejets, puis arrête les deux chaînes café à leur échec. Les deux politiques suivent le cinéma, mais la chaîne cinéma reste identique et peut transformer « je veux parler de films » en « tu aimes les films ». Le génératif reformule parfois mieux et redemande parfois une préférence connue. Il conserve des questions ouvertes et un français maladroit, avec `vous`/`hein`. **Avantage de naturalité non démontré, coût de latence accru et conversation parfois interrompue : à retravailler.** [Revue linguistique explicite01/02](VOICE-RECOVERY-NATURALITY-RESULTS.md), [sorties avant](evidence/voice-recovery/dialogue-01.json), [sorties après](evidence/voice-recovery/dialogue-02.json).

Les contrôles mécaniques refusent des contradictions ciblées ; ils ne certifient pas universellement le japonais ou les traductions. Les corrections sûres, l’aide et l’absence de mémoire automatique sont conservées. Aucun acquis ou erreur pédagogique n’est enregistré par le laboratoire. Le nouveau comparateur est volontaire, hybride par défaut, classique inchangé.

## Essai immédiat et preuves techniques

Dans Expo Go, rouvrir le projet puis **Réglages → Laboratoire vocal → Hybride actuel → Afficher le diagnostic temporaire**. Commencer par les trois premières des [huit interventions proposées](VOICE-RECOVERY-ANDROID.md), sans activer la conservation audio. Comparer déclaration exacte facultative, ASR brut/final, aiguillage/faits et réponse japonaise ; aucun texte à valider pour continuer. La comparaison de profils sur ta voix attend seulement quelques extraits volontairement conservés et des références réellement réécoutées. Un échange de5–10minutes reste un essai exploratoire : il ne bénéficie pas d’un GO conversationnel sur ce lot.

Vérification :174tests Node et180tests Python réussis, TypeScript, format, export web et exports Android/iOS ; tests spécifiques de courses, PCM, confidentialité, fin de tour, garde-fous et secondaires. Revue Chromium isolée320×568/390×844/844×390/1440×900, focus, survol et préférence sombre ; contrôle PRISMA technique passé, artistique non évalué. Aucun test Android matériel inventé. Sources OFA révision11 et PRISMA consultées, contrôle local/build conservé ; publication sur branche dédiée et PR, sans promotion du mode expérimental.

## Comparatif des libellés remplacés

| Emplacement | Texte précédent complet | Texte livré complet | Changement |
| --- | --- | --- | --- |
| État d’écoute | À toi de parler | Écoute | Remplacement local du libellé d’état. |
| État ASR | Vérification de ta phrase… | Reconnaissance… | Remplacement local pour séparer ASR et pédagogie. |
| État entre finalASR et lecture | Aucun libellé distinct ; l’état précédent restait affiché. | Préparation de la réponse… | Ajout d’un état, pas d’un écran. |

Le choix de politique, l’activation et le panneau de diagnostic sont des ajouts au laboratoire ; ils ne remplacent aucun texte existant. Les consignes expérimentales et l’objectif guidé sont présentés intégralement avant/après dans [la note de naturalité](VOICE-RECOVERY-NATURALITY.md#8-prototype-autorisé-après-le-diagnostic--état-du-30-octobre). Aucun déplacement de texte dans le classique, aucune nouvelle leçon ou animation.
