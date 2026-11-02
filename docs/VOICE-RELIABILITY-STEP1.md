# Étape 1 — Fiabilité ciblée, 2 novembre 2026

Référence avant : `92f9c90`. Branche : `codex/voice-recovery-diagnostics`.
Périmètre : deux défauts reproduits, laboratoire uniquement. Aucun modèle,
abonnement, changement graphique ou nouvelle collecte de voix. Les étapes 2 et 3
ne sont pas commencées. La PR #1 reste en brouillon, sans fusion.

## A. Information inconnue : répondre sans inventer ni perdre la commande

**Avant observé.** Dans les quatre sorties publiques du pilote 01, la question
`ホットでお願いします。トイレはどこですか？` produit un lieu inventé. Le garde du
code de référence refuse ce lieu ; le worker renvoie une erreur sans tuteur.
Le rejeu 02 arrête ainsi les deux chaînes café au deuxième tour.

**Cause.** Le garde distingue l'information inventée, mais son échec rejoint le
traitement générique. Le repli atomique existant refuse à juste titre ce tour mixte.

**Correction.** Une exception spécifique `UnknownFacilityLocation` est levée
après les autres contrôles conversationnels. Un repli distinct accepte uniquement
une question simple sur le lieu des toilettes, éventuellement accompagnée d'un
seul choix de service atomique déjà pris en charge. Il confirme ce choix puis
reconnaît l'absence d'information, en japonais simple et avec un français rédigé.
Le tour complet reste dans l'historique temporaire du laboratoire.

| Cas | Avant complet | Après complet vérifié |
| --- | --- | --- |
| Question simple, lieu inconnu | Erreur, aucun tuteur | `すみません、トイレの場所はわかりません。` — « Désolée, je ne sais pas où sont les toilettes. » |
| Deux thés connus, choix chaud + question | Erreur, aucun tuteur | `ホットのお茶二つですね。トイレの場所はわかりません。` — « 2 thés chauds, d’accord. Je ne sais pas où sont les toilettes. » |
| Tour suivant : réduction à un thé | Non exécuté après l'arrêt de chaîne | `ホットのお茶一つですね。` — le thé et le chaud sont conservés |

**Protection du repli.** Il ne transforme pas en réponse réussie un JSON invalide, une mauvaise
quantité/boisson/température, un prix inventé, un rôle inversé, une contradiction
française détectée ou une panne du moteur/de romanisation. Le contrôle français
est aussi effectué pour le contrat structured avant ce repli. Une information
de lieu déjà fournie reste dans le chemin normal. Les quatre candidats exacts
du pilote 01 sont rejoués avec leurs historiques publics, sans nouvel appel Qwen.

**Limites.** Ce repli ne constitue pas un système général de compréhension des
informations inconnues. Les questions conditionnelles ou multiples, les commandes
complexes et les autres erreurs restent hors de ce repli et peuvent encore
échouer avec le traitement d'erreur existant. Les contrôles mécaniques ne détectent
pas toutes les erreurs linguistiques possibles. La reprise réelle du microphone
Android après cette réponse n'a pas été observée ; aucun GO humain n'en découle.

## B. Signal faible : autoriser un final prudent sans abaisser le seuil général

**Avant reproduit.** Un ton PCM à environ −55 dBFS, 1,6 seconde puis silence,
franchit le gate serveur de −60 dBFS mais reste sous le seuil client initial de
−48 dBFS. Deux partiels non marqués incertains, injectés à 1,7 et 2,7 secondes,
ne suffisent pas : zéro durée d'énergie forte, puis pause `quiet` à 20 secondes.
Ce ton et ces textes simulés ne sont pas une voix humaine reconnue.

**Correction.** Le seuil d'énergie forte et les marges de silence restent
inchangés. Une voie faible nécessite conjointement une énergie au-dessus de
−60 dBFS et d'une marge de 8 dB sur le plancher estimé, une durée minimale et
deux partiels identiques non marqués incertains sur des snapshots séparés par
au moins 500 ms de PCM. Du PCM supplémentaire doit ensuite être reçu. Un kanji
isolé/répété, une hésitation, un partiel incertain ou une phrase sur un bruit bref
ne suffit pas. Le contexte chaud/glacé reste limité à la question explicite.

La durée minimale est de 300 ms pour cette voie, avec la seule exception
`はい`/`いいえ` à 100 ms. Cette décision autorise uniquement la reconnaissance
finale ; elle ne valide ni le texte partiel, ni une correction pédagogique.
Le final conserve ses filtres d'incertitude. Le laboratoire ne modifie pas la
progression ou la mémoire d'erreurs.

| Simulation bornée | Avant | Après |
| --- | --- | --- |
| Signal faible + deux partiels concordants | Pas de final ; `quiet` à 20 s | Tentative finale à 4,8 s, soit 3,2 s après la dernière énergie faible |
| Réponse faible de 100 ms `はい`/`いいえ`, deux snapshots concordants | Pas de final | Tentative finale après la marge conservée de 3,2 s |
| Silence, bruit sans texte, kanji répété, partiel isolé/incertain, sous-gate | Pas de final | Pas de final |
| Bruit faible continu malgré des partiels injectés | Pas de final | Pas de fin prématurée dans les 20 s simulées |
| Hésitation, pause puis phrase complète | Pas de final faible | Attente pendant l'hésitation, puis marge de 3,2 s après la phrase |

**Limites.** La stabilité et les avertissements Whisper ne garantissent jamais
la fidélité. Une hallucination textuelle plausible après un bruit bref mais assez
long reste un risque, pas une faute élève attestée. Le bruit continu peut maintenir
l'écoute jusqu'à la limite existante du tour. Cette voie vise les tours n'ayant
pas atteint le minimum d'énergie forte ; le cas d'une voix forte puis très faible
reste à caractériser. La durée d'énergie affichée par les métriques existantes
compte toujours l'énergie forte, pas les phonèmes. Aucun profil ASR n'est choisi.

## Validation technique et décision

Les nouveaux tests reproduisent d'abord les échecs sur le code de référence :
trois échecs de fin de tour faible et deux absences de résultat tuteur. Après
correction, les cas ciblés et leurs contre-exemples passent. Le dispatch réel
Python est utilisé avec inférence simulée ; les quatre sorties Qwen existantes
sont rejouées telles quelles. Il n'y a pas de nouvelle mesure de génération.

Vérifications : suite Node complète 185/185, suite Python complète 184/184,
TypeScript, format, `git diff --check`, contrôle spécialisé studio et export Android.
La première exécution Node dans le bac à sable échouait sur `listen EPERM` ; la
suite complète autorisée à ouvrir ses sockets localhost passe sans changer les tests.
L'export Android vérifie la construction du bundle, pas son fonctionnement matériel.

**Décision : corrections ciblées techniquement vérifiées, pas de validation de
l'expérience humaine ni de gain de latence Android annoncé.** Aucun fichier audio
personnel ou référence humaine n'est créé. Les travaux locaux, la progression,
la mémoire, le classique et la politique hybride par défaut sont conservés.
L'identification de version avant le futur essai humain et les deux étapes suivantes
restent à traiter après ce bilan ; aucun essai téléphonique n'est demandé ici.
Le serveur de développement actif n'est pas relancé pendant ce lot : les contrôles
utilisent des workers et transports de test isolés, pas une validation du téléphone.
