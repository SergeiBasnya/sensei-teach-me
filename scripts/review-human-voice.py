"""Private operator-led reference review. No recording, playback, model or upload."""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shlex
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sensei_asr_comparison", ROOT / "scripts/compare-human-asr.py")
ASR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASR)


class ReviewError(ValueError):
    """Safe error codes; no personal text or path in noninteractive output."""


def draft_manifest(path: Path) -> dict:
    payload = ASR.read_json(path)
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or payload.get("captureType") != "human":
        raise ReviewError("invalid-human-manifest")
    cases = payload.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 200:
        raise ReviewError("require-1-to-200-recorded-cases")
    if not isinstance(payload.get("excludedCases", []), list):
        raise ReviewError("invalid-excluded-cases")
    seen = set()
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,60}", case["id"]) or case["id"] in seen:
            raise ReviewError("invalid-or-duplicate-case-id")
        seen.add(case["id"])
        if not isinstance(case.get("audio"), str) or not case["audio"]:
            raise ReviewError("missing-audio-path")
        ASR.inspect_pcm(ASR.private_path(path.parent / case["audio"]))
    return payload


def inventory(payload: dict | None) -> dict:
    cases = payload.get("cases", []) if payload else []
    validated = sum(case.get("humanValidated") is True for case in cases)
    return {
        "status": "operator-attested" if payload and payload.get("humanValidated") is True and payload.get("consentToLocalEvaluation") is True and cases and validated == len(cases) else "pending-human",
        "cases": len(cases), "validatedReferences": validated,
        "pendingReferences": len(cases) - validated,
        "excludedCases": len(payload.get("excludedCases", [])) if payload else 0,
        "modelLaunched": False, "audioPlayed": False,
    }


class Checkpoint:
    """Create a fresh private file; subsequent writes belong to this run only."""
    def __init__(self, source: Path, destination: Path):
        self.path = ASR.private_path(destination)
        if self.path == source.resolve() or self.path.exists():
            raise ReviewError("choose-a-new-private-output")
        self.previous_hash = None

    def __call__(self, payload: dict):
        content = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.previous_hash is None:
            descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as target:
                target.write(content)
        else:
            if not self.path.is_file() or hashlib.sha256(self.path.read_bytes()).hexdigest() != self.previous_hash:
                raise ReviewError("output-changed-during-review")
            descriptor, temp = tempfile.mkstemp(prefix=".review-", dir=self.path.parent)
            try:
                with os.fdopen(descriptor, "wb") as target:
                    target.write(content)
                os.replace(temp, self.path)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
        self.previous_hash = hashlib.sha256(content).hexdigest()


def optional_bool(value: str) -> bool | None:
    value = value.strip().casefold()
    if value in ("o", "oui", "y", "yes"):
        return True
    if value in ("n", "non", "no"):
        return False
    if value in ("", "?", "inconnu"):
        return None
    raise ReviewError("answer-yes-no-or-unknown")


def reviewed_case(case: dict, reference: str, kind: str, language: str,
                  tags: str, bounds: str, duration: float, cutoff: str) -> dict:
    if kind not in ("speech", "silence") or language not in ("ja", "fr", "mixed", "none"):
        raise ReviewError("invalid-kind-or-language")
    if not isinstance(reference, str) or len(reference) > 1500 or "\x00" in reference or (kind == "speech" and not reference.strip()) or (kind == "silence" and reference.strip()):
        raise ReviewError("invalid-verbatim-reference")
    if (kind == "silence") != (language == "none"):
        raise ReviewError("silence-language-mismatch")
    tag_values = [value.strip() for value in tags.split(",") if value.strip()]
    if len(tag_values) > 16 or any(not re.fullmatch(r"[A-Za-z0-9_-]+", value) for value in tag_values):
        raise ReviewError("use-anonymous-ascii-tags")
    speech_bounds = None
    if bounds.strip():
        try:
            values = [float(value.strip()) for value in bounds.split(",")]
        except ValueError as error:
            raise ReviewError("invalid-human-bounds") from error
        if len(values) != 2 or not all(math.isfinite(value) for value in values) or not 0 <= values[0] < values[1] <= duration:
            raise ReviewError("invalid-human-bounds")
        speech_bounds = {"startMs": values[0], "endMs": values[1]}
    return {
        **case, "reference": reference, "kind": kind, "language": language,
        "tags": list(dict.fromkeys(tag_values)), "speechBounds": speech_bounds,
        "humanValidated": True,
        "referenceReview": {"source": "operator-listened-to-recording", "cutoffObserved": optional_bool(cutoff)},
    }


