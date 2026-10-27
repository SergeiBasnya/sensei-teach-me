# Enseigner en parlant avec Mochi

Retour utilisateur du 27 octobre 2026 : Pingo parle avec l’élève et lui apprend la langue. La première version de Mochi posait des questions en japonais ; ses explications se trouvaient surtout à l’écrit et dans Je bloque. Cette différence concernait le rôle du tuteur.

La référence consultée est la [présentation officielle de Pingo](https://pingo.ai/learn-english), qui décrit un enseignement par la conversation et un accompagnement adapté à l’élève. Cette page est une description du produit, pas une preuve indépendante de ses performances. L’application personnelle ne prétend pas reproduire ses résultats ni toutes ses fonctions.

## Parcours livré

Chaque objectif des neuf leçons commence par une courte explication française parlée, un modèle japonais, une invitation à essayer puis la question. Le premier échange accepté reçoit une suite pédagogique préparée pour cet objectif : demander le prénom après s’être présenté, préciser où l’on habite, exprimer une préférence ou choisir un billet. Une question spontanée de l’élève garde sa place dans le dialogue ; une erreur est corrigée avant cette suite. Le téléphone conserve le fait que cette étape a déjà été présentée pendant la séance, même lorsque l’historique récent se raccourcit.

L’élève peut dire « Je ne sais pas », « Je ne comprends pas » ou demander de l’aide en japonais. La reconnaissance accepte désormais le français et le japonais. Le serveur prépare une explication française et un exemple japonais, puis le micro reprend après les deux lectures. Une intention introduite par « Je veux dire… » peut être traduite en modèle. La grammaire japonaise reste contrôlée sur les mots transcrits.

Après environ quinze secondes de silence, Mochi propose une aide une fois. Si un modèle était déjà en cours de répétition, elle le relit et le conserve. Sinon, elle prépare une aide liée à la question. Un nouveau silence met l’échange en pause. Aucun faux message d’élève n’est ajouté pour demander cette aide ; l’historique et l’avancement n’inventent aucune réponse. Le bouton Je bloque reste disponible.

## Voix et technique

Le japonais garde la voix A de VOICEVOX. Le français est généré sur le serveur Mac par la voix Amélie déjà disponible, via un processus de synthèse vers un fichier temporaire, puis conversion WAV. Aucun réglage système ni téléchargement de voix n’est effectué. Il s’agit d’une voix française distincte, à écouter et ajuster selon le retour utilisateur. Ce chemin français nécessite le serveur macOS actuel ; il ne constitue pas un moteur autonome installé sur Android.

Le téléphone lit des WAV dans les deux langues. La même animation suit leur énergie. Dans le navigateur, un lecteur HTML Audio attend explicitement ended ; sur Android et iOS, Expo Audio suit le démarrage de la lecture avant de prendre en compte sa fin. Pause, arrière-plan ou fermeture invalident les étapes restantes. Une première séquence web pouvait terminer trop tôt en réutilisant le lecteur ; le parcours bilingue a permis de reproduire puis traiter ce cas.

## Limites

Les neuf leçons ont des introductions et suites préparées ; les explications du dialogue libre sont générées et peuvent rester imprécises. Les réponses courtes sont acceptées. Whisper peut mal reconnaître ou normaliser une erreur. L’accent, l’intonation et le rythme ne sont pas notés. La progression indique un objectif pratiqué, sans déclaration de maîtrise. La mémoire détaillée des erreurs entre séances et leur révision espacée ne sont pas encore développées.

Les tests audio utilisent des voix synthétiques, sans microphone humain. Les exports Expo sont vérifiés ; l’appareil Android physique reste à essayer. La décision artistique reste en attente de l’utilisateur sur l’export exact. Voir les textes avant/après, les preuves teaching-* et la revue technique associée.
