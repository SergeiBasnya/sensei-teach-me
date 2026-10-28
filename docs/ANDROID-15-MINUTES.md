# Ton essai Android de 15 minutes

Ajout du lot 2. **Résultat humain : en attente.** Aucun test automatique ne remplit ce résultat à ta place.

## Ouvrir Sensei

Ton téléphone et le Mac doivent être sur le même Wi-Fi. Ouvre **Expo Go**, puis Sensei dans les projets récents, ou scanne le QR fourni dans la conversation. Recharge le projet si tu vois l’ancienne version. Expo Go permet cet essai ; aucun nouvel APK n’est nécessaire. [Procédure Expo officielle](https://docs.expo.dev/get-started/start-developing/).

Le Mac doit rester allumé avec le serveur Sensei et Expo actifs. La connexion déjà enregistrée sur ton téléphone est réutilisée. Si Mochi n’est pas joignable, ouvre les réglages : l’adresse doit être celle du Mac sur le Wi-Fi, port **8787**, et non `localhost`. L’adresse est suggérée depuis Expo en LAN. Garde ton code personnel actuel ; ne l’ajoute jamais au compte rendu. Ferme puis rouvre les réglages si l’adresse Wi-Fi a changé.

Pour relancer côté Mac si nécessaire, dans le projet, deux terminaux :

```sh
npm run local:lan
npx expo start --lan --port 8083
```

Attends le chargement des moteurs. Pas de tunnel ni nouveau compte de service à configurer pour cet essai. Un réseau invité peut isoler les appareils ; dans ce cas, utilise ton Wi-Fi habituel. Les modifications du pare-feu ou du Mac restent à faire toi-même si ton réseau les impose.

## Avant de commencer — 1 minute

Dans les réglages de Sensei, descends à **Essai oral de 15 minutes**, puis touche **Démarrer les mesures**. Ferme les réglages. Le bilan reste en mémoire tant que l’application reste ouverte. Ne touche pas Recommencer les mesures pendant l’essai : cela efface le bilan précédent. Les erreurs et révisions enregistrées dans l’application restent conservées.

Utilise des informations fictives comme celles ci-dessous si tu préfères. Les mesures techniques n’enregistrent ni tes phrases ni ton audio. Les textes français sont toujours traités par le service Vivienne déjà choisi ; le japonais, Whisper et Qwen restent sur le Mac.

## Parcours — environ 15 minutes

| Temps | Ce que tu fais | Ce que tu observes |
|---|---|---|
| 0–3 min | Mon plan → **Dire d’où tu viens**. Laisse Mochi commencer, puis réponds `フランスです。` — **Furansu desu.** — « France. » Continue avec une ville fictive. | Le vocal démarre sans icône son. La réponse courte est acceptée. Mochi réagit à ce que tu viens de dire. |
| 3–5 min | Dis `Répète la question, s’il te plaît`, puis `Explique-moi kara`. | Elle répète la question, puis explique le mot ; elle ne répond pas à ta place lors de la simple répétition. |
| 5–7 min | Fais volontairement cette erreur : `私はフランスを来ました。` — **Watashi wa Furansu o kimashita.** Puis reprends son modèle. | Elle corrige la particule en **kara**, explique brièvement et te laisse réessayer. Note si elle reprend ensuite une conversation cohérente. |
| 7–9 min | Fais une autocorrection : `フランスを…いや、フランスから来ました。` — **Furansu o… iya, Furansu kara kimashita.** Essaie aussi `ええと…` — **Eeto…**, attends environ deux secondes, puis termine. | Elle accepte l’autocorrection finale. Note si le silence de deux secondes te coupe : le seuil du lot 1 reste à 1,8 s et doit être calibré avec ta voix. |
| 9–10 min | Mets la conversation en pause, attends, puis reprends. Tu peux aussi passer brièvement à une autre app et revenir. | Aucun son ni micro ne continue après la pause. La reprise ne relit pas inutilement une question déjà entendue. Un retour d’arrière-plan peut demander Reprendre. |
| 10–14 min | Termine la leçon, puis ouvre **Conversation libre** depuis la page correspondante de l’accueil. Parle de ce que tu aimes ou d’un voyage. Réponds par une phrase courte, demande `Ça veut dire quoi ?`, puis `Je ne sais pas` si tu bloques. À un moment, garde le silence environ 15 secondes. | Une vraie conversation se développe. L’aide donne un exemple adapté et compréhensible. Note les répétitions inutiles, les phrases trop complexes et l’aide après silence. |
| 14–15 min | Termine l’échange. Retourne dans les réglages → **Partager le bilan technique**. Envoie ou copie ce texte dans cette conversation, avec tes observations ci-dessous. | La feuille de partage Android doit s’ouvrir. Le texte ne doit contenir aucun audio, phrase personnelle, code ou adresse de serveur. |

Ces exemples servent à tester le système. Ne force pas une faute à chaque tour : l’essai doit aussi contenir plusieurs échanges ordinaires.

## Ce que tu me transmets

Copie ce petit compte rendu, puis ajoute le bilan technique :

```text
Téléphone / version Android :
Essai réellement effectué : oui / non ; durée approximative :
Conversation : agréable / correcte / pénible
Attente avant la réponse : courte / acceptable / trop longue
Hésitations coupées : jamais / parfois / souvent
Questions répétées inutilement : nombre approximatif + moment
Erreur volontaire : corrigée / ignorée / correction incorrecte
Autocorrection : acceptée / corrigée à tort
Aide française et rōmaji : clairs / problème à décrire
Pause puis reprise : fonctionne / problème à décrire
Lecture ou partage : incidents éventuels
Ce qui m’a appris quelque chose :
Ce qui m’a gêné et priorité suivante :
```

Tu peux donner un exemple fictif précis si nécessaire, sans partager d’information personnelle. Aucun enregistrement vocal n’est demandé.

## Comprendre le bilan

- `firstPlaybackAfterSendMs` : délai jusqu’au premier événement réel de lecture après l’envoi, sans le silence de fin de parole.
- `firstPlaybackAfterDetectedVoiceMs` : estimation incluant le silence détecté par le VAD. Ce n’est pas une détection certaine de la fin de ta phrase, ni une mesure de ce que ton oreille entend.
- `recognition_uncertain` / `recognition_empty` : enregistrements non évalués pédagogiquement ; ils ne doivent pas devenir des fautes mémorisées.
- `interruption_user` / `interruption_background` : arrêts et passages en arrière-plan. `playback_error` compte les vraies erreurs du lecteur ; `french_unavailable` distingue un repli de Vivienne.
- Jusqu’à 120 traces chiffrées sont conservées pendant cet essai. Les compteurs portent sur l’ensemble de l’essai. Le bilan est effacé si l’app se ferme complètement ; ta progression pédagogique reste séparée.

`humanValidation: pending` reste volontairement présent dans le JSON. Ton retour humain est nécessaire pour conclure. Le partage utilise la [feuille native React Native](https://reactnative.dev/docs/share) ; son ouverture ne prouve pas qu’un destinataire a reçu le bilan.