def review_references(payload: dict, source: Path, ask, say, checkpoint, only_case=None) -> dict:
    result = copy.deepcopy(payload)
    result["humanValidated"] = False
    # A fresh private output may live in a different folder from the source.
    # Preserve the recorded file identity rather than changing relative paths.
    result["cases"] = [{**case, "audio": str(ASR.private_path(source.parent / case["audio"]))} for case in result["cases"]]
    changed = False
    for original in list(result["cases"]):
        if only_case and original["id"] != only_case:
            continue
        if original.get("humanValidated") is True and not only_case:
            continue
        say(f"\nExtrait {original['id']} — aucune hypothèse ASR n’est affichée.")
        audio = ASR.private_path(source.parent / original["audio"])
        diagnostics, _ = ASR.inspect_pcm(audio)
        say("À écouter toi-même sur le Mac, sans commande exécutée par cet outil :")
        say("open " + shlex.quote(str(audio)))
        action = ask("Entrée : écrire la référence ; p : passer ; x : exclure ; q : arrêter > ").strip().casefold()
        if action == "q":
            break
        if action == "p":
            continue
        if action == "x":
            if ask("Tape EXCLURE pour retirer cet extrait de la comparaison, sans supprimer le WAV > ") != "EXCLURE":
                continue
            result["cases"] = [case for case in result["cases"] if case["id"] != original["id"]]
            result.setdefault("excludedCases", []).append({**original, "excludedByOperator": True})
            checkpoint(result)
            changed = True
            continue
        if action:
            say("Action inconnue ; extrait laissé en attente.")
            continue
        reference = ask("Verbatim réellement entendu, sans réparer la grammaire (vide pour silence) > ")
        kind = ask("Type : speech ou silence [speech] > ").strip() or "speech"
        language = ask("Langue réellement parlée : ja / fr / mixed / none > ").strip()
        tags = ask("Tags anonymes séparés par virgules, facultatifs (ex. android,hesitation-2s) > ")
        bounds = ask("Début et fin humains en ms, facultatifs : début,fin ; vide = inconnus > ")
        cutoff = ask("Coupure réellement constatée pendant la prise ? o / n / ? [inconnu] > ")
        try:
            reviewed = reviewed_case(original, reference, kind, language, tags, bounds, diagnostics["durationMs"], cutoff)
        except ReviewError as error:
            say(f"Référence non sauvegardée : {error}.")
            continue
        say("Ta saisie, à comparer une dernière fois au son : " + reference)
        if ask("Tape JE CONFIRME après écoute pour valider cet extrait > ") != "JE CONFIRME":
            say("Extrait laissé en attente ; aucune référence validée ajoutée.")
            continue
        result["cases"] = [reviewed if case["id"] == original["id"] else case for case in result["cases"]]
        checkpoint(result)
        changed = True
    complete = bool(result["cases"]) and all(case.get("humanValidated") is True for case in result["cases"])
    if complete:
        say("Toutes les références incluses sont attestées par l’opérateur. Cela ne prouve pas la qualité de Whisper.")
        consent = ask("Autorises-tu leur comparaison uniquement locale ? o / n [non] > ")
        if optional_bool(consent) is True and ask("Tape VALIDER LE CORPUS pour attester l’ensemble des références > ") == "VALIDER LE CORPUS":
            result["consentToLocalEvaluation"] = True
            result["humanValidated"] = True
            checkpoint(result)
            changed = True
    if not changed:
        say("Aucune validation sauvegardée.")
    return result


