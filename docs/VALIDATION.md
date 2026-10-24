# Vérifications — 24 octobre 2026

- `npm run check` : contrôle de liserés, TypeScript strict et 5 tests réussis.
- `npm run format:check` : réussi.
- `npm run build` : export web réussi.
- `npm run build:mobile` : bundles JavaScript iOS et Android réussis ; aucun binaire signé compilé.
- OFA `doctor` : raccord local prêt ; hooks, commandes de build/check et CI portable installés.
- Contre-épreuve du détecteur dans un dossier temporaire : CSS neutre accepté, ajout d’un liseré coloré rejeté. Aucun ajout de baseline ni exclusion des sources.
- PRISMA : `pnpm build`, empreinte de `build/web` puis contrôle de `technical-review.json` ; statut technique `pass`, artistique `not-evaluated`. Décision du propriétaire `pending-human`.

Dans une session Chromium de test isolée, sans pilotage du Mac ni accès au navigateur personnel : accueil observé à 1440×1000, 390×844 et 320×568 ; survol, focus, sections défilées, conversation, carnet, pratique, progrès et réglages observés. Familles calculées contrôlées ; aucune police externe chargée.

Le scénario guidé de présentation a été terminé : 3 réponses, bilan enregistré, 3 expressions visibles dans le carnet. Après rechargement, la séance et la série de jours étaient toujours présentes. La connexion sans code personnel affiche une erreur explicite. Les tests HTTP couvrent l’authentification, l’origine web, l’absence de clé fournisseur, les entrées invalides et les échanges avec un fournisseur simulé.

Les captures sont conservées dans `evidence/`. Deux détails mineurs restent dans la revue : favicon web absent et accord de certaines unités au singulier.

La capture micro réelle, la qualité d’une voix japonaise, les réponses OpenAI en conditions réelles, les permissions et le rendu sur appareils natifs ne sont pas validés. Aucune clé personnelle n’était fournie. Les tests ne consomment pas de quota API. Aucun déploiement, signature, distribution ou publication de store effectué. Le dépôt local est initialisé sur `main` ; aucun dépôt distant n’est configuré, donc ni push, ni CI distante, ni protection de branche active ne sont revendiqués.

Le contrôle de dépendances conserve une alerte d’outillage Expo liée à `node-forge`, détaillée dans le README. La version corrigée de Zod est installée et imposée aux dépendances transitives.


## Correction de la voix

La version vocale est documentée dans `VOICE.md`. Le propriétaire a choisi la voix A après écoute. Les 25 enregistrements sont inclus dans les exports ; la phrase de présentation embarquée est identique octet pour octet à l’extrait approuvé. Neuf tests passent et le moteur local a répondu réellement via HTTP, sans OpenAI. La lecture web à vitesse normale et sa fin ont été observées. Les sources de dialogues sont inchangées. La recette sur appareils natifs et les conversations OpenAI restent à réaliser.

## Conversation orale automatique gratuite

Voir `ORAL.md` pour le protocole et ses limites, `editorial-before-after-oral.md` pour les textes avant/après. Treize tests, types, formatage et exports web/iOS/Android passent. La chaîne Whisper → Qwen3 14B → VOICEVOX a été exécutée pour deux tours réels sur des audios synthétiques. La recette navigateur vérifie l’envoi après silence, la lecture et la reprise du micro sans validation de texte. L’essai humain et les appareils mobiles physiques ne sont pas certifiés par ces contrôles.
