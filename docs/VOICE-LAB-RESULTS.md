# Résultats du laboratoire vocal

Mesures du 28 octobre 2026, contrôles finaux du 29 octobre. **Prototype isolé ; migration non recommandée à ce stade.** Le retour humain sur le vocal classique est insuffisant, mais aucune voix réelle ni référence validée n’est encore disponible pour sélectionner une autre configuration. Le nouveau prototype n’est pas déclaré agréable ou fiable sur Android physique.

## Comparaison mesurée avec les mêmes entrées

Six fichiers japonais VOICEVOX déjà publics, convertis une seule fois en PCM16 mono 16 kHz ; mêmes octets reçus par les deux chemins. Deux passes, ordre alterné HTTP/WS, un seul modèle de dialogue actif. Cache audio désactivé. La transmission WS est cadencée en temps réel par fragments ≤200 ms. Le tour se termine explicitement au dernier échantillon synthétique : **cette expérience ne valide pas la politique automatique de fin de parole**.

Le classique mesure le moment où le WAV japonais est accessible dans le JSON HTTP complet, qui peut aussi contenir le français. Le laboratoire mesure l’arrivée du premier segment WAV japonais après `finish`. Ni le lecteur, ni le micro Android, ni une vraie fin de phrase humaine ne sont mesurés ici. Les paramètres ASR diffèrent sur le prompt, et les réponses du modèle peuvent varier ; aucune amélioration de précision humaine n’en est déduite.

Deuxième passe, moteurs chauds, six réponses différentes sans cache :

| Entrée synthétique | Classique : japonais disponible | Laboratoire : premier segment disponible |
|---|---:|---:|
| Prénom | 5 887 ms | 3 795 ms |
| Origine | 4 490 ms | 4 822 ms |
| Goûts | 5 052 ms | 4 943 ms |
| Commande | 4 368 ms | 4 679 ms |
| Température | 4 698 ms | 4 232 ms |
| Destination | 4 702 ms | 4 782 ms |
| **Médiane** | **4 700 ms** | **4 730,5 ms** |
| Moyenne | 4 866,2 ms | 4 542,2 ms |

La baisse de moyenne ne démontre pas un gain général : la médiane n’est pas améliorée dans cet échantillon. **L’objectif humain inférieur à trois secondes n’est pas atteint ni évalué par cette mesure.** La première passe complète reste publiée aussi : médianes 4 822,5 et 4 485,5 ms, avec démarrages froids identifiés et sans prétendre à des mesures indépendantes à froid.

Sur les douze tours du laboratoire, onze reçoivent au moins un partiel avant la fin de l’audio. Le premier tour inclut le chargement de l’ASR expérimental. Cela démontre une reconnaissance pendant la transmission de ces fichiers, pas une reconnaissance humaine meilleure. Dans la deuxième passe, les textes finaux des deux chemins diffèrent par leur ponctuation ; ils coïncident après normalisation de celle-ci sur les six cas.

Traces : [benchmark complet](evidence/voice-lab/benchmark-synthetic.json), [comparaison et définitions](evidence/voice-lab/comparison.json). Aucun audio humain, code d’accès ni ticket n’y figure. Le script reproductible est `scripts/benchmark-voice-lab.ts` ; ses sorties par défaut restent dans un dossier privé ignoré par Git.

## Où reste l’attente

Médianes des phases du laboratoire, deuxième passe :

| Phase | Durée observée |
|---|---:|
| Contrôle grammatical | 1 230,8 ms |
| Génération complète dialogue/traduction | 2 567,1 ms |
| Premier token dans cette génération | 781,5 ms |
| Champ japonais complet dans cette génération | 1 177,4 ms |
| Attente restante jusqu’au JSON complet | 1 337,1 ms |
| Enseignement complet | 3 799,9 ms |
| Première synthèse japonaise | 805,5 ms |

Ces médianes décrivent des phases dont certaines sont incluses dans d’autres ; **ne pas les additionner** pour construire artificiellement une latence. L’ASR peut commencer plus tôt et le français n’est plus lu d’abord dans le laboratoire, mais le coût de contrôle puis de génération structurée reste important. Supprimer la validation pour gagner une seconde n’est pas une migration acceptable.

