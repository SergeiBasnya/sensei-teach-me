# Reprendre la leçon après la connexion

30 octobre 2026. Correction ordinaire de navigation dans `src/App.tsx`. L’authentification, le serveur, les adresses enregistrées, les codes et les modèles restent inchangés.

Avant : une révision ou une conversation libre nécessitant une connexion ouvrait les réglages et perdait la demande de démarrage. Même après une connexion valide, la leçon demandée ne reprenait pas.

Après : la scène demandée reste en attente et s’ouvre après une connexion vérifiée. Fermer les réglages ou ouvrir le laboratoire annule l’attente. Une connexion invalide ne permet pas de commencer une révision. Aucun texte ni motif visuel n’est remplacé.

Vérifications : typage,154 tests TypeScript et exports web/Android/iOS passent. Quatre parcours d’intégration dans l’App exportée passent avec health simulé : connexion réussie, connexion refusée, annulation, démarrage déjà connecté. Micro volontairement interdit ; aucun essai vocal ou Android physique revendiqué. [Résultats](evidence/lesson-start/results.json) et [revue du rendu](lesson-start-technical-review.json).

Le QR Expo charge le projet ; il ne remplace pas l’adresse ou le code conservés sur le téléphone. Pour cet essai, utiliser l’adresse Mac actuelle `http://192.168.1.31:8787`, copier le code personnel depuis le fichier privé `.local/conversation/access-token`, puis appuyer sur Connecter mon serveur. Aucun code réel ne figure dans les preuves.

Workflow OFA du30octobre vérifié : main et origine synchronisés sur50dff54 avant modification, dépôt initialement propre, permissions push présentes, branche sans protection et aucun ruleset. CI existante Studio design guard déclenchée sur push et PR ; aucune CI nouvelle et aucun contrôle propre aux PR retiré. Correction sans changement d’authentification ou d’intégrité, donc chemin ordinaire sur main. Vérifier le SHA publié et le résultat distant après push.
