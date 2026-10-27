# Mémoire des erreurs et révisions orales

Version du 27 octobre 2026. Cette fonctionnalité complète les neuf leçons et la conversation libre. Elle conserve des indices d’apprentissage sur l’appareil ; elle n’attribue pas de niveau officiel ni de note de prononciation.

## Ce que fait Mochi

Une correction est enregistrée dès la réponse du tuteur : transcription fautive, phrase corrigée, romaji, traduction, explication, situation et dates. Fermer la conversation sans la terminer ne perd donc pas une correction déjà sauvegardée. Les corrections anciennes qui n’avaient jamais été enregistrées ne sont pas reconstituées.

Les erreurs clairement identifiées sur une même construction sont regroupées, par exemple la particule kara pour dire d’où l’on vient. Le compteur augmente si cette difficulté revient. Les corrections moins faciles à classer gardent leur propre phrase à reformuler. La classification compare le changement réellement effectué ; la seule présence d’un mot ne suffit pas à attribuer une erreur à une règle.

Un objectif terminé sans erreur reçoit aussi un point à reprendre, indiqué « Point pratiqué ». Avoir terminé la leçon ne suffit pas à le déclarer acquis. Une révision ne valide pas artificiellement un nouvel objectif du plan.

L’accueil recommande en priorité un point arrivé à échéance, avec le même bouton « Commencer ma leçon ». Les erreurs sont prioritaires parmi les rappels dus. Depuis **Ma progression → Mes révisions**, on peut consulter les prochains points, démarrer un entraînement, afficher une correction ou retirer un point de cette mémoire. Afficher la correction reporte le prochain rappel sans modèle d’au moins vingt-quatre heures. Retirer un point supprime aussi ses évaluations locales, en conservant le carnet et les séances ; une nouvelle erreur peut recréer ce point.

## Comment une révision se déroule

Mochi annonce une tâche en français, puis invite à répondre en japonais sans afficher la réponse. Elle écoute et répond automatiquement. Le modèle local contrôle la transcription par rapport à la construction visée et accepte les variantes naturelles : changer de pays reste possible pour une question d’origine.

- Une construction correcte donne une courte réponse parlée et le bouton « Terminer la révision ». Le micro ne repart pas après la fin de ce point.
- Une erreur claire reçoit une correction et un modèle à réessayer.
- Une réponse japonaise acceptable mais trop courte pour démontrer le point reste distincte d’une faute. « France », « Je suis français » ou un simple oui ne prouvent pas à eux seuls l’usage de kara.
- « Je ne sais pas », Je bloque ou l’aide après silence donnent accès au modèle. Une répétition aidée est accueillie comme un entraînement utile, sans crédit de rappel indépendant.

Le tuteur généré peut mal interpréter une réponse. Si le contrôle annonce une erreur mais que la seconde passe ne trouve pas de correction claire, l’app demande de reprendre le point sans inventer une faute. Une sortie invalide du modèle produit une erreur de service, pas une réussite fictive.

## Espacement et adaptation

Le premier rappel arrive vingt-quatre heures après l’erreur ou l’objectif pratiqué. Après un rappel indépendant réussi, les intervalles suivants sont **3, 7, 14 puis 30 jours**. Ils sont comptés depuis la dernière réponse évaluée, pas comme des dates fixes depuis la première séance. Une difficulté ramène le prochain rappel à un jour.

Le crédit exige une réponse correcte, une échéance atteinte et au moins vingt-quatre heures depuis le dernier modèle consulté. Il est limité à une évaluation par point et par séance et à un crédit par jour. Une répétition immédiate ou un entraînement trop tôt n’augmente pas les acquis ; il éloigne le prochain contrôle d’au moins un jour. Réécouter le modèle d’un point déjà conservé dans sa leçon, y compris via Je bloque, reporte aussi ce contrôle. Les mêmes événements reçus deux fois sont dédupliqués. L’échéancier dépend de l’horloge de l’appareil.

L’accompagnement reste dans le parcours débutant :

