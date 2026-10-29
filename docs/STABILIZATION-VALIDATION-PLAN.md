# Stabilisation linguistique — périmètre de validation

Ce plan distingue les contrôles exécutables, la relecture linguistique d’agent et l’observation humaine encore à réaliser. Il ne constitue ni le rapport de résultats ni une certification du japonais. Le corpus est synthétique et fictif ; aucun extrait personnel, tarif ou renseignement de voyage réel n’est ajouté.

## Corpus borné et comparaison

Les vingt entrées de `scripts/dialogue-cases.ts` restent inchangées. Elles conservent notamment les échecs déjà observés : `ホットで`, billets possédés au lieu de souhaités, deux billets devenant trois, quai renvoyé au voyageur, question descriptive sur la Belgique, négation du café et réparation de `を` en `から`.

`scripts/stabilization-cases.ts` ajoute exactement douze tours, en trois chaînes de quatre. Ce module reprend les types et les fonctions de préparation des historiques existants ; l’import seul n’enregistre rien et ne lance aucun moteur.

| Chaîne inédite               | Intention vérifiable                                                                      | Points de relecture                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `station-change-destination` | Kyoto → Osaka, deux billets → un, puis demande du quai fictif connu                       | Conserver aller simple et rôle de service ; demander un billet souhaité, pas possédé ; ne pas inventer de prix ni d’horaire ; traduire voie 5 sans transformer la voie en gare. |
| `restaurant-tea-count`       | Deux thés noirs, choix court glacé, réduction à un, prix unitaire fictif 400 yens         | Accepter `アイスで`, conserver le produit et la température, distinguer quantité et montant unitaire, ne pas reprendre le nombre abandonné.                                     |
| `restaurant-repair-help`     | Deux eaux, autocorrection à une, bière niée, modèle de demande d’addition puis répétition | Ne pas corriger le faux départ abandonné ; ne pas commander la bière ni demander systématiquement chaud/glacé pour l’eau ; distinguer modèle aidé et réponse autonome.          |

Plan conseillé : comparer `structured` et `ja-first` sur les vingt mêmes entrées appariées avant/après, puis exécuter les trois nouvelles chaînes sur les deux profils. Les 24 tours de ces dernières réinjectent les véritables sorties de chaque profil ; leurs historiques peuvent diverger. Ce sont des observations de continuité, pas des paires causales de latence. Une réplique élève rédigée qui ne répond pas à la nouvelle question doit être analysée comme telle.

Le runner intégré sélectionne explicitement le nouveau module avec `--suite=stabilization`, sans changer le corpus ni le compte par défaut des anciennes comparaisons ; `--suite=original` garde les vingt entrées existantes. Le snapshot inclut les deux modules. Le filtre `--case` s’applique au corpus choisi. Le contrôle lexical `price-translation` distingue désormais 350 de 400, sans prétendre vérifier toute la traduction en contexte.

Les deux profils utilisent les mêmes entrées, cache audio désactivé et un seul moteur actif ; leur ordre est alterné. Les traces précisent versions, empreintes, échecs et chemins effectivement pris. Si le correctif hybride évite une génération, cette réduction de travail est signalée ; elle n’est pas attribuée à une accélération du modèle. Les délais vont du texte reconnu au WAV émis, avec fin de réponse, nettoyage secondaire et estimation de reprise séparés. Ils ne mesurent pas la fin réelle de parole jusqu’au haut-parleur Android.

## Relecture linguistique et décision

Chaque sortie ciblée doit être lue avec son historique, son japonais, sa traduction et son éventuel conseil ou correction. La simple présence d’un mot attendu ou d’un JSON valide n’est pas une note de langue. Les contrôles mécaniques comprennent schéma complet avant audio, nombres et rôles explicitement suivis, absence de correction sur les fragments de référence et maintien des protections contre l’incertitude ASR.

La relecture doit identifier séparément :

- Une erreur de sens : quantité, prix, destination, choix, négation, locuteur, demande ou réponse modifiée.
- Une erreur pédagogique : correction d’un fragment acceptable, faux diagnostic de politesse, explication inventée ou règle non étayée.
- Une difficulté de niveau ou de naturel : honoriﬁques élaborés, relance ouverte sans appui, phrase longue, français lourd ou alternance tu/vous.
- Une limite de disponibilité : traduction absente, aide refusée prudemment, échec réseau ou rejet du garde ; absence et traduction fausse restent deux résultats distincts.

Le verdict **GO pour essai humain expérimental** suppose les cas critiques identifiés corrigés dans les deux profils, aucun nouveau défaut de sens grave dans les sorties ciblées effectivement examinées, conservation des conseils/corrections, absence de blocage français de la reprise logicielle et possibilité de revenir au classique. Un doute non résolu sur une traduction doit être retenu ou présenté comme incertain, sans règle pédagogique affirmée. Une aide manquante clairement annoncée peut rester une limite secondaire ; un exemple faux enseigné avec assurance reste bloquant.

