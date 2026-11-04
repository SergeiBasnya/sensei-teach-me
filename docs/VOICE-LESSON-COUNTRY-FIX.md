# Leçon — réponse courte au pays

4 novembre 2026, référence `c0ae893`. Correctif ciblé sur la branche existante,
PR #1 en brouillon, sans fusion ni changement du mode par défaut.

Le retour humain indique un échec dans la leçon, après la question du pays.
Le journal montre un rejet de réponse trop honorifique, alors que les moteurs
et les voix répondent. La phrase personnelle n’a pas été conservée ni inventée.

## Reproduction indépendante

Avec la fixture fictive `フランス` (« France »), après `どこから来ましたか？`,
le serveur retient déjà le pays. Mais le contrôleur exigeait encore `です` pour
réaliser sa réponse. Qwen était donc sollicité inutilement et pouvait redemander
le pays ou produire un registre trop soutenu. Les garde-fous rejetaient ces
réponses et l’API renvoyait le message générique relatif aux moteurs.

Sur la vraie route `/api/oral-turn`, un WAV VOICEVOX synthétique est transcrit
`フランス` avant et après :

| Version | Résultat |
| --- | --- |
| Avant | HTTP 502, aucune réponse utilisable. |
| Après | HTTP 200, `どこに住んでいますか？` / « Où habites-tu ? », WAV japonais valide, aucune correction. |
| Tour suivant réel du test | `パリ` → `日本語は好きですか？`, sans redemander le pays ou le domicile. |

## Correction et limites

Dans le scénario de présentation, un lieu du catalogue existant peut répondre
seul, ou avec `です`, à une question de lieu précisément reconnue. Le contrôleur
réutilise alors sa réponse simple existante. Cette formulation connue n’entraîne
plus une génération de contrôle grammatical : le fragment naturel n’est pas une
faute. La ville suit le même chemin lorsqu’elle répond à une question de ville
ou de domicile.

Les mots inconnus, négations, questions de l’élève, débuts de phrase (`フランスから`),
mauvaises particules et tours supplémentaires gardent les contrôles habituels.
Un nom de pays ne répond pas automatiquement à une question sur la date, le prénom
ou la ville. Les autres scénarios gardent leur politique ; les modèles, paramètres
ASR, progression et mémoire ne sont pas modifiés. Le registre trop soutenu reste
rejeté : aucun garde-fou n’est désactivé et aucun réessai génératif n’est ajouté.

## Vérification

191 tests Node, 197 tests Python, types, format et contrôle spécialisé studio
réussis. Régression classique et laboratoire hybride, tours pays puis ville,
contre-tests de questions/négations/particules et mots hors catalogue.
La [preuve synthétique avant/après](evidence/voice-naturality/country-fragment.json)
conserve la sortie effective des deux routes testées, sans audio personnel.
Les durées isolées ne constituent pas un benchmark : états à froid et synthèse
française différents. Aucun gain de lecture Android ou de reconnaissance humaine
n’est affirmé. L’expérience réelle sur téléphone reste distincte de ce test.

Le serveur du projet doit charger le commit qualifié après publication ; son
identifiant public permet de vérifier le code effectivement chargé. Le lot JS
`2026-11-02.dialogue-3` reste inchangé, puisque cette correction est côté serveur.
