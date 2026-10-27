# Sensei — Japonais avec Mochi

Application personnelle de pratique du japonais pour débutant francophone. Code commun iOS, Android et web avec React Native, Expo et TypeScript. Inspirée du principe conversationnel de [Pingo](https://pingo.ai/), avec une identité et des illustrations originales.

L’avatar manga B est animé avec Mesh Avatar : mouvements du visage et des cheveux, clignements et bouche reliée à la voix. Le rendu est inclus dans l’application, y compris Android avec Expo Go. [Fonctionnement, reconstruction et limites](docs/MESH-AVATAR.md).

## Essayer tout de suite

```sh
npm ci
npm run web
```

Ouvrir `http://localhost:8081`. L’accueil propose le prochain objectif avec Commencer ma leçon. Ma progression s’ouvre depuis le haut et Mon plan depuis le bas, par glissement ou appui. Le parcours débutant organise les trois situations — présentation, café et gare — en neuf objectifs guidés, accessibles sans compte ni clé. Les réponses proposées font avancer un dialogue préparé. Les 25 phrases distinctes sont enregistrées avec la voix A choisie par le propriétaire, **VOICEVOX:雨晴はう**, à vitesse et intonation normales. Elles sont incluses dans l’application : aucun service ni accès Internet n’est requis pour leur synthèse pendant l’utilisation. Ces exercices n’évaluent pas la prononciation.

Le carnet, les expressions acquises, les objectifs, les séances, les séries de jours et les erreurs corrigées sont sauvegardés sur cet appareil. Mochi programme des révisions espacées et ajuste son aide d’après les rappels réussis sans modèle. Le temps mesuré correspond à la séance au premier plan, pas à une mesure du temps de parole. Les réglages permettent de masquer romaji et traduction. [Mémoire et révisions](docs/LEARNING-MEMORY.md).

## Converser à l’oral, gratuitement

La conversation utilise trois moteurs installés sur le serveur personnel : [Whisper small via MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper) pour la transcription française et japonaise, [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) pour le dialogue, les corrections et le contrôle des révisions, et [VOICEVOX](https://github.com/VOICEVOX/voicevox_core) pour la voix A choisie. Les explications françaises utilisent la voix Amélie déjà disponible sur le Mac, convertie en WAV pour le téléphone. Aucun compte, abonnement ou appel IA payant. Cette installation nécessite un Mac Apple Silicon ; les moteurs restent sur l’ordinateur, les applications iOS/Android s’y connectent.

Les dépendances sont isolées dans `.venv/` et les modèles dans `.local/`. Aucun service système n’est installé. Environ 8,8 Go de modèles de dialogue/transcription sont téléchargés une fois, en plus du moteur vocal et des dépendances. Les révisions exactes sont épinglées dans l’installateur. Prévoir un Python compatible avec MLX et macOS ; la machine de validation utilise Python 3.12.

```sh
python3 scripts/setup-local-conversation.py
python3 scripts/setup-local-voice.py --accept-voicevox-terms
npm run build
npm run local
```

Lire les conditions VOICEVOX référencées ci-dessous avant de passer son option d’acceptation. Ouvrir ensuite `http://localhost:8787`, puis toucher Commencer ma leçon, choisir un objectif dans Mon plan ou passer à la page Conversation libre. Lorsque le vocal est connecté, la conversation démarre à l’ouverture ; autoriser le micro si le téléphone le demande. L’aperçu sur les ports 8081/8082 se connecte aussi automatiquement à ce serveur local lorsqu’il est prêt. Le code personnel est généré dans `.local/conversation/access-token`, jamais inclus dans le bundle ni dans Git.

Mochi commence un nouvel objectif par une courte explication française parlée et un modèle japonais, puis pose sa question. Un point déjà retrouvé seul plusieurs fois peut commencer directement en japonais. Le micro écoute ensuite ; une pause d’environ 1,8 seconde après ta voix envoie ta phrase. Sa réponse est lue automatiquement et le micro reprend. Aucun texte à confirmer. Le bouton central met en pause ou reprend l’écoute sans relire une question déjà entendue. Je bloque et Historique mettent en pause et ouvrent leur panneau. Je bloque explique comment répondre à la question actuelle, propose un exemple à adapter et permet d’écouter sa réponse. Une intention écrite en français devient une phrase japonaise avec romaji et traduction ; À moi de parler reprend l’écoute pour que l’élève la prononce. Le clavier et la relecture restent accessibles dans ce panneau. Après environ 15 secondes sans voix, Mochi propose une aide orale une fois ; un nouveau silence met l’échange en pause. Un tour est limité à 30 secondes. Une révision commence sans montrer la réponse, puis se termine après une réponse correcte. Les demandes d’aide restent possibles à tout moment.

Le japonais, le romaji et la traduction restent consultables. Whisper détecte le français et le japonais automatiquement, mais peut mal transcrire ou normaliser une faute. Le modèle local peut se tromper : aucune note de prononciation ni correction phonétique n’est calculée. Le temps de pratique mesure la séance au premier plan. Les expressions du carnet et la progression restent sur l’appareil ; la conversation courante reste en mémoire pendant la séance. Les corrections et leurs dates sont conservées localement entre les séances pour préparer les révisions. Il n’y a pas de synchronisation entre navigateur et téléphone.

Les messages et l’audio sont traités sur le serveur personnel, sans envoi à un fournisseur IA en mode local. Les fichiers temporaires de transcription sont supprimés après décodage ; les audios de lecture temporaires sont supprimés après lecture/interruption. Le serveur ne journalise pas les paroles. La transcription, le dialogue et la synthèse sont effectués successivement : une attente de quelques secondes est normale. Les conditions réelles de bruit et d’accent doivent encore être testées avec l’utilisateur.

Pour un téléphone, `localhost` désigne le téléphone. Suivre [l’essai Android](docs/ANDROID.md) : `npm run local:lan`, Expo Go sur le même Wi-Fi, puis association dans les réglages. L’adresse peut être déduite de l’hôte Expo Go ; le code est saisi une fois. Sur Android/iOS, la connexion est conservée avec Expo SecureStore, puis la disponibilité réelle du vocal est vérifiée à chaque ouverture et retour au premier plan. Le Mac doit rester allumé. Les contraintes du navigateur et d’iOS/Android peuvent imposer HTTPS pour le micro et le transport réseau. `npm run local` reste exclusivement sur la boucle locale. Aucun tunnel, hébergement, certificat ou service réseau n’est installé automatiquement.

Le fournisseur OpenAI historique reste optionnel, uniquement avec `SENSEI_PROVIDER=openai`, une clé côté serveur et son propre quota payant. Le mode local est celui par défaut et n’effectue aucun repli payant. La connexion automatique et son échange de jeton sont réservés à l’aperçu local ; un serveur exposé au réseau conserve l’authentification par code.

## Voix japonaise locale, gratuite

Les exercices, la phrase du jour et les expressions correspondantes du carnet utilisent les fichiers de `assets/speech/`. Les textes japonais, le romaji et les traductions n’ont pas été modifiés. Le lecteur est partagé entre les écrans : une nouvelle lecture remplace la précédente, et l’ouverture du micro arrête la voix.

Pour générer les nouvelles phrases des conversations sur le serveur personnel :

```sh
python3 scripts/setup-local-voice.py --accept-voicevox-terms
npm run voice:check
npm run server
```

Lire préalablement les [conditions des modèles](https://github.com/VOICEVOX/voicevox_vvm) et de [la voix choisie](https://amehau.com/rules/amehare-hau-rule). Le script crée uniquement `.venv/` et `.local/voicevox/` dans ce projet, télécharge les binaires officiels et vérifie l’empreinte du téléchargeur. Il n’installe aucun service ni paquet système. Le moteur tourne sur le serveur, pas dans le téléphone.

`POST /api/speech`, protégé par le même code personnel que les autres routes, génère un WAV avec VOICEVOX. Il fonctionne sans clé OpenAI. La conversation utilise désormais le fournisseur local de dialogue et de transcription par défaut ; la voix fonctionne aussi indépendamment de lui. Aucun modèle vocal ni texte n’est envoyé à un fournisseur pour la synthèse.

Pour régénérer les enregistrements après changement des phrases :

```sh
npm run voice:assets
```

Les paramètres par défaut sont vitesse 1.0, hauteur 0.0 et intonation 1.0. Les fichiers, le manifeste et le crédit sont versionnés. Pour une expression absente des enregistrements, le lecteur utilise le moteur local lorsque le serveur est connecté. Hors connexion, une voix du système peut servir de repli uniquement si elle est explicitement identifiée comme japonaise ; aucune voix française ou anglaise n’est substituée. L’absence de voix affiche une erreur.

## iOS et Android

```sh
npm start
```

Utiliser une version d’Expo Go compatible avec le SDK 58 pour un premier essai. La compilation native et l’installation sur appareil nécessitent ensuite les outils et identifiants des plateformes. La configuration EAS est fournie :

```sh
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

Android génère un APK de test. iOS nécessite un compte Apple Developer, la signature et l’enregistrement des appareils pour la distribution interne. Pour TestFlight, utiliser le profil `production`, puis soumettre la compilation avec EAS. Aucun binaire natif n’a été signé ni distribué dans cette livraison.

## Vérifier et construire

```sh
npm run check
npm run format:check
npm run oral:check
npm run build
npm run build:mobile
python3 /Users/augustdouglas/Documents/projects/ofa/scripts/install_design_guard.py doctor --project "$PWD"
```

`build` exporte le web sous `build/web`. `build:mobile` vérifie la génération des bundles iOS/Android ; ce n’est pas une compilation Xcode/Gradle. Les tests d’API emploient un fournisseur simulé, sans appel payant. Le contrôle de liserés est raccordé aux commandes, aux hooks Git et à une CI portable. Il reste à publier le dépôt pour exécuter cette CI à distance ; aucune protection distante n’est active ici.

Une alerte npm reste sur `node-forge@1.4.0`, dépendance transitive de l’outillage de signature Expo (GHSA-86w9-cpqp-85rv), sans version corrigée disponible lors de la vérification. Elle remonte aussi via ses trois packages parents. Zod a été corrigé par mise à jour et override compatible. Aucun `audit fix --force` ni rétrogradation d’Expo n’a été appliqué.

## Structure

- `src/screens/` : accueil, pratique, carnet, progression.
- `src/components/` : compagnon illustré, conversation, aide contextuelle, réglages et composants communs. Avatar manga B choisi par le propriétaire : `assets/avatar/README.md`. Navigation et plan : `docs/HUB.md`.
- `src/lib/` : sauvegarde validée, progression, client API.
- `shared/contracts.ts` : contrats validés entre application et serveur.
- `server/` : API personnelle protégée, limites de débit et intégration OpenAI.
- `tests/` : progression et intégration HTTP.
- `docs/` : choix de conception et revue PRISMA.

## Périmètre de cette première version

La conversation orale automatique locale est implémentée et testée avec un audio synthétique injecté dans un micro de navigateur isolé et les vrais modèles. Ce contrôle ne mesure pas la reconnaissance d’une voix humaine en conditions réelles. Les exports iOS/Android sont vérifiés ; aucune compilation native signée, installation sur téléphone, synchronisation multiappareil, notification ou publication sur les stores n’a été réalisée. Il n’y a pas de dialogue simultané en duplex ni de diagnostic phonétique. Le serveur personnel doit rester allumé et accessible pendant une séance.
