# Connexion mobile — textes avant / après

Sources avant : commit `2731b8e`. Sources après : correction du 26 octobre 2026. Les dialogues japonais et leurs traductions sont conservés. Aucun déplacement de section ; le titre de connexion, son statut et ses explications évoluent. Les paragraphes remplacés sont reproduits intégralement ci-dessous.

## Accueil — badge

| Avant | Après |
|---|---|
| Ta première conversation | Vocal prêt / Connexion… / Vocal à connecter (selon la vérification réelle) |

## Réglages — titre

| Avant | Après |
|---|---|
| Conversation avec l’IA | Conversation orale |

## Réglages — introduction

| Avant | Après |
|---|---|
| Dialogue, transcription et voix gratuits sur ton serveur personnel. | Associe ton téléphone à Mochi une fois, puis retrouve ta connexion à chaque ouverture. |

## Réglages — confirmation locale

| Avant | Après |
|---|---|
| Moteurs locaux connectés | Vocal gratuit prêt |

## Réglages — champ du code

| Avant | Après |
|---|---|
| Ton code SENSEI_ACCESS_TOKEN | Le code fourni pour ton téléphone |

## Réglages — traitement local

| Avant | Après |
|---|---|
| Mochi utilise Whisper, Qwen et VOICEVOX sur ton serveur personnel. Aucun compte ni appel IA payant. Le code reste en mémoire jusqu’à la fermeture. | La conversation utilise des moteurs gratuits sur ton Mac, qui doit rester allumé. Aucun compte ni clé OpenAI nécessaire. |

## Réglages — fournisseur optionnel

| Avant | Après |
|---|---|
| Ce serveur utilise OpenAI : audio et messages lui sont transmis. Le code reste en mémoire jusqu’à la fermeture. | Ce serveur utilise OpenAI : audio et messages lui sont transmis. |

## Réglages — persistance native (ajout)

| Avant | Après |
|---|---|
| — | La connexion est conservée dans le stockage sécurisé de ton téléphone. |

## Réglages — reconnexion web (ajout)

| Avant | Après |
|---|---|
| — | L’aperçu sur ce Mac se reconnecte automatiquement au serveur local. |

## Réglages — vérification en cours (ajout)

| Avant | Après |
|---|---|
| — | Vérification du vocal… |

## Réglages — connexion partielle (ajout)

| Avant | Après |
|---|---|
| — | Le dialogue est connecté, mais la voix est indisponible. |

## Réglages — indisponibilité (ajout)

| Avant | Après |
|---|---|
| — | Mochi n’est pas joignable. Vérifie que ton Mac est allumé et accessible depuis ton téléphone. |

## Réglages — nouvel essai (ajout)

| Avant | Après |
|---|---|
| — | Réessayer la connexion au vocal |

## Réglages — adresse locale du téléphone (ajout)

| Avant | Après |
|---|---|
| — | Sur ton téléphone, utilise l’adresse Wi-Fi de ton Mac. localhost désigne le téléphone lui-même. |

## Connexion — stockage inaccessible (ajout)

| Avant | Après |
|---|---|
| — | La connexion mémorisée est indisponible. Tu peux reconnecter Mochi dans les réglages. |

## Connexion — échec de mémorisation (ajout)

| Avant | Après |
|---|---|
| — | La connexion fonctionne, mais ne peut pas être mémorisée sur cet appareil. |

## Connexion — démarrage des moteurs (ajout)

| Avant | Après |
|---|---|
| — | Mochi démarre. La connexion sera réessayée automatiquement. |

## Connexion — moteurs absents (ajout)

| Avant | Après |
|---|---|
| — | Les moteurs de Mochi ne sont pas prêts sur le serveur. |

## Connexion — indisponibilité générique (ajout)

| Avant | Après |
|---|---|
| — | Mochi n’est pas joignable pour le moment. |

## README — connexion du téléphone