ANNOTATION_QUESTIONS = {
    "intentError": "Le sens utile a-t-il changé (pays, quantité, négation, aide) ?",
    "normalizedSpokenError": "Une faute réellement prononcée a-t-elle été réparée par l’ASR ? ? si pas de faute pertinente.",
    "cutoffObserved": "Une coupure a-t-elle été réellement observée à la prise, au-delà du WAV seul ?",
    "unjustifiedRepeat": "Une répétition a-t-elle été demandée à tort malgré une parole utilisable ? ? sans observation suffisante.",
    "pedagogicalError": "La réaction pédagogique effectivement observée était-elle incorrecte ? ? si non testée.",
}


def review_observations(payload: dict, cases: list[dict], ask, say, checkpoint,
                        only_case=None, profile=None, repeat=0) -> dict:
    # A validated reference is required before hypotheses can become visible.
    ASR.validate_observations(payload, cases)
    result = copy.deepcopy(payload)
    by_id = {case["id"]: case for case in cases}
    for row in result["observations"]:
        if row.get("repeat", 0) != repeat or only_case and row["caseId"] != only_case or profile and row["profile"] != profile:
            continue
        say(f"\nExtrait {row['caseId']} — profil {row['profile']} — répétition {repeat}")
        action = ask("Entrée : annoter ; p : passer ; q : arrêter > ").strip().casefold()
        if action == "q":
            break
        if action:
            continue
        # The prompt is intentionally explicit; no annotation derives from CER.
        say("Référence humaine déjà validée : " + by_id[row["caseId"]]["reference"])
        say("Hypothèse ASR : " + row["transcript"])
        say("Texte retenu par le filtre : " + row["candidateText"])
        annotation = {"humanValidated": True}
        for field in ASR.HUMAN_ANNOTATION_FIELDS:
            annotation[field] = optional_bool(ask(ANNOTATION_QUESTIONS[field] + " o / n / ? [inconnu] > "))
        if ask("Tape JE CONFIRME pour sauvegarder ces observations humaines > ") == "JE CONFIRME":
            row["humanAnnotation"] = annotation
            checkpoint(result)
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / ".local/voice-lab/manifest-template.json")
    parser.add_argument("--review", action="store_true")
    parser.add_argument("--annotate-observations", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--case")
    parser.add_argument("--profile", choices=list(ASR.PROFILES))
    parser.add_argument("--repeat", type=int, default=0)
    args = parser.parse_args(argv)
    try:
        if args.review and args.annotate_observations or args.repeat < 0:
            raise ReviewError("choose-reference-review-or-observation-review")
        interactive = args.review or bool(args.annotate_observations)
        if interactive and (not sys.stdin.isatty() or not sys.stdout.isatty()):
            raise ReviewError("interactive-terminal-required-no-piped-validation")
        if not args.manifest.exists():
            if interactive:
                raise ReviewError("pending-recorded-corpus")
            print(json.dumps(inventory(None)))
            return 0
        payload = draft_manifest(args.manifest)
        if not interactive:
            print(json.dumps(inventory(payload)))
            return 0
        if args.output is None:
            raise ReviewError("new-private-output-required")
        if args.case and not any(case["id"] == args.case for case in payload["cases"]):
            raise ReviewError("unknown-case-id")
        source = args.annotate_observations or args.manifest
        checkpoint = Checkpoint(source, args.output)
        if args.review:
            result = review_references(payload, args.manifest, input, print, checkpoint, args.case)
            print(json.dumps(inventory(result)))
        else:
            cases = ASR.load_manifest(args.manifest)
            result = review_observations(ASR.read_json(args.annotate_observations), cases, input, print, checkpoint, args.case, args.profile, args.repeat)
            reviewed = sum(isinstance(row.get("humanAnnotation"), dict) and row["humanAnnotation"].get("humanValidated") is True for row in result["observations"])
            print(json.dumps({"status": "operator-attested" if reviewed else "pending-human", "observations": len(result["observations"]), "reviewedRows": reviewed, "modelLaunched": False, "audioPlayed": False}))
        return 0
    except (ReviewError, ASR.ComparisonError) as error:
        print(json.dumps({"status": "pending-human", "error": str(error), "modelLaunched": False, "audioPlayed": False}))
        return 2
    except (EOFError, KeyboardInterrupt):
        print(json.dumps({"status": "pending-human", "interrupted": True}))
        return 2
    except Exception as error:
        print(json.dumps({"status": "incomplete", "errorType": type(error).__name__}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
