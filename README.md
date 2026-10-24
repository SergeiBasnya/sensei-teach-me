# Sensei — Japonais avec Mochi

Application personnelle de pratique du japonais pour débutant francophone. Code commun iOS, Android et web avec React Native, Expo et TypeScript. Inspirée du principe conversationnel de [Pingo](https://pingo.ai/), avec une identité et des illustrations originales.

## Essayer tout de suite

```sh
npm ci
npm run web
```

Ouvrir `http://localhost:8081`. Trois exercices guidés fonctionnent sans compte ni clé : présentation, café et gare. Les réponses proposées font avancer un dialogue préparé. La lecture utilise la voix japonaise disponible sur l’appareil ; elle peut nécessiter l’installation d’une voix dans ses réglages. Ces exercices n’évaluent pas la prononciation.

Le carnet, les expressions acquises, les objectifs, les séances et les séries de jours sont sauvegardés sur cet appareil. Le temps mesuré correspond à la séance au premier plan, pas à une mesure du temps de parole. Les réglages permettent de masquer romaji et traduction.

## Activer les conversations et le micro

1. Copier `.env.example` vers `.env`.
2. Renseigner `OPENAI_API_KEY` et remplacer `SENSEI_ACCESS_TOKEN` par un code personnel aléatoire d’au moins 16 caractères. Ne pas utiliser la clé OpenAI comme code d’accès. Le compte API doit disposer d’un quota ; les appels sont facturés par le fournisseur.
3. Lancer `npm run server` dans un deuxième terminal.
4. Dans les réglages de Sensei, saisir l’adresse du serveur et ce code personnel, puis connecter.

Le serveur écoute sur `127.0.0.1:8787` par défaut et refuse les appels sans code. Les origines web sont limitées à celles de `ALLOWED_ORIGINS`. Pour la prévisualisation exportée sur le port 8082, ajouter `http://localhost:8082` à cette variable. Ne pas exposer le serveur personnel publiquement sans HTTPS et protection d’accès adaptée.

Sur téléphone, `localhost` désigne le téléphone. Utiliser une adresse HTTPS accessible de l’appareil. Pour un essai sur réseau local, `HOST=0.0.0.0` rend le serveur accessible sur le LAN ; les restrictions HTTP d’iOS/Android peuvent imposer HTTPS. `EXPO_PUBLIC_API_URL` peut définir l’adresse initiale ; ne jamais y mettre un secret.

Le micro enregistre une réponse de 60 secondes maximum. Un second appui arrête et transcrit. La transcription apparaît dans le champ de saisie pour vérification avant envoi. Le tuteur répond en japonais simple, avec romaji, traduction, correction textuelle éventuelle et expressions à retenir. Il ne note pas la prononciation. La conversation fonctionne par tours, sans interruption vocale simultanée.

La clé API reste exclusivement sur le serveur. Le code personnel reste en mémoire dans l’application jusqu’à sa fermeture. Le serveur ne conserve pas les messages ni les fichiers audio et demande `store: false` pour les réponses. OpenAI traite les données envoyées selon ses propres [règles de conservation](https://developers.openai.com/api/docs/guides/your-data). Aucun audio n’est envoyé en mode guidé. Le contexte des 16 derniers messages de la séance est transmis, sans mémoire distante entre séances.

Modèles configurables : `gpt-4.1-mini` pour les réponses structurées et `gpt-transcribe` pour la transcription. Références : [transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs), [audio Expo](https://docs.expo.dev/versions/latest/sdk/audio/).

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
npm run build
npm run build:mobile
python3 /Users/augustdouglas/Documents/projects/ofa/scripts/install_design_guard.py doctor --project "$PWD"
```

`build` exporte le web sous `build/web`. `build:mobile` vérifie la génération des bundles iOS/Android ; ce n’est pas une compilation Xcode/Gradle. Les tests d’API emploient un fournisseur simulé, sans appel payant. Le contrôle de liserés est raccordé aux commandes, aux hooks Git et à une CI portable. Il reste à publier le dépôt pour exécuter cette CI à distance ; aucune protection distante n’est active ici.

Une alerte npm reste sur `node-forge@1.4.0`, dépendance transitive de l’outillage de signature Expo (GHSA-86w9-cpqp-85rv), sans version corrigée disponible lors de la vérification. Elle remonte aussi via ses trois packages parents. Zod a été corrigé par mise à jour et override compatible. Aucun `audit fix --force` ni rétrogradation d’Expo n’a été appliqué.

## Structure

- `src/screens/` : accueil, pratique, carnet, progression.
- `src/components/` : compagnon SVG original, conversation, réglages et composants communs.
- `src/lib/` : sauvegarde validée, progression, client API.
- `shared/contracts.ts` : contrats validés entre application et serveur.
- `server/` : API personnelle protégée, limites de débit et intégration OpenAI.
- `tests/` : progression et intégration HTTP.
- `docs/` : choix de conception et revue PRISMA.

## Périmètre de cette première version

Pas encore de conversation audio en duplex, de diagnostic phonétique, de synchronisation entre appareils, de notifications ou de publication sur les stores. L’intégration réelle OpenAI, la capture micro et la synthèse vocale native nécessitent une recette sur les appareils ciblés avec la clé du propriétaire. La revue navigateur est une preuve du rendu web responsive ; elle ne certifie pas le rendu natif.
