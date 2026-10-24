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
3. Dans les réglages de Sensei, vérifier l’adresse `http://ADRESSE_DU_MAC:8787` et saisir le code personnel transmis séparément. Connecter le serveur ; l’état doit indiquer « Moteurs locaux connectés ».
4. Fermer les réglages, choisir une situation, toucher le micro et autoriser l’enregistrement audio.
5. Attendre « Je t’écoute… », parler japonais puis faire une courte pause. Mochi répond et le micro reprend automatiquement. Le bouton pause arrête l’échange.

Le Mac et les deux processus de développement doivent rester actifs. Le code de connexion reste en mémoire jusqu’à la fermeture de l’application. Cette version n’évalue pas la prononciation.

## Vérifications

Le serveur a été interrogé par son adresse LAN avec authentification : état local et oral prêts. Une tentative de récupération automatique du code depuis cette même adresse LAN est refusée (403) ; seule la boucle locale bénéficie de la connexion automatique. Le manifeste Expo Android et le bundle sont servis, et l’adresse API LAN est présente dans ce bundle. Types, tests et contrôle du projet passent. Le micro et l’installation sur le téléphone physique restent à vérifier par l’utilisateur.

Sources : [démarrage d’un projet Expo](https://docs.expo.dev/get-started/start-developing/), [versions Expo Go](https://exp.host/--/api/v2/versions), [distribution d’un APK autonome](https://docs.expo.dev/build/internal-distribution/).

## Comparatif de la consigne d’installation

| Avant | Après |
|---|---|
| Installer Expo Go sur Android puis scanner le QR code affiché par Metro. | Installer Expo Go 58.0.5 pour Android, APK officiel, puis scanner le QR code affiché par Metro. L’API officielle annonce encore SDK 57 comme version courante : utiliser cet APK compatible SDK 58 pour ce projet. Son téléchargement officiel a été vérifié (HTTP 200). |