L’expérience de génération progressive livre les tokens à l’instrumentation ; la synthèse ne reçoit que le japonais validé. Une évolution à comparer ensuite serait un contrat « japonais d’abord » séparant les éléments secondaires de la réponse sans perdre le contrôle des corrections. Elle n’est pas activée implicitement ici. Un ASR à état continu ou un modèle différent doit être sélectionné sur les mêmes extraits humains et les ressources réelles, pas sur un benchmark publié pour une autre machine.

## Vérifications de fiabilité

Les contrôles couvrent les tickets, origines, formats et séquences PCM, limites de mémoire/réseau, priorité du final, annulation des résultats, absence d’audio avant validation, non-évaluation d’un ASR incertain et conservation d’extraits uniquement après consentement. Les tests PCM vérifient notamment les signes et l’ordre des octets, le taux réel, la phase de rééchantillonnage et le dernier fragment. Les tests de comparaison séparent les références humaines des hypothèses et protègent les fichiers privés.

Trois défauts ont été trouvés et corrigés pendant la revue : fin automatique déjà armée malgré une reprise, callback d’une ancienne question initiale et hésitations ponctuées mal classées. Un rejeu indépendant confirme les reprises et les quatre variantes d’hésitation ; les tests correspondants passent. Le premier événement de lecture est attaché à la source audio, avec génération capturée, plutôt qu’à un booléen global. La branche native observée utilise un lecteur distinct par segment ; son WAV temporaire est supprimé après libération. Le téléphone reste à vérifier.

**114 tests TypeScript et 49 tests Python réussis**, types et format vérifiés, contrôle des liserés actif. Exports web, Android et iOS réussis ; ce sont des bundles, pas des installations natives signées.

Dans Chromium isolé, un WAV synthétique public injecté dans Web Audio traverse les vrais moteurs puis le lecteur HTMLAudio. Deux tours terminent et l’écoute reprend automatiquement ; une pause puis une reprise rapide et une seconde pause arrêtent toutes les pistes. Quatre captures démarrent et s’arrêtent, six partiels sont reçus, cinq événements de lecture sont observés, sans chevauchement micro/voix ni incident de capture/lecture/réseau sur ce parcours. [Cycle observé](evidence/voice-lab/browser-lifecycle.json), [bilan numérique](evidence/voice-lab/browser-trial.json). Le cache audio normal est actif pour ce contrôle fonctionnel : ses durées ne remplacent pas la comparaison sans cache.

Le bilan est copié vers un presse-papiers de test, sans accès au presse-papiers du Mac. Il ne contient aucune phrase ni audio ; la conservation d’extraits reste désactivée et `humanValidation` reste `pending`. L’affichage est observé à 320×568, 390×844, 844×390 et 1440×900 : pause fixe, défilement, focus violet, survol et préférence sombre. Une espace insécable avant la ponctuation française évite un point d’interrogation isolé. La console du parcours réel ne signale que le favicon absent et l’avis navigateur sur le champ de mot de passe hors formulaire. Les captures et portes PRISMA sont détaillées dans `voice-lab-technical-review.json`.

Ces contrôles ne valident ni l’accent humain, ni l’écho, ni plusieurs minutes de parole Android réelle. Ils ne remplissent pas la validation humaine à sa place.

## Décision avant remplacement

1. Utiliser le laboratoire pour constituer le corpus privé avec des prises réelles, puis valider les références verbatim. Les quatre configurations Small sont comparables sans nouveau téléchargement ; aucun profil n’est promu.
2. Comparer transcription, intention, corrections et latence séparément. Le temps jusqu’à un événement de lecture reste une approximation du son physique ; la borne humaine de fin de parole doit être relevée.
3. Observer plusieurs minutes sur Android : hésitations, autocorrections, demandes françaises, bruit, pause/reprise et reconnexion. Confirmer que le lecteur ne rejoue jamais une ancienne réponse et que le micro reste fermé pendant Mochi.
4. Seulement ensuite choisir une évolution du contrat de génération ou un autre ASR, refaire les mêmes comparaisons puis raccorder la mémoire pédagogique. Garder le vocal classique tant que ce chemin n’est pas démontré meilleur.

**État : diagnostic et prototype disponibles ; qualité conversationnelle Android, choix ASR et remplacement définitif en attente de preuves humaines.**
