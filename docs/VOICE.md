# Correction vocale — 24 octobre 2026

Le retour utilisateur concernait la voix, le rythme et l’intonation. Deux extraits ont été générés localement. Après écoute, le propriétaire a choisi explicitement la voix A : **VOICEVOX:雨晴はう**, style normal 10. Le fichier de présentation inclus dans l’application est strictement identique à l’extrait approuvé (SHA-256 `2548302850444f3b0154411ce2a11c0d8af1f7e2a66e2d2e0282c0a045609ec7`).

Avant : lecture par la synthèse système, sans choix explicite d’une voix japonaise, à un débit de 0.75–0.78. Après : 25 enregistrements inclus, générés avec VOICEVOX à un débit de 1.0, hauteur 0.0 et intonation 1.0. Le japonais, le romaji et les traductions sont inchangés.

Le lecteur est partagé entre l’accueil, le carnet et la conversation. Une nouvelle demande remplace la précédente ; les réponses périmées sont ignorées, la lecture s’arrête en quittant un écran et avant l’ouverture du micro. Pour les nouvelles phrases, `/api/speech` utilise le même moteur sur le serveur personnel. Il n’utilise pas OpenAI et ne conserve pas le texte. Le repli système exige une voix explicitement japonaise et utilise la vitesse normale.

Le moteur, le dictionnaire et les modèles sont isolés dans `.local/voicevox/` et `.venv/`, ignorés par Git. Les sources applicatives et les scripts restent dans le contrôle usuel. Aucun service système ni changement de réglage du Mac n’a été effectué. Le moteur n’est pas embarqué dans l’application mobile : seuls les fichiers audio le sont.

Vérifications réalisées :

- Installation reproductible depuis les releases officielles, empreinte du téléchargeur vérifiée.
- Génération réelle des 25 WAV : mono, PCM 16 bits, 24 kHz et absence de silence total vérifiés.
- `npm run voice:check` : appel HTTP au vrai moteur local, sans clé OpenAI ; fichier WAV de 169516 octets reçu.
- `npm run check` : 9 tests réussis, TypeScript strict et contrôle de design réussis.
- `npm run format:check` et compilation des scripts Python : réussis.
- Export web, iOS et Android : réussis avec les 25 enregistrements.
- Lecture navigateur réellement observée : fichier de la phrase du jour, vitesse 1, événement de fin reçu, durée 2.058667 s. L’observation des événements conserve la lecture native du navigateur et ne la simule pas. Sur l’export final, deux appuis sur la lecture de présentation ont produit une interruption intermédiaire, puis une fin de lecture à 3.530667 s, toujours à vitesse 1.

L’écoute sur de vrais iPhone et Android, leurs permissions micro et la conversation OpenAI restent à vérifier. L’approbation de l’extrait A concerne le choix vocal ; elle ne constitue pas une validation artistique des écrans ni une expertise phonétique de toutes les phrases.

Sources : [moteur](https://github.com/VOICEVOX/voicevox_core), [modèles et conditions](https://github.com/VOICEVOX/voicevox_vvm), [voix choisie](https://amehau.com/rules/amehare-hau-rule). Le crédit est conservé dans les réglages, la notice des enregistrements et la documentation.