Un GO expérimental n’exige pas un corpus vocal déjà réalisé, une langue certifiée parfaite ou l’absence de toute maladresse. Il autorise l’observation humaine précisément bornée ci-dessous. Il ne vaut jamais GO de production ou autorisation de raccorder le laboratoire à la mémoire. Les régressions critiques non résolues justifient un NO-GO documenté, sans multiplication indéfinie des exemples.

## Audit de l’isolation Android — lecture de code

Vérification de la version de départ `d6c6df9`, à recontrôler sur le diff final :

- `src/App.tsx` monte `VoiceLab` avec `connection` et `onClose`, sans callback `onLearning` ni mutation de progression ; ces callbacks appartiennent à la branche `Conversation` classique.
- `server/voice-lab.ts` ne conserve qu’un historique éphémère de douze messages. Un résultat final incertain ne déclenche pas `respond`. Partiels et demandes de répétition n’enregistrent pas d’erreur pédagogique.
- `keepSample` vaut `false` à l’ouverture de `VoiceLab`, et le schéma `start` utilise également `false` par défaut. Le collecteur n’est appelé qu’après opt-in explicite et fin de prise. Les WAV privés restent sous `.local/`.
- Une session WebSocket est bornée à vingt minutes et soixante secondes sans activité ; 5 à 10 minutes d’échanges actifs entrent dans cette borne. Une prise est limitée à 45 secondes. Il n’y a pas de barge-in : le micro est fermé pendant Mochi, une pause manuelle interrompt le tour.
- Le contrat génératif est choisi sur le serveur via `SENSEI_LAB_GENERATION`. La sélection n’est pas un réglage du téléphone ; `structured` reste le défaut en l’absence de choix explicite. Les appels classiques gardent leur fournisseur indépendant du choix du laboratoire.
- Le composant de capture vérifie l’existence d’`AudioModule.AudioStream` avant de monter le hook natif. Un export Android ne garantit pas que ce module est présent dans l’Expo Go du téléphone. Un échec de capacité demande un retour au classique ; aucun APK n’est imposé par ce plan.

Cet audit ne prouve pas l’absence de coupure sonore, d’écho, de mauvaise reconnaissance ou de délai matériel. Ces observations restent à faire sur le téléphone.

## Essai humain Android de 5 à 10 minutes

1. Sur le Mac, arrêter uniquement le serveur Sensei du terminal concerné. Après un GO expérimental, lancer `SENSEI_LAB_GENERATION=ja-first npm run local:lab`. Conserver Expo actif ; Mac et Android doivent être sur le même Wi-Fi. Le code personnel déjà configuré reste valable. Ne pas lancer une mesure concurrente sur le Mac.
2. Ouvrir ou recharger Sensei dans Expo Go, puis **Réglages → Ouvrir le laboratoire vocal**. Conserver **Japonais et français**. Laisser **Garder mes extraits sur le Mac** désactivé. Vérifier que **Réponse japonaise de Mochi**, **Reprendre l’écoute après Mochi** et **Fin de phrase automatique expérimentale** sont activés.
3. Choisir la gare ou le café, puis **Démarrer l’essai**. Parler normalement : phrase courte, choix chaud/glacé, un changement de quantité, autocorrection, puis une demande d’aide en français. Pour une hésitation, faire une pause interne naturelle d’une à trois secondes. Si la fin automatique coupe trop tôt, désactiver cette seule option et utiliser **Terminer ma phrase** ; la reprise après Mochi peut rester automatique.
4. Pendant les 5 à 10 minutes, noter ce qui a réellement été dit et si la transcription finale correspond, la clarté des questions, l’utilité de l’aide, les fausses corrections, l’attente ressentie et la reprise du micro. Tester une pause puis reprise. Une erreur réseau doit être distinguée d’une erreur de japonais ; aucune ancienne réponse ne doit être rejouée après reconnexion.
5. Toucher **Mettre en pause**, puis **Partager les mesures** si souhaité, après lecture du bilan. Ce bilan est numérique ; il ne contient pas de phrases ou d’audio. Une activation volontaire distincte de la conservation audio peut être faite plus tard pour la comparaison ASR, sans en faire une condition de cet essai.
6. Pour comparer les contrats avec la même interface, arrêter le serveur concerné puis lancer `SENSEI_LAB_GENERATION=structured npm run local:lab`, recharger le laboratoire et refaire quelques situations. Pour quitter l’essai, revenir au parcours classique dans l’app. `npm run local:lan` redémarre le serveur habituel sans laboratoire. Ne pas attribuer les différences de deux conversations improvisées au seul contrat comme s’il s’agissait d’entrées identiques.

Le bilan utile peut rester bref : « compris / partiellement compris / mal compris », « questions simples / difficiles », « aide utile / fausse / absente », « attente acceptable / frustrante », nombre approximatif de coupures et d’incidents. Les métriques `firstJapaneseAfterDetectedVoiceMs` et `nextCaptureAfterJapaneseEndedMs` sont des événements logiciels et estimations acoustiques, distincts de ce jugement humain. Aucun résultat de cet essai ne doit être rempli à la place de l’utilisateur.
