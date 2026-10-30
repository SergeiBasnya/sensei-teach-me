# Diagnostic de la capture Android — 30 octobre 2026

Périmètre : capture du laboratoire, conversion PCM et fin de tour. Base inspectée
`ce89fce`, après le retour humain négatif sur `50dff54`. Le vocal classique et la
mémoire pédagogique ne sont pas modifiés. Aucun micro réel, extrait humain, modèle
ou service n'a été utilisé dans ces vérifications.

## Faits établis dans les sources installées

Versions réellement lues : Expo `58.0.19`, expo-audio `58.0.10`. Les sources
primaires ci-dessous sont celles du paquet installé, sans supposer que leur code
est identique au binaire Expo Go présent sur le téléphone.

| Frontière | Source primaire installée | Constat |
| --- | --- | --- |
| Hook | `node_modules/expo-audio/src/AudioStream.ts:22-61` | Options explicites `16000`, mono, `int16`. Le listener appelle la dernière fonction `onBuffer`. |
| Format | `node_modules/expo-audio/src/AudioStream.types.ts:33-50` | PCM signé 16 bits little-endian ; canaux entrelacés ; fréquence et canaux effectivement délivrés dans chaque événement. |
| Configuration Android | `node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioStream.kt:156-218` | `ENCODING_PCM_16BIT`, source `MIC`. Repli de fréquence possible : 48000, 44100, 16000, 22050, 8000 Hz. Ce chemin ne garantit pas d'annulation d'écho ou de contrôle de gain. |
| Taille exacte | Même source `:35-38`, `:242-264` | Lecture bloquante visée à 100 ms ; le buffer émis est limité à `bytesRead`, sans copier le reste de la capacité. Aucun défaut d'octets de remplissage démontré ici. |
| Horloge | Même source `:276-289` | `timestamp` est le temps monotone depuis le début, calculé après la lecture. Ce n'est ni un compteur exact d'échantillons ni la fin sémantique d'une phrase. L'émission passe par la file principale native. |
| Démarrage/arrêt | Même source `:64-101` et `AudioModule.kt:860-867` | `start()` asynchrone côté JS ; `stop()` synchrone et sans événement d'acquittement garantissant le drainage de tous les buffers. |
| Rejeu des effets | `node_modules/expo-modules-core/src/hooks/useReleasingSharedObjectWithLifecycle.ts:139-167`, `:189-211` | Un objet partagé peut survivre au nettoyage/rejeu des effets. Un booléen réactivé ne distingue pas deux opérations asynchrones de démarrage. |

## Défauts reproduits et changements limités

Les courses ont d'abord été reproduites après extraction du code de démarrage à
comportement identique dans un module pur. Les tests utilisaient des promesses
contrôlées, sans API Android simulant une quelconque qualité de microphone.

| Cas synthétique | Avant | Après |
| --- | --- | --- |
| Permission ancienne résolue après nettoyage puis reprise | Deux appels `start` et deux `onReady` pour un seul cycle encore actif | Un seul démarrage ; l'ancien cycle ne confirme rien. |
| Ancien `start()` terminé après une reprise | Deux confirmations ; l'ancienne continuation peut être attribuée au nouveau cycle | Démarrages sérialisés, ancienne source arrêtée avant le nouveau départ ; une seule confirmation. |
| Partiel incertain puis même texte une seule fois fiable | Comptés comme deux confirmations ; fin possible après 1,8 s | Deux partiels **consécutifs non incertains** exigés ; sinon 3,2 s. |
| 100 ms d'énergie, deux partiels fiables « はい。 » | Aucun envoi automatique ; pause silencieuse à 20 s | Exception limitée à `はい` / `いいえ`, énergie ≥100 ms et PCM supplémentaire ; attente de 3,2 s. |
| « ホットで » / « アイスで » après la question explicite chaud/glacé | Toujours considéré comme particule inachevée, attente de 5 s | Si énergie ≥180 ms et partiels stables : 3,2 s. Sans ce contexte, les 5 s restent appliquées. |

La règle globale d'énergie ≥180 ms et la marge minimale de 1,8 s sont conservées.
Un bruit de 100 ms sans texte fiable, un seul partiel, un texte court arbitraire ou
une hésitation ne deviennent pas un tour valide. Les hésitations et les autres
particules finales gardent 5 s. Les choix chauds/glacés reconnus sont volontairement
limités aux questions explicites contenant les deux options, dont la forme déjà
utilisée `ホットですか、アイスですか？`. Ce mécanisme décide seulement quand tenter
la reconnaissance finale ; il ne corrige ni ne mémorise une compétence.

Fichiers concernés :

- `src/components/voice-lab-capture.tsx` : branchement du propriétaire de cycle.
- `src/lib/voice-lab-capture.ts` : isolation des démarrages asynchrones ; nettoyage
  idempotent ; vérification de l'état actif après la préparation audio.
- `src/lib/voice-lab-pcm.ts` : stabilité fiable, exceptions limitées et diagnostic
  statique de la décision de fin de tour. Algorithme de conversion PCM inchangé.