| Avant | Après |
|---|---|
| Pour un téléphone, `localhost` désigne le téléphone. Copier `.env.example` vers `.env`, choisir un code personnel et une adresse de serveur accessible, puis lancer `npm run server`. Saisir l’adresse et le code dans les réglages de Sensei. Les contraintes du navigateur et d’iOS/Android peuvent imposer HTTPS pour le micro et le transport réseau. `HOST=0.0.0.0` permet un essai LAN si l’utilisateur le configure ; `npm run local` reste exclusivement sur la boucle locale. Aucun tunnel, hébergement, certificat ou service réseau n’est installé automatiquement. | Pour un téléphone, `localhost` désigne le téléphone. Suivre [l’essai Android](docs/ANDROID.md) : `npm run local:lan`, Expo Go sur le même Wi-Fi, puis association dans les réglages. L’adresse peut être déduite de l’hôte Expo Go ; le code est saisi une fois. Sur Android/iOS, la connexion est conservée avec Expo SecureStore, puis la disponibilité réelle du vocal est vérifiée à chaque ouverture et retour au premier plan. L’accueil indique « Vocal prêt » uniquement après vérification. Le Mac doit rester allumé. Les contraintes du navigateur et d’iOS/Android peuvent imposer HTTPS pour le micro et le transport réseau. `npm run local` reste exclusivement sur la boucle locale. Aucun tunnel, hébergement, certificat ou service réseau n’est installé automatiquement. |

## ANDROID — association initiale

| Avant | Après |
|---|---|
| 3. Dans les réglages de Sensei, vérifier l’adresse `http://ADRESSE_DU_MAC:8787` et saisir le code personnel transmis séparément. Connecter le serveur ; l’état doit indiquer « Moteurs locaux connectés ». | 3. Dans les réglages de Sensei, vérifier l’adresse `http://ADRESSE_DU_MAC:8787`, proposée depuis la configuration ou l’hôte Expo Go, et saisir le code personnel transmis séparément. Connecter le serveur ; l’état doit indiquer « Vocal gratuit prêt ». L’accueil affiche alors « Vocal prêt ». |

## ANDROID — persistance et limites

| Avant | Après |
|---|---|
| Le Mac et les deux processus de développement doivent rester actifs. Le code de connexion reste en mémoire jusqu’à la fermeture de l’application. Cette version n’évalue pas la prononciation. | Le Mac et les deux processus de développement doivent rester actifs. Sur Android/iOS, l’adresse et le code sont conservés avec Expo SecureStore, puis relus à l’ouverture. Aucun état « prêt » n’est conservé : le serveur est interrogé à nouveau avant d’activer le vocal. Une déconnexion explicite supprime les identifiants mémorisés. Sur l’aperçu web local, le code reste en mémoire et est récupéré automatiquement au rechargement. Cette version n’évalue pas la prononciation. |

## ANDROID — vérifications et limites

| Avant | Après |
|---|---|
| Le serveur a été interrogé par son adresse LAN avec authentification : état local et oral prêts. Une tentative de récupération automatique du code depuis cette même adresse LAN est refusée (403) ; seule la boucle locale bénéficie de la connexion automatique. Le manifeste Expo Android et le bundle sont servis, et l’adresse API LAN est présente dans ce bundle. Types, tests et contrôle du projet passent. Le micro et l’installation sur le téléphone physique restent à vérifier par l’utilisateur. | Le serveur a été interrogé par son adresse LAN avec authentification : état local et oral prêts. Une tentative de récupération automatique du code depuis cette même adresse LAN est refusée (403) ; seule la boucle locale bénéficie de la connexion automatique. Le manifeste Expo Android et le bundle sont servis, et l’adresse API LAN est présente dans ce bundle. Les 17 tests, les types, le formatage et les exports web/iOS/Android passent. Le rendu web est observé à 320×568, 390×844 et 1440×1000 ; une panne de santé simulée puis une reconnexion au vrai serveur passent. Les deux tours de `npm run oral:check` utilisent les vrais moteurs. Le stockage sécurisé, le micro et l’installation sur un téléphone physique restent à vérifier. Voir [le comparatif des textes](MOBILE-TEXTES-AVANT-APRES.md). |

