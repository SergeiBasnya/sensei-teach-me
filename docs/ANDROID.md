# Essai Android avec Expo Go

Le projet n’a pas encore d’APK autonome compilé et signé. Expo Go permet un premier essai gratuit sur le téléphone, avec le serveur de développement du Mac. La version Android Expo Go 58.0.5 compatible avec le SDK 58 a été vérifiée dans l’API officielle Expo le 24 octobre 2026.

## Préparer le Mac

Après installation des moteurs locaux décrite dans le README :

```sh
npm run local:lan
```

Ce mode écoute sur le réseau local, port 8787, avec le code du fichier `.local/conversation/access-token`. Le mode habituel `npm run local` reste sur la boucle locale. Le code n’est jamais incorporé dans le bundle Android ; ne pas le publier dans ce document.

Dans un deuxième terminal, remplacer l’adresse par l’IPv4 Wi-Fi du Mac :

```sh
EXPO_PUBLIC_API_URL=http://ADRESSE_DU_MAC:8787 npx expo start --go --lan --port 8083
```

Metro affiche un QR code `exp://ADRESSE_DU_MAC:8083`. L’adresse publique du serveur ne contient aucun secret. L’adresse IP peut changer après une reconnexion Wi-Fi ; relancer Metro avec la bonne valeur dans ce cas.

## Sur le téléphone

1. Connecter le téléphone au même Wi-Fi que le Mac.
2. Installer [Expo Go 58.0.5 pour Android, APK officiel](https://github.com/expo/expo-go-releases/releases/download/Expo-Go-58.0.5/Expo-Go-58.0.5.apk), puis scanner le QR code affiché par Metro. L’API officielle annonce encore SDK 57 comme version courante : utiliser cet APK compatible SDK 58 pour ce projet. Son téléchargement officiel a été vérifié (HTTP 200).
3. Dans les réglages de Sensei, vérifier l’adresse `http://ADRESSE_DU_MAC:8787`, proposée depuis la configuration ou l’hôte Expo Go, et saisir le code personnel transmis séparément. Connecter le serveur ; l’état doit indiquer « Vocal gratuit prêt ».
4. Fermer les réglages et toucher Commencer ma leçon ou une situation. Autoriser l’enregistrement audio si demandé : Mochi lit directement sa première question, puis écoute.
5. Attendre « À toi de parler », parler japonais puis faire une courte pause. Mochi répond et le micro reprend automatiquement. Le bouton central met en pause ; Je bloque ouvre une aide sur la question courante, un exemple à écouter et un champ pour exprimer sa réponse en français. À moi de parler reprend l’écoute pour essayer à voix haute. Historique montre les échanges.

Le Mac et les deux processus de développement doivent rester actifs. Sur Android/iOS, l’adresse et le code sont conservés avec Expo SecureStore, puis relus à l’ouverture. Aucun état « prêt » n’est conservé : le serveur est interrogé à nouveau avant d’activer le vocal. Une déconnexion explicite supprime les identifiants mémorisés. Sur l’aperçu web local, le code reste en mémoire et est récupéré automatiquement au rechargement. Cette version n’évalue pas la prononciation.

## Vérifications

Le serveur a été interrogé par son adresse LAN avec authentification : état local et oral prêts. La connexion automatique reste réservée à la boucle locale ; le téléphone utilise le code personnel. Vingt-deux tests, les types, le formatage et les exports web/iOS/Android passent. Sur l’export web final à 320×568, 390×844, 844×390 et 1440×1000, la mascotte et le panneau d’aide ont été observés. Un tour audio synthétique utilise les vrais moteurs ; l’aide suit sa nouvelle question, traduit une intention française, lit la réponse et reprend le micro sans relecture ni faux tour d’élève. Voir [les vérifications de l’aide](COACH.md). Le stockage sécurisé, les permissions et le micro sur un téléphone physique restent à vérifier. Voir [la description du parcours](CONVERSATION-SIMPLE.md) et [les textes avant/après](CONVERSATION-TEXTES-AVANT-APRES.md).

Sources : [démarrage d’un projet Expo](https://docs.expo.dev/get-started/start-developing/), [versions Expo Go](https://exp.host/--/api/v2/versions), [distribution d’un APK autonome](https://docs.expo.dev/build/internal-distribution/).

## Comparatif de la consigne d’installation

| Avant | Après |
|---|---|
| Installer Expo Go sur Android puis scanner le QR code affiché par Metro. | Installer Expo Go 58.0.5 pour Android, APK officiel, puis scanner le QR code affiché par Metro. L’API officielle annonce encore SDK 57 comme version courante : utiliser cet APK compatible SDK 58 pour ce projet. Son téléchargement officiel a été vérifié (HTTP 200). |