| Mode | Indices requis | Comportement |
|---|---|---|
| Accompagné | Mode initial, ou au moins deux difficultés parmi les trois derniers contrôles | Questions courtes, explication et construction utilisable en français. |
| Guidé | Au moins trois rappels crédités sur au moins deux dates | Laisser essayer avant le modèle, réutiliser les constructions avec une petite variation. |
| Plus autonome | Au moins trois constructions distinctes retrouvées chacune deux fois, au stade d’intervalle de sept jours ou plus, sur plusieurs dates | Commencer les points connus en japonais, conserver le français pour les nouveautés et l’aide. |

Le tutorat local reçoit le mode d’aide, jusqu’à trois points fragiles et la liste des constructions déjà retrouvées. Une révision transmet seulement son point et son modèle de référence. Il ne reçoit pas toute la mémoire à chaque échange. Les consignes demandent de rester au niveau débutant N5, sans inventer de faits personnels ni déclarer un niveau CEFR/JLPT. Le mode « Plus autonome » n’est pas une certification.

## Stockage, compatibilité et limites

La progression utilise AsyncStorage, clé `sensei:progress:v2`. Au premier chargement, les données v1 sont validées puis migrées avec une mémoire vide. Carnet, réglages, objectif quotidien, séances et séries sont conservés ; la clé v1 reste intacte. Une sauvegarde invalide n’est pas écrasée silencieusement et le message d’échec reste visible, y compris en conversation. Les écritures sont sérialisées.

Cette mémoire est **locale à l’installation** : navigateur et téléphone ont chacun la leur. Effacer les données de l’app ou la désinstaller peut la supprimer. Il n’y a ni compte, synchronisation, notification programmée ni sauvegarde distante. Les rappels sont proposés lorsque l’app est ouverte, avec actualisation au retour au premier plan. L’historique des cent dernières évaluations et les trois cents identifiants d’événement servent au calcul et à la déduplication ; les points et leurs compteurs restent conservés tant qu’ils ne sont pas retirés.

Aucun enregistrement audio n’est ajouté à cette mémoire. Les corrections textuelles restent sur l’appareil et le point révisé est traité par le serveur personnel. Le dialogue, la transcription et le japonais conservent Whisper, Qwen et VOICEVOX locaux. Les explications françaises utilisent maintenant [Vivienne en ligne](VIVIENNE.md), choisie après comparaison ; leur texte est transmis à Microsoft pour la synthèse. Aucune API payante n’a été appelée pour ces essais. Le fournisseur OpenAI optionnel possède le contrat de contrôle, mais ses réponses réelles et l’adaptation de son dialogue n’ont pas été validées dans cette livraison ; le chemin de dialogue local reste la référence testée.

Whisper peut modifier ce qui a été prononcé, les modèles peuvent mal corriger et les consignes pédagogiques demandent encore une observation avec l’élève. La mémoire suit les constructions repérées dans le texte transcrit, pas l’accent ni l’intonation. Aucun gain pédagogique mesuré sur plusieurs semaines n’est revendiqué.

## Vérifications

Les 55 tests locaux couvrent notamment migration, persistance, regroupement, déduplication, échéances, absence de crédit après modèle, reprise après difficulté et adaptation de l’aide. Les contrats HTTP couvrent réussite, erreur, aide, construction non démontrée et désaccord entre les passes.

Les vrais moteurs locaux ont été sollicités avec des voix synthétiques : erreur d’origine, correction, nouvelle ouverture, rappel indépendant réussi, puis répétition après consultation du modèle. Des dates simulées dans le seul navigateur de test permettent de vérifier les délais ; ce ne sont pas des séances humaines réparties sur plusieurs jours. Un profil fictif construit à partir de six rappels espacés vérifie le démarrage japonais des points connus. Le retrait d’un point est vérifié après rechargement, avec conservation des anciennes séances et du carnet.

Les exports web, Android et iOS sont contrôlés. Aucun essai sur Android physique ni micro humain n’a été réalisé. Voir les captures `evidence/memory-*`, les résultats de validation et la revue technique PRISMA. Les [textes avant/après](MEMORY-TEXTES-AVANT-APRES.md) décrivent les modifications de libellés et de documentation. La décision artistique reste en attente de l’utilisateur sur l’export exact.
