# Comparatif des textes — conversation orale locale

Les sections README modifiées sont reproduites intégralement, avant à gauche, après à droite. La section d’activation OpenAI est remplacée par le parcours local gratuit, avec ajout des commandes et limites ; les autres sections restent en place. Les dialogues japonais préparés ne sont pas réécrits.

<table><tr><th>Avant</th><th>Après</th></tr><tr><td><pre>## Activer les conversations et le micro

1. Copier `.env.example` vers `.env`.
2. Renseigner `OPENAI_API_KEY` et remplacer `SENSEI_ACCESS_TOKEN` par un code personnel aléatoire d’au moins 16 caractères. Ne pas utiliser la clé OpenAI comme code d’accès. Le compte API doit disposer d’un quota ; les appels sont facturés par le fournisseur.
3. Lancer `npm run server` dans un deuxième terminal.
4. Dans les réglages de Sensei, saisir l’adresse du serveur et ce code personnel, puis connecter.

Le serveur écoute sur `127.0.0.1:8787` par défaut et refuse les appels sans code. Les origines web sont limitées à celles de `ALLOWED_ORIGINS`. Pour la prévisualisation exportée sur le port 8082, ajouter `http://localhost:8082` à cette variable. Ne pas exposer le serveur personnel publiquement sans HTTPS et protection d’accès adaptée.

Sur téléphone, `localhost` désigne le téléphone. Utiliser une adresse HTTPS accessible de l’appareil. Pour un essai sur réseau local, `HOST=0.0.0.0` rend le serveur accessible sur le LAN ; les restrictions HTTP d’iOS/Android peuvent imposer HTTPS. `EXPO_PUBLIC_API_URL` peut définir l’adresse initiale ; ne jamais y mettre un secret.

Le micro enregistre une réponse de 60 secondes maximum. Un second appui arrête et transcrit. La transcription apparaît dans le champ de saisie pour vérification avant envoi. Le tuteur répond en japonais simple, avec romaji, traduction, correction textuelle éventuelle et expressions à retenir. Il ne note pas la prononciation. La conversation fonctionne par tours, sans interruption vocale simultanée.

