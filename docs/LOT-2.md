# Lot 2 — fiabilité linguistique et essai Android

Ajout du 28 octobre 2026. Baseline conservée : `98e0e5c`, lot 1. **Validation humaine Android et revue linguistique spécialisée : en attente.** Ce document distingue les contrôles déterministes, les sorties réelles du modèle et les observations humaines restant à obtenir.

## Causes identifiées

| Problème | Cause et preuve | Conséquence |
|---|---|---|
| Verbes et particules mal segmentés | Le worker joignait les segments graphiques pykakasi, qui ne sont pas des mots pédagogiques : `来ま` / `したか`, `住ん` / `でいます`, `ですか`. | `kima shitaka`, `sun deimasu`, `desuka`, parfois `wokudasai`. |
| Une autre lecture remplaçait le rōmaji | Le worker VOICEVOX convertissait `query.kana`, supprimait ses marques d’accent puis concaténait les segments ; `/api/oral-turn` substituait ce texte au résultat du dialogue. | Lectures différentes entre texte et oral, particules fusionnées. |
| Sources de rōmaji multiples | Exercices rédigés à la main, modèle OpenAI, worker pykakasi, lecture VOICEVOX et anciennes références mémorisées. | Absence de convention partagée et anciennes segmentations conservées dans le carnet. |
| Conseils français erronés | Le modèle produisait parfois « On le utilise », « ton destination e kimasu » ou une construction `dekimasu` absente de la réponse. L’aide sélectionnait aussi son explication depuis l’ancienne question plutôt que la phrase traduite. | Un débutant pouvait apprendre une règle incorrecte, y compris positive après une intention négative. |
| Détails oubliés dans une suite | Le modèle reposait la question de la quantité, du prix ou du billet malgré leur présence dans l’historique. | Échange artificiel ; les seuls tests JSON ne le détectaient pas. |
| Mesures inaccessibles sur téléphone | Les traces numériques existaient seulement dans le module du lecteur. | Aucun bilan simple à transmettre après un vrai essai. |

Le corpus avant/après enregistre des dialogues fictifs exécutés avec le vrai Qwen local. Ces erreurs sont reproductibles sur ce corpus ; leur fréquence sur une voix humaine n’est pas mesurée.

## Romanisation pédagogique commune

