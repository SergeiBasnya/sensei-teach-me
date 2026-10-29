# Textes du laboratoire vocal

28 octobre 2026. Les exercices, questions d’ouverture, explications, traductions, avatar et libellés du parcours classique ne sont pas réécrits. Les consignes du modèle en production restent inchangées : une option de diagnostic mesure la livraison progressive des mêmes tokens, sans en autoriser la lecture anticipée.

## Réglages

| Avant | Après, ajout complet |
|---|---|
| Aucun bloc de laboratoire. | Laboratoire vocal<br>Prototype séparé, sans modifier ta progression.<br>Ouvrir le laboratoire vocal |

Le bloc est inséré après les mesures du lot 2 et avant le crédit vocal. Le bloc du lot 2 et le formulaire de connexion conservent leur texte.

## Documentation principale

Avant : aucun paragraphe présentant le laboratoire.

Ajout complet, après le paragraphe du lot 2 :

> Le laboratoire vocal ajoute un prototype PCM/WebSocket séparé, activé côté Mac avec `npm run local:lab`. Le vocal classique reste le mode habituel. Les premières mesures synthétiques ne démontrent pas de gain médian de disponibilité audio ; la comparaison de reconnaissance humaine reste à effectuer avant tout remplacement.

Les liens sont ceux du README. Aucun ancien paragraphe remplacé.

## Écran expérimental

Écran entièrement nouveau, sans texte antérieur à comparer. Ses contrôles servent à la capture, aux profils auto/japonais, au choix du scénario existant, à la fin de tour expérimentale, à la pause/reprise, au partage volontaire de métriques et à l’option privée de conservation d’extraits. Les messages de partiel et de validation humaine ne sont pas des notes linguistiques. Les textes complets et leurs états sont dans `src/components/voice-lab.tsx`, les messages de capture dans `voice-lab-capture.tsx` et `voice-lab-capture.web.tsx`.

Les nouvelles documentations `VOICE-LAB.md`, `VOICE-LAB-RESULTS.md` et `VOICE-LAB-HUMAN-CORPUS.md` sont des ajouts. Les mesures et sorties du modèle publiées proviennent exclusivement des fichiers synthétiques identifiés ; aucune réponse personnelle n’est utilisée comme texte de référence.

## Ponctuation française affichée dans le laboratoire

Le rendu remplace seulement l’espace avant `?`, `!`, `:` et `;` par une espace insécable. Le texte conservé dans le modèle de réponse et le texte vocal ne sont pas réécrits. Exemple complet observé :

| Avant | Après |
|---|---|
| Tu viens de France, d’accord. De quelle ville viens-tu ? | Tu viens de France, d’accord. De quelle ville viens-tu ? |

Le dernier espace de la colonne Après est U+00A0 ; il garde `tu ?` sur la même ligne.