La clé API reste exclusivement sur le serveur. Le code personnel reste en mémoire dans l’application jusqu’à sa fermeture. Le serveur ne conserve pas les messages ni les fichiers audio et demande `store: false` pour les réponses. OpenAI traite les données envoyées selon ses propres [règles de conservation](https://developers.openai.com/api/docs/guides/your-data). Aucun audio n’est envoyé en mode guidé. Le contexte des 16 derniers messages de la séance est transmis, sans mémoire distante entre séances.

Modèles configurables : `gpt-4.1-mini` pour les réponses structurées et `gpt-transcribe` pour la transcription. Références : [transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs), [audio Expo](https://docs.expo.dev/versions/latest/sdk/audio/).

</pre></td><td><pre>## Converser à l’oral, gratuitement

La conversation utilise trois moteurs installés sur le serveur personnel : [Whisper small via MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper) pour la transcription japonaise, [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) pour le dialogue et [VOICEVOX](https://github.com/VOICEVOX/voicevox_core) pour la voix A choisie. Aucun compte, abonnement ou appel IA payant. Cette installation nécessite un Mac Apple Silicon ; les moteurs restent sur l’ordinateur, les applications iOS/Android s’y connectent.

Les dépendances sont isolées dans `.venv/` et les modèles dans `.local/`. Aucun service système n’est installé. Environ 8,8 Go de modèles de dialogue/transcription sont téléchargés une fois, en plus du moteur vocal et des dépendances. Les révisions exactes sont épinglées dans l’installateur. Prévoir un Python compatible avec MLX et macOS ; la machine de validation utilise Python 3.12.

```sh
python3 scripts/setup-local-conversation.py
python3 scripts/setup-local-voice.py --accept-voicevox-terms
npm run build
npm run local
```

Lire les conditions VOICEVOX référencées ci-dessous avant de passer son option d’acceptation. Ouvrir ensuite `http://localhost:8787`, choisir une situation ou une conversation libre et toucher le micro. L’aperçu sur les ports 8081/8082 se connecte aussi automatiquement à ce serveur local lorsqu’il est prêt. Le code personnel est généré dans `.local/conversation/access-token`, jamais inclus dans le bundle ni dans Git.

Mochi pose sa question, le micro s’ouvre, puis une pause d’environ 1,8 seconde après ta voix envoie ta phrase. Sa réponse est lue automatiquement et le micro reprend. Aucun texte à confirmer. Le bouton pause arrête capture, requête et lecture ; le clavier reste disponible quand l’échange est en pause. « J’ai fini de parler » est une commande facultative si l’environnement sonore empêche de détecter la pause. Après 15 secondes sans voix, le micro se met en pause ; un tour est limité à 30 secondes.

Le japonais, le romaji et la traduction restent consultables. La transcription vise le japonais ; la reconnaissance d’une demande orale en français n’est pas garantie. Le modèle local peut se tromper : aucune note de prononciation ni correction phonétique n’est calculée. Le temps de pratique mesure la séance au premier plan. Les expressions du carnet et la progression restent sur l’appareil ; la conversation courante reste en mémoire.

Les messages et l’audio sont traités sur le serveur personnel, sans envoi à un fournisseur IA en mode local. Les fichiers temporaires de transcription sont supprimés après décodage ; les audios de lecture temporaires sont supprimés après lecture/interruption. Le serveur ne journalise pas les paroles. La transcription, le dialogue et la synthèse sont effectués successivement : une attente de quelques secondes est normale. Les conditions réelles de bruit et d’accent doivent encore être testées avec l’utilisateur.

Pour un téléphone, `localhost` désigne le téléphone. Copier `.env.example` vers `.env`, choisir un code personnel et une adresse de serveur accessible, puis lancer `npm run server`. Saisir l’adresse et le code dans les réglages de Sensei. Les contraintes du navigateur et d’iOS/Android peuvent imposer HTTPS pour le micro et le transport réseau. `HOST=0.0.0.0` permet un essai LAN si l’utilisateur le configure ; `npm run local` reste exclusivement sur la boucle locale. Aucun tunnel, hébergement, certificat ou service réseau n’est installé automatiquement.

Le fournisseur OpenAI historique reste optionnel, uniquement avec `SENSEI_PROVIDER=openai`, une clé côté serveur et son propre quota payant. Le mode local est celui par défaut et n’effectue aucun repli payant. La connexion automatique et son échange de jeton sont réservés à l’aperçu local ; un serveur exposé au réseau conserve l’authentification par code.

</pre></td></tr><tr><td><pre>## Voix japonaise locale, gratuite

Les exercices, la phrase du jour et les expressions correspondantes du carnet utilisent les fichiers de `assets/speech/`. Les textes japonais, le romaji et les traductions n’ont pas été modifiés. Le lecteur est partagé entre les écrans : une nouvelle lecture remplace la précédente, et l’ouverture du micro arrête la voix.

Pour générer les nouvelles phrases des conversations sur le serveur personnel :

```sh
python3 scripts/setup-local-voice.py --accept-voicevox-terms
npm run voice:check
npm run server
```

Lire préalablement les [conditions des modèles](https://github.com/VOICEVOX/voicevox_vvm) et de [la voix choisie](https://amehau.com/rules/amehare-hau-rule). Le script crée uniquement `.venv/` et `.local/voicevox/` dans ce projet, télécharge les binaires officiels et vérifie l’empreinte du téléchargeur. Il n’installe aucun service ni paquet système. Le moteur tourne sur le serveur, pas dans le téléphone.

`POST /api/speech`, protégé par le même code personnel que les autres routes, génère un WAV avec VOICEVOX. Il fonctionne sans clé OpenAI. La connexion de conversation dans l’application exige toujours le fournisseur de dialogue ; les frais éventuels d’OpenAI concernent les conversations et leur transcription, pas cette voix locale. Aucun modèle vocal ni texte n’est envoyé à un fournisseur pour la synthèse.

Pour régénérer les enregistrements après changement des phrases :

```sh
npm run voice:assets
```

Les paramètres par défaut sont vitesse 1.0, hauteur 0.0 et intonation 1.0. Les fichiers, le manifeste et le crédit sont versionnés. Pour une expression absente des enregistrements, le lecteur utilise le moteur local lorsque le serveur est connecté. Hors connexion, une voix du système peut servir de repli uniquement si elle est explicitement identifiée comme japonaise ; aucune voix française ou anglaise n’est substituée. L’absence de voix affiche une erreur.

</pre></td><td><pre>## Voix japonaise locale, gratuite

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

</pre></td></tr><tr><td><pre>## Vérifier et construire

```sh
npm run check
npm run format:check
npm run build
npm run build:mobile
python3 /Users/augustdouglas/Documents/projects/ofa/scripts/install_design_guard.py doctor --project &quot;$PWD&quot;
```

`build` exporte le web sous `build/web`. `build:mobile` vérifie la génération des bundles iOS/Android ; ce n’est pas une compilation Xcode/Gradle. Les tests d’API emploient un fournisseur simulé, sans appel payant. Le contrôle de liserés est raccordé aux commandes, aux hooks Git et à une CI portable. Il reste à publier le dépôt pour exécuter cette CI à distance ; aucune protection distante n’est active ici.

Une alerte npm reste sur `node-forge@1.4.0`, dépendance transitive de l’outillage de signature Expo (GHSA-86w9-cpqp-85rv), sans version corrigée disponible lors de la vérification. Elle remonte aussi via ses trois packages parents. Zod a été corrigé par mise à jour et override compatible. Aucun `audit fix --force` ni rétrogradation d’Expo n’a été appliqué.

</pre></td><td><pre>## Vérifier et construire

```sh
npm run check
npm run format:check
npm run oral:check
npm run build
npm run build:mobile
python3 /Users/augustdouglas/Documents/projects/ofa/scripts/install_design_guard.py doctor --project &quot;$PWD&quot;
```

`build` exporte le web sous `build/web`. `build:mobile` vérifie la génération des bundles iOS/Android ; ce n’est pas une compilation Xcode/Gradle. Les tests d’API emploient un fournisseur simulé, sans appel payant. Le contrôle de liserés est raccordé aux commandes, aux hooks Git et à une CI portable. Il reste à publier le dépôt pour exécuter cette CI à distance ; aucune protection distante n’est active ici.

Une alerte npm reste sur `node-forge@1.4.0`, dépendance transitive de l’outillage de signature Expo (GHSA-86w9-cpqp-85rv), sans version corrigée disponible lors de la vérification. Elle remonte aussi via ses trois packages parents. Zod a été corrigé par mise à jour et override compatible. Aucun `audit fix --force` ni rétrogradation d’Expo n’a été appliqué.

</pre></td></tr><tr><td><pre>## Périmètre de cette première version

Pas encore de conversation audio en duplex, de diagnostic phonétique, de synchronisation entre appareils, de notifications ou de publication sur les stores. La voix locale et son API ont été testées réellement sans OpenAI ; le choix de la voix A a été confirmé par le propriétaire après écoute. La capture micro et les conversations OpenAI nécessitent encore une recette avec sa clé. Les exports mobiles incluent les enregistrements ; l’écoute sur iPhone et Android réels reste à vérifier. La revue navigateur ne certifie pas le rendu natif.
</pre></td><td><pre>## Périmètre de cette première version

La conversation orale automatique locale est implémentée et testée avec un audio synthétique injecté dans un micro de navigateur isolé et les vrais modèles. Ce contrôle ne mesure pas la reconnaissance d’une voix humaine en conditions réelles. Les exports iOS/Android sont vérifiés ; aucune compilation native signée, installation sur téléphone, synchronisation multiappareil, notification ou publication sur les stores n’a été réalisée. Il n’y a pas de dialogue simultané en duplex ni de diagnostic phonétique. Le serveur personnel doit rester allumé et accessible pendant une séance.
</pre></td></tr></table>

## Interface et messages de service

| Texte actuel avant modification | Texte livré |
|---|---|
| Mochi s’adapte à tes réponses. | Démarre le micro : Mochi t’écoute et te répond. |
| IA connectée | IA locale · gratuite (mode local) ; IA connectée conservé pour OpenAI. |
| Enregistrer ma réponse / Arrêter et transcrire mon enregistrement | Démarrer la conversation orale / Mettre la conversation en pause |
| Touche le micro pour parler · 60 s maximum | Touche le micro pour démarrer la conversation. |
| Enregistrement · [secondes] s · touche pour terminer | Je t’écoute… Fais une pause pour envoyer ta phrase. |
| Mochi parle… | Mochi parle… Le micro reprendra ensuite. |
| Explore les réponses guidées ou connecte l’IA | Connecte le serveur local pour parler à Mochi. |
| L’audio est envoyé à OpenAI pour transcription. Vérifie le texte avant de l’envoyer. | Voix et messages traités sur ton serveur personnel. Envoi automatique après ta phrase. (local) / Audio et messages traités par OpenAI. Envoi automatique après ta phrase. (OpenAI explicite) |
| Un serveur personnel pour protéger ta clé OpenAI. | Dialogue, transcription et voix gratuits sur ton serveur personnel. |
| Serveur connecté | Moteurs locaux connectés / Serveur OpenAI connecté |
| Ce code reste en mémoire jusqu’à la fermeture. Ta clé OpenAI reste sur le serveur. Les enregistrements et messages envoyés à l’IA sont traités par OpenAI ; le carnet et la progression restent sur cet appareil. | Mochi utilise Whisper, Qwen et VOICEVOX sur ton serveur personnel. Aucun compte ni appel IA payant. Le code reste en mémoire jusqu’à la fermeture. (local) / Ce serveur utilise OpenAI : audio et messages lui sont transmis. Le code reste en mémoire jusqu’à la fermeture. (OpenAI) |
| Le serveur répond, mais sa clé OpenAI n’est pas configurée. | Les moteurs locaux démarrent. Réessaie dans quelques secondes. / Le serveur répond, mais le moteur local doit être installé et lancé. |
| Ajoute la clé OPENAI_API_KEY sur le serveur pour activer la conversation. | Installe le moteur de conversation local puis relance le serveur. |
| Ajoute la clé OPENAI_API_KEY sur le serveur pour activer le micro. | Installe le moteur de transcription local puis relance le serveur. |
| Le service IA n’a pas pu répondre. Vérifie la clé, le modèle et la connexion du serveur, puis réessaie. | Mochi n’a pas pu répondre. Vérifie que les moteurs du serveur sont prêts, puis réessaie. |

Ajouts fonctionnels : « J’ai fini de parler », états de préparation et de réflexion, messages de silence, d’accès micro refusé et de reprise après erreur. Suppressions : la validation de transcription et son passage obligatoire par le champ de saisie. Le clavier reste disponible pour une réponse écrite volontaire.

L’exemple préparé de présentation disparaît après le premier tour connecté ; il reste disponible au départ. Il n’est plus présenté comme une suggestion face à une nouvelle question du modèle.