- `tests/voice-lab-capture.test.ts` : courses, intégrité PCM et cas de fin de tour.

## Preuves sur les octets et le signal

`node --import tsx --test tests/voice-lab-capture.test.ts tests/voice-lab-client.test.ts`
réussit : **29 tests, 29 réussites**. `npx tsc --noEmit` réussit également.

- À 16 kHz mono : 16037 échantillons signés variés, valeurs extrêmes au premier
  et dernier échantillon, frontières irrégulières de 997 échantillons. Tous les
  octets sont conservés ; queue finale de 37 échantillons envoyée par `flush`.
- Aux cinq fréquences de repli Android : une seconde de ton synthétique à 1 kHz
  produit exactement 16000 échantillons, avec fréquence conservée et gain RMS
  entre 0,95 et 1,01. Le repli 8 kHz n'invente pas les fréquences absentes.
- Les tests existants conservent la phase à travers les buffers de 44,1 kHz,
  vérifient le mélange stéréo, les bornes et l'en-tête little-endian du paquet.
- Un buffer reçu avant la résolution de `start()` est accepté quand le démarrage
  natif est engagé ; il n'est pas écarté pour la seule attente de sa promesse.
  Après nettoyage, les callbacks de cette capture sont ignorés.

Ces signaux prouvent les propriétés testées de conversion et de cycle de vie.
Ils ne prouvent pas l'intelligibilité d'une voix, la qualité du filtre sur toutes
les fréquences, la précision Whisper ni la conformité du matériel du téléphone.

## Limite début/fin de capture à conserver dans le diagnostic global

Le hook installe son listener avant le démarrage demandé par le composant. La
conversion ne supprime aucun début de buffer reçu. Cela ne prouve pas que l'OS
livre le début réel de chaque parole sans retard ou perturbation.

À l'arrêt, le code natif peut encore terminer une lecture et planifier son
événement. Il n'offre pas de `stopAndDrain()` : la marge de 150 ms du contrôleur
de laboratoire est une précaution, pas une preuve de drainage. La conversion
`flush()` conserve uniquement la queue **déjà reçue**. Une reprise vocale dans un
bloc natif encore non livré peut donc rester inconnue lors de la décision de fin.
Ce contrôleur appartient au lot d'intégration, sans modification ici. Les pauses
doivent toujours abandonner l'ancien audio ; un arrêt manuel est une action
explicite, distincte de l'arrêt automatique.

Le timestamp natif et le nombre d'échantillons peuvent aider à repérer un retard
ou une discontinuité. Ils ne permettent pas de reconstruire des échantillons
jamais délivrés. Un format correct n'écarte pas un niveau faible, de l'écrêtage,
du bruit, une route Bluetooth différente ou des pertes matérielles.

## Contrat pour l'intégration

```ts
const endpoint = new VoiceLabEndpoint(startedAt, {
  question: currentJapaneseQuestion,
});
endpoint.voicedDurationMs; // Durée de blocs classés énergétiques, pas de phonèmes.
endpoint.requiredSilenceMs; // 1800, 3200 ou 5000.
endpoint.decisionReason; // Enum statique, aucun texte personnel.
```

`decisionReason` : `insufficient_voice`, `short_answer`, `contextual_choice`,
`unfinished`, `stable_partial`, `unstable_partial`. En cas d'énergie insuffisante,
`requiredSilenceMs` vaut 3200 pour la politique de repli mais ne rend pas le tour
éligible ; `canFinish()` reste faux et l'absence de tour est bornée à 20 s.
L'option `question` est facultative pour préserver les appelants existants ; seul
un booléen de contexte est conservé par cette politique, sans exporter la phrase.

## Hypothèses encore ouvertes et essai physique requis

La mauvaise reconnaissance rapportée reste **non expliquée dans son ensemble**.
Les courses et les réponses très courtes sont des causes possibles, sans preuve
qu'elles se soient produites pendant le test humain. Whisper, ses profils et
l'interprétation du professeur sont examinés séparément.

Un nouvel essai court devra vérifier, avant toute promotion du laboratoire :

1. Une réponse brève « はい » / « いいえ », puis une phrase entière, pour comparer
   le début et la fin réellement prononcés à la transcription finale.
2. Un choix « ホットで » après la question chaud/glacé ; une hésitation puis une
   autocorrection, pour vérifier que les marges protègent l'expression complète.
3. Une phrase française d'aide, puis du japonais, pour distinguer capture,
   langue reconnue et interprétation pédagogique.
4. Pause/reprise et retour depuis l'arrière-plan, sans ancien audio réinjecté.

Le diagnostic peut rester en RAM. La sauvegarde privée existante demeure
facultative et réservée au consentement explicite ; aucun extrait, transcription,
identifiant d'échantillon, code personnel ou contenu de conversation n'est ajouté
à Git. Les métriques ne constituent pas une validation humaine. **Android réel
reste en attente ; pas de GO comme mode principal sur ces seules preuves.**
