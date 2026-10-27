# Accueil, progression et plan

Demande du 26 octobre 2026 : reprendre l’organisation des trois captures fournies, avec la progression accessible en haut, le plan d’avancement en bas et une leçon au centre. Les captures sont des références de navigation et de composition ; aucun asset de l’application de référence n’est repris. Le violet du projet est conservé. Le timer, le badge vocal et les flèches ne sont pas réintroduits.

## Navigation

L’accueil présente le chapitre, l’objectif recommandé et Commencer ma leçon. Un glissement vers le bas ouvre Ma progression ; vers le haut, Mon plan. Les deux libellés sont aussi des boutons. La seconde page horizontale donne accès à la conversation libre ; les deux indicateurs sont actionnables et nommés pour le lecteur d’écran. La page hors champ n’expose pas son bouton au focus.

Les panneaux se referment avec la croix. Leur poignée permet aussi de glisser vers l’accueil : vers le haut depuis la progression, vers le bas depuis le plan. Le contenu interne reste défilant. Dans une fenêtre de moins de 650 px de haut, le geste d’ouverture est réservé aux bords pour préserver le défilement du centre. Les animations respectent le réglage de réduction de mouvement. Le bouton système de retour ferme le panneau via le Modal natif ; son comportement sur appareil physique reste à vérifier.

Le carnet est accessible depuis la tuile Vocabulaire de Ma progression. La phrase préparée auparavant sur l’accueil y est déplacée : ajout et lecture restent disponibles. L’ajout ne marque pas l’expression comme acquise. Les réglages restent accessibles depuis l’accueil.

## Parcours débutant

Trois chapitres, neuf objectifs issus des dialogues et enregistrements existants :

| Chapitre | Objectifs |
|---|---|
| Faire connaissance | Te présenter ; Dire d’où tu viens ; Parler de tes goûts |
| Au café | Commander une boisson ; Choisir chaud ou glacé ; Compléter ta commande |
| Prendre le train | Indiquer ta destination ; Acheter un billet ; Remercier et conclure |

Chaque objectif ouvre sa propre question préparée. En conversation connectée, son identifiant validé est transmis au dialogue et traduit côté serveur en une consigne du catalogue. L’IA reçoit cette consigne avec le contexte ; son respect linguistique n’est pas garanti. Tous les objectifs restent accessibles, y compris pour réviser hors ordre.

Un objectif est marqué pratiqué uniquement après la fermeture d’une séance contenant au moins une réponse. Cela mesure un essai, pas la maîtrise, la grammaire ou la prononciation. Une séance vide ne fait pas avancer le plan. Une répétition ne double pas le nombre d’objectifs. L’accueil recommande le premier objectif non pratiqué, puis le premier pour réviser quand les neuf ont été essayés.

L1 et Niveau 1 désignent le parcours débutant disponible ; aucun niveau linguistique n’est déduit d’un compteur. L’historique, le carnet, la série et le temps au premier plan proviennent des données locales. Le temps d’aide et de pause reste inclus dans une séance enregistrée, comme auparavant. La discussion libre ne valide aucun objectif du plan.

La sauvegarde v1 accepte désormais un identifiant d’objectif facultatif. Les anciennes séances et les mots restent conservés. Une ancienne séance liée uniquement à une situation n’est pas transformée arbitrairement en objectif déjà pratiqué.

## Avatar : proposition B choisie

Le propriétaire a demandé un visage féminin simple, puis un style manga, avec propositions avant intégration. Trois pistes manga ont été présentées ; il a choisi **B — dessin léger** le 26 octobre 2026. Le visage central a ensuite été isolé et intégré. Le portrait détaillé essayé auparavant et les autres pistes ne sont pas utilisés par l’application. Fichiers, planche et prompts exacts : [assets/avatar/README.md](../assets/avatar/README.md). Le nom Mochi et la voix A restent identiques.

À sa demande suivante, huit expressions ont été créées à partir de B. La bouche suit l’intensité de la voix et la position réelle du lecteur, y compris les silences ; elle se ferme à la pause ou en fin de lecture. L’écoute et la réflexion ont leurs propres expressions. Respiration discrète et clignements s’arrêtent en arrière-plan et avec le réglage de réduction des mouvements. Ce mode conserve une pose de parole fixe. Ce suivi sonore ne reproduit pas chaque phonème. Les moteurs gratuits, les phrases et les fichiers audio existants restent identiques.

Depuis le 27 octobre 2026, le moteur principal de cet avatar est Mesh Avatar avec le même visage B ; l’atlas devient le secours. Son intégration Expo Android et ses vérifications sont décrites dans [MESH-AVATAR.md](MESH-AVATAR.md). Les vérifications du hub ci-dessous datent de sa version du 26 octobre.

## Vérifications

Trente et un tests couvrent notamment la compatibilité des anciennes sauvegardes, les séances vides, les répétitions, le choix de la question et le transport de l’identifiant dans le tour audio. Ils vérifient aussi les silences du WAV, la fermeture de bouche en fin de son, les états et les enveloppes des 25 enregistrements préparés. Types, formatage, compilation Python et exports web/iOS/Android vérifiés. Aucun package ni service payant ajouté, aucun nouveau workflow CI général.

Dans le navigateur isolé, la lecture de deux WAV successifs fait apparaître les ouvertures de bouche, les silences, l’écoute et la réflexion ; la pause ferme la bouche et arrête le son. Le mode de réduction des mouvements reste fixe. Un changement de visibilité simulé met l’échange en pause et le retour attend une reprise manuelle.

Dans le navigateur isolé, les vrais événements tactiles ouvrent et ferment les panneaux et font passer à la discussion libre. Un flux audio synthétique utilise les vrais moteurs ; l’identifiant meet-name est transmis, une réponse est enregistrée et l’objectif suivant est restauré après rechargement. L’aide se lit jusqu’à la fin réelle de l’audio. Le carnet reçoit la phrase manuellement et une leçon abandonnée sans réponse ne fait pas avancer le plan. Les captures de profils de test contiennent ces données synthétiques, jamais la progression du téléphone de l’utilisateur.

Le rendu final est observé à 320×568, 390×844, 844×390 et 1440×1000, avec les contenus longs défilés. Le contrôle porte aussi sur les limites internes des panneaux, pas seulement sur la largeur du document. Le centrage a été corrigé après observation d’un décalage. Les preuves et les empreintes exactes sont dans la revue technique du hub ; les anciennes revues restent historiques. La décision artistique sur l’interface reste pending-human. Le choix B est consigné séparément et ne vaut pas validation de toute l’interface finale.

Aucun micro humain ou téléphone physique n’a été utilisé pour ces contrôles. Les gestes, les marges système et le clavier natifs restent à essayer sur Android/iOS. Le calcul gratuit nécessite toujours le Mac actif ; aucun APK autonome signé, déploiement ou push distant n’a été réalisé.
