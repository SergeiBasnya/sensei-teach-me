# Stabilisation linguistique — bilan court

29 octobre 2026, suite de `d6c6df9`. **GO pour un essai humain expérimental de 5 à 10 minutes ; NO-GO production.** Aucun nouveau modèle, abonnement, API payante, écran ou leçon. Le classique et le contrat `structured` restent les défauts du code.

## 1. Défauts corrigés, avant/après

| Cas                       | Avant observé                                                                            | Après observé                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demande pour Kyoto        | `何枚の切符をお持ちになりますか？` / « Combien de billets avez-vous ? »                  | `京都までですね。片道ですか、往復ですか？` / « Pour Kyoto, d’accord. Aller simple ou aller-retour ? » Puis une question simple sur les billets souhaités. |
| Aide négative commune     | `コーヒーが好きではありません。` / « Je ne t’aime pas le café. »                         | `コーヒーは好きじゃないです。` / « Je n’aime pas le café. »                                                                                               |
| Relance après une origine | `じゃあ、ベルギーはどんなところですか？` / « Alors, qu’est-ce que c’est, la Belgique ? » | `どこに住んでいますか？` / « Où habites-tu ? »                                                                                                            |

Le chemin hybride contrôle les présentations et choix de service sensibles, tandis que les autres échanges restent génératifs. Les quantités, destinations et prix cités restent liés à leur objet. Les commandes multiples/additives sortent du contrôleur à un produit, y compris au tour suivant.

`ホットで` et `アイスで` sont acceptés en contexte : plus de transformation abusive en « glace » ni d’explication inventée sur « karami ». L’identité de Mochi n’invente plus une origine humaine. La demande d’addition ne confirme plus l’ancienne boisson : `はい。少し待ってください。` / « Oui. Attends un instant, s’il te plaît. » Les salutations polies usuelles restent admises.

## 2. Protections et compromis

Les corrections enseignées exigent une transformation, une traduction et une explication rédigées couvertes. Le registre et les fragments naturels ne deviennent pas des fautes. La correction volontaire `を → から` reste identique dans les deux contrats.

**Compromis : certaines vraies erreurs hors couverture seront ignorées.** Une explication inconnue donne une abstention explicite, pas une règle affirmée. Les traductions générées hors catalogue restent à observer.

**Les nouvelles fautes vocales ne sont plus mémorisées automatiquement**, même sans avertissement ASR. Les corrections restent possibles dans la séance ; erreurs existantes et entrées écrites sont conservées. Le laboratoire n’écrit ni progression ni mémoire. Une mauvaise transcription peut encore perturber une réponse en séance.

## 3. Latence sur les mêmes entrées

Témoin frais `d6c6df9`, puis code corrigé : vingt mêmes textes/historiques par profil, **40/40 empreintes d’entrée identiques**, cache de synthèse désactivé et ordre alterné. Médianes depuis le texte déjà reconnu :

| Contrat          | Premier WAV avant → après | Fin de réponse avant → après | Tout le travail observé avant → après |
| ---------------- | ------------------------- | ---------------------------- | ------------------------------------- |
| Structuré        | 4,66 → **1,71 s**         | 4,98 → 2,01 s                | 4,98 → 2,01 s                         |
| Japonais d’abord | 3,74 → **1,75 s**         | 4,41 → 1,83 s                | 5,09 → 1,83 s                         |

Le gain vient surtout du travail évité : après correction, par profil, **14 réponses contrôlées, 2 génératives, 1 correction, 2 pratiques aidées et 1 répétition**, contre 17 génératives auparavant. Ce n’est pas une accélération générale du modèle. Sur les **deux entrées restant génératives**, JA donne 2,70 s contre 3,62 s en structuré ; l’échantillon est trop petit pour une généralisation statistique.

Les gains appariés médians avant/après sont 2,59 s et 1,91 s, distincts de la différence des médianes. Le WAV émis n’est pas le son entendu : capture, ASR, réseau et lecteur Android sont exclus. Le français ne bloque pas la fin du tour logiciel.

## 4. Qualification et limites connues

Même code : **40/40 replays appariés, 24/24 tours inédits, 32/32 tours historiques**, français présent 96/96, attente après fin idéale des WAV nulle. Les historiques des chaînes divergent réellement entre profils. La revue a retrouvé 94 tuteurs inchangés et relu les deux réponses d’addition corrigées. Les empreintes des sources correspondent aux trois qualifications ; pilotes et essai interrompu restent distincts.

La [revue linguistique explicite](STABILIZATION-LINGUISTIC-REVIEW.md) est une **revue d’agent, sans certification native ou humaine**. Restent un `なんですね` et un « hein » occasionnels, une préférence légèrement transformée en choix de commande et une aide d’addition répétitive. Les nouveaux cas restaurant concernent les boissons. Aucun ASR humain ni ressenti Android n’est inventé.

154 tests TypeScript, 143 tests Python, typage, formatage et exports web/Android/iOS passent. Les exports ne sont pas des APK/IPA. Contrôle des liserés et CI spécialisée conservés ; aucun nouveau pipeline général.

## 5. Essai Android simple

1. Mac et Android sur le même Wi-Fi. Ouvrir Sensei dans Expo Go. Serveur préparé avec `SENSEI_LAB_GENERATION=ja-first npm run local:lab` ; conserver les réglages et le code personnel existants.
2. **Réglages → Ouvrir le laboratoire vocal**, café ou gare, **Japonais et français**, puis **Démarrer l’essai** ou **Reprendre l’écoute**. Laisser **Garder mes extraits sur le Mac** désactivé ; activer réponse, reprise d’écoute et fin automatique.
3. Parler 5 à 10 minutes : réponse courte, changement de choix/quantité, autocorrection, aide française et hésitation de 1 à 3 secondes. Si la fin automatique coupe trop tôt, la désactiver et utiliser **Terminer ma phrase**.
4. Noter compréhension, fausses corrections, questions difficiles, attente et reprise du micro. À la fin : **Mettre en pause**, puis **Partager les mesures** si souhaité. Les mesures ne certifient pas la sensation sonore.
5. Revenir au classique à tout moment. Comparaison du laboratoire : redémarrer seulement le serveur avec `SENSEI_LAB_GENERATION=structured npm run local:lab`. Deux conversations improvisées ne sont pas un benchmark apparié.

Si Expo Go ne fournit pas la capture progressive sur ce téléphone, revenir au classique et relever le message. Aucun APK imposé ni audio privé conservé sans activation volontaire. [Procédure détaillée](STABILIZATION-VALIDATION-PLAN.md#essai-humain-android-de-5-à-10-minutes).

## 6. Décision et preuves

**GO expérimental, NO-GO production.** La prochaine étape est l’observation humaine, sans écriture pédagogique du laboratoire. Cela ne certifie ni le japonais ni la compréhension de la voix réelle.

[Correctifs et sources pédagogiques](STABILIZATION-SHARED-REVIEW.md), [consignes complètes avant/après](stabilization-prompts-before-after.md), [calculs](evidence/stabilization/summary.json), [témoin](evidence/stabilization/paired-before.json), [rejeu](evidence/stabilization/paired-after.json), [nouvelles chaînes](evidence/stabilization/new-chains-after.json), [chaînes historiques](evidence/stabilization/chains-after.json), [contrôle du rendu existant](stabilization-technical-review.json).