`server/pedagogic_romaji.py` utilise une analyse morphologique **Janome 0.5.0**, puis pykakasi uniquement pour convertir les lectures kana. Janome est ajouté et épinglé dans l’environnement local et les installateurs ; aucun nouveau modèle, abonnement ou service. Sa documentation décrit les catégories grammaticales et lectures fournies : [Janome](https://janome.mocobeta.dev/en/), [API des tokens](https://janome.mocobeta.dev/reference/_modules/janome/tokenizer).

Convention produit, proche du Hepburn :

- particules séparées, avec `wa`, `e`, `o` pour は、へ、を ;
- radical et auxiliaires verbaux regroupés : `kimashita`, `ikimasen` ;
- forme en te attachée au verbe, auxiliaire d’aspect séparé : `sunde imasu`, `yonde imasen` ;
- copule et question séparées : `suki desu ka` ; négatif passé `tabemasen deshita` ;
- voyelles longues notées par macrons lorsque la lecture phonétique les établit, sans remplacer aveuglément chaque `ou` ou `ei` ;
- nombres, compteurs usuels et dates traités par familles contrôlées, avec leurs alternances et un corpus de non-régression ;
- ponctuation et capitalisation communes ; les lectures inconnues ne sont pas présentées comme une évaluation de prononciation.

Ce choix d’espaces et de macrons est une convention pédagogique de Sensei, pas l’affirmation d’une norme unique pour tous les usages japonais. Le rōmaji n’indique pas l’accent tonal ; l’écoute de la voix japonaise reste nécessaire.

Les mêmes lectures sont appliquées aux réponses, corrections, exemples d’aide et vocabulaire à la sortie de l’API, y compris si un autre fournisseur utilise le normaliseur local disponible. VOICEVOX reçoit toujours le japonais original ; ses accents internes restent réservés au son. Si le normaliseur échoue, le japonais reste disponible avec `…` à la place d’une lecture prétendument fiable. Un fournisseur sans aucun normaliseur local conserve sa lecture propre : cette configuration n’est pas certifiée par ce lot et aucun appel OpenAI payant n’a été utilisé pour les tests.

Sept lectures d’exercices existants sont harmonisées. Les anciennes lectures du carnet et des révisions sont rafraîchies lorsque l’app est connectée au repos ; seuls les champs rōmaji changent. Les dates, boîtes, erreurs, réussites et textes personnels sont conservés. Une interruption de ce rafraîchissement ne bloque pas une conversation ; une référence hors ligne peut garder son ancienne lecture jusqu’à la prochaine actualisation réussie.

**Preuves :** `tests/corpora/romaji.json` et `docs/evidence/lot2/romanization.json` contiennent 72 références, leur texte complet avant/après et les contrôles exacts. La comparaison « avant » concerne le worker de conversation du lot 1 ; l’ancien remplacement VOICEVOX est également démontré par ses traces historiques et son retrait du code. Le rōmaji d’une phrase n’est plus pris dans la notation du moteur vocal.

## Enseignement et corrections

Les explications de constructions connues sont contrôlées et sélectionnées selon la phrase japonaise réellement fournie. La demande « je n’aime pas le café » reçoit ainsi une explication négative ; une phrase d’habitation ne reçoit pas une règle d’origine.

Une explication de mot est bornée au contexte : `kara` après une heure n’est pas présenté comme un pays d’origine. Les questions contrôlées sont reconnues précisément ; une question sur le moment d’une arrivée ne reçoit pas un exemple répondant à « d’où viens-tu ». Pour les questions couvertes, l’aide propose un exemple rédigé, clairement à adapter, et reste une répétition assistée.

Dans le dialogue normal, une déclaration n’ajoute pas une leçon sur une ancienne question. Le coaching utilise une aide contrôlée lorsqu’elle est disponible ; ailleurs il donne le sens français et permet de demander un exemple. Le texte libre de grammaire généré n’est plus présenté comme une règle vérifiée. Certaines traductions de structures complètes, notamment les prix, sont également contrôlées pour préserver montant et genre français. Les autres traductions restent produites par Qwen et demandent une revue humaine.

Le garde de correction est conservateur : il écarte une simple différence de graphie/ponctuation, l’ajout inutile d’un sujet ou d’une copule, et les modifications détectées de noms propres, quantités, négation, goûts et boissons connus. Les graphies kana/kanji comparables sont canonisées. Ce garde protège certaines propriétés contrôlées ; il n’est pas un validateur sémantique universel et peut encore manquer ou écarter une vraie erreur.

| Situation | Comportement livré | Limite |
|---|---|---|
| Erreur claire retenue | Correction immédiate, explication courte, nouvelle tentative. | La précision du jugement initial reste à calibrer humainement. |
| Variante acceptable, style ou simple graphie | Pas de correction sur les cas testés ; conversation poursuivie. | Aucun taux global de faux positifs n’est démontré. |
| Petite faute potentielle | Pas de nouveau système de sévérité automatique prétendument fiable. | L’arbitrage pédagogique reste à évaluer ; les corrections retenues restent immédiates. |
| Correction différée | **Non activée.** | Le contrat actuel rattache la correction au texte courant et compte chaque événement ; il faudrait une identité du tour source, une déduplication et des dates de détection/exposition distinctes. Sans ces garanties, reporter une faute risquerait d’altérer les révisions. |
| ASR incertain | Aucune évaluation ni erreur mémorisée ; nouvelle écoute bornée du lot 1 conservée. | Les seuils Whisper ne constituent pas une confiance calibrée sur les débutants. |

Les sorties japonaises contenant un caractère de remplacement illisible sont rejetées. Les modèles d’aide contrôlés évitent notamment le faux modèle `トー�キョー` observé pendant les essais. Un format valide ne démontre jamais la qualité linguistique.

## Continuité pédagogique

Un petit registre éphémère extrait les commandes et confirmations positives du dialogue courant : boisson, quantité, température, prix explicitement annoncé et type de billet. Il est injecté avant génération, sans appel modèle supplémentaire ni stockage. Négations, préférences et questions ne deviennent pas des commandes ; les changements explicites remplacent les anciens choix. Ce registre aide les scénarios café/gare et ne remplace ni l’historique ni la mémoire espacée.

Le corpus comprend 33 situations / 45 tours, dont dix suites utilisant les véritables réponses précédentes. Il teste aussi prénom, pays/ville, autocorrection, registre familier, rappel de construction corrigée, aide suivie d’une répétition et profils d’accompagnement. Les contrôles littéraux ou booléens sont des observations étroites ; aucun score linguistique automatique n’est calculé. Les critères humains restent associés à chaque cas dans `scripts/linguistic-cases.ts`.

Le rappel aidé reste distinct du rappel indépendant ; les règles de délai et de crédit du lot 1 sont conservées. Comparer un seul exemple « accompagné » et « plus autonome » ne prouve pas une adaptation fiable sur plusieurs jours.

## Essai Android préparé

Dans les réglages, **Démarrer les mesures** ouvre un essai volontaire, puis **Partager le bilan technique** permet d’utiliser la feuille native Android. Sur le web, un bouton copie le bilan. Aucune donnée n’est envoyée automatiquement.

Le bilan filtre strictement ses champs : durées, compteurs, plateforme et états techniques. Aucun audio, transcription, contenu de conversation, progression personnelle, code d’accès, nom ou adresse du serveur. Les callbacks conservent des jetons de tour/essai pour éviter qu’une ancienne lecture ou requête contamine le nouveau bilan. Les interruptions se comptent depuis l’état synchrone du run ; les erreurs après réception d’un WAV sont distinguées d’une indisponibilité française.

Le premier événement du lecteur est mesuré après envoi ; une seconde estimation ajoute le silence VAD depuis la dernière énergie vocale détectée. Aucune de ces valeurs ne prouve ce que l’oreille entend, ni une fin de phrase sémantique. Jusqu’à 120 traces sont conservées en RAM ; fermeture complète = perte du bilan technique, sans perte de la progression sauvegardée. `humanValidation` reste `pending` même après quinze minutes.

Parcours et retour à fournir : [ANDROID-15-MINUTES.md](ANDROID-15-MINUTES.md). Mac et Android doivent partager le Wi-Fi ; le Mac reste allumé. La connexion sécurisée existante est réutilisée. L’accès depuis un téléphone physique et la feuille Android restent en attente de l’utilisateur.

## Mesures et vérifications

Le lot 1 répété avec cache reste une référence historique ; il ne peut pas être comparé directement à six réponses différentes sans cache. Le nouveau benchmark utilise six WAV synthétiques publics distincts et désactive uniquement le cache audio de son propre processus. Les moteurs et voix restent les mêmes. Aucune voix humaine n’est utilisée.

| Réponse synthétique distincte | Lot 1 sans cache | Lot 2 sans cache |
|---|---:|---:|
| Prénom | 6 172 ms | 5 623 ms |
| Origine | 4 571 ms | 4 551 ms |
| Goûts | 5 065 ms | 5 176 ms |
| Commande | 4 443 ms | 4 356 ms |
| Température | 4 496 ms | 4 591 ms |
| Destination | 4 802 ms | 4 971 ms |
| **Moyenne, six réponses** | **4 925 ms** | **4 878 ms** |
| Médiane | 4 686,5 ms | 4 781 ms |

Ces durées couvrent l’appel HTTP local complet jusqu’à réception du JSON contenant l’audio, moteurs chauds, tour 1 de chaque variante ; les réponses générées peuvent différer. L’échantillon est petit et le service français varie : **aucun gain de vitesse n’est revendiqué**. Les premiers appels des processus, synthèse encore froide, sont respectivement 8 417 et 8 645 ms. Le benchmark ne mesure ni le réseau du téléphone ni son premier son. Les traces intermédiaires avec des délais français plus élevés sont aussi conservées, sans les effacer au profit du dernier passage : [comparaison](evidence/lot2/performance-comparison.json), [avant](evidence/lot2/uncached-before.json), [après final](evidence/lot2/uncached-after.json), [passage intermédiaire](evidence/lot2/uncached-during-review.json).

Le microcontrôle local du normaliseur mesure 89,843 ms d’initialisation et 0,993 ms en moyenne pour une première lecture des 72 références, maximum 25,861 ms. Ce relevé descriptif a été réalisé sur le Mac pendant d’autres vérifications, sans protocole de benchmark isolé. Pour le texte japonais et le style 10 contrôlés, le WAV avant/après est **identique octet par octet**, SHA-256 `0d5840aa321533dfb35fb4ff6fe9b781e5fd97baf443931aeaa30c7b7fa96840` : [preuve](evidence/lot2/reading-performance.json). Cela vérifie ce fichier, pas toutes les futures synthèses.

Vérifications exécutées :

- **81 tests TypeScript**, vérification des types, format et contrôle des liserés réussis ; **31 méthodes de tests Python**, comprenant les 72 références de rōmaji, réussies.
- Exports **web, Android et iOS** réussis. Ces exports ne constituent pas une installation sur téléphone.
- **33 situations / 45 tours Qwen réels**, sans erreur HTTP ; 55 observations automatiques ciblées, zéro écart à inspecter dans le dernier passage. Ce résultat porte sur les assertions littérales et booléennes décrites ; il ne certifie pas toutes les traductions ni l’absence d’autres erreurs. [Corpus complet avant](evidence/lot2/linguistic-before.json), [après](evidence/lot2/linguistic-after.json), [périmètre des observations](evidence/lot2/corpus-summary.json).
- Parcours sur l’export web épinglé dans Chromium isolé : WAV public injecté, première réponse HTTP incertaine puis vide simulées, troisième passage avec les vrais Whisper/Qwen/VOICEVOX/Vivienne. Quatre démarrages d’enregistrement, trois envois et un tour terminé ; les deux incidents sont comptés séparément. Une double pression sur pause, puis la fermeture de la séance, produit **une seule interruption**. La copie du bilan est contrôlée avec un presse-papiers simulé, sans toucher celui du Mac. Le bilan ne contient que ses champs numériques et états autorisés : [bilan synthétique](evidence/lot2/browser-trial.json).
- Sur cet unique tour navigateur, premier événement de lecture 6 745 ms après l’envoi et estimation 8 545 ms après la dernière énergie vocale ; ces valeurs ne sont pas la moyenne du benchmark et ne décrivent pas une voix humaine.
- Réglages observés à 320×568, 390×844, 844×390 et 1440×900, avec défilement, focus, survol et préférence sombre ; nouvelle section et commandes lisibles. La revue PRISMA [lot2-technical-review.json](lot2-technical-review.json) documente les huit portes de doctrine et l’artefact précis. La console signale un favicon absent et un avertissement de champ de mot de passe hors formulaire ; aucun échec de lecture n’est survenu dans ce parcours. **Décision artistique et Android physique : en attente.**

Les cas mémoire existants continuent de vérifier qu’un modèle fourni ou une répétition aidée ne valent pas un rappel indépendant, qu’une seule réussite ne suffit pas et qu’une transcription incertaine ne crée pas de faute. Aucun résultat humain n’est déduit des tests ou de la durée écoulée du bilan synthétique.

## Limites et prochain lot

Priorité suivante : effectuer l’essai Android, puis analyser son bilan avec les observations sur hésitations, interruptions, questions répétées et corrections utiles ou abusives. Le silence de 1,8 s reste inchangé tant que la vraie voix n’a pas permis de le calibrer. La lecture des statuts natifs, le Bluetooth et la reprise après veille doivent être confirmés sur téléphone.

La romanisation ne résout pas toute ambiguïté de nom propre ou de contexte : `一日` isolé peut signifier un jour ou le premier du mois. Certains grands compteurs non couverts restent en chiffres avec leur unité plutôt qu’en lecture phonétique complète. Les 72 références sont un filet de non-régression, pas une couverture de toute la langue.

Une revue par une personne compétente en japonais reste nécessaire sur les traductions libres, les contre-exemples et les corrections proposées. Les contrôles locaux ne prouvent ni une précision de niveau JLPT, ni quinze minutes agréables, ni une maîtrise acquise après une réussite. Aucun nouveau chapitre n’est ajouté : les neuf objectifs existants doivent d’abord être fiables en usage humain.
