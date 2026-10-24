#!/usr/bin/env python3
"""Run the design guard against Git's index or the exact refs being pushed.

No source file, Git index or ref is modified. A global dispatcher can pass a
policy with scopeRoots; a repository hook can use --always --no-chain.
"""

import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile


CONFIG = ".studio/design-guard.json"
COPY = ".studio/design_guard.py"
RECEIPT = ".studio/design-guard-install.json"
SUFFIXES = frozenset((".css", ".scss", ".sass", ".less", ".styl", ".html",
                     ".htm", ".astro", ".vue", ".svelte", ".js", ".jsx",
                     ".mjs", ".cjs", ".ts", ".tsx", ".mdx", ".py", ".php", ".erb"))
MAX_SOURCE_BYTES = 16 * 1024 * 1024
MAX_SNAPSHOT_BYTES = 128 * 1024 * 1024
# macOS (Command Line Tools or Apple launcher) and Linux system installations.
# Neither the environment PATH nor a repository can add an executable here.
SYSTEM_GIT_CANDIDATES = (
    Path("/Library/Developer/CommandLineTools/usr/bin/git"),
    Path("/usr/bin/git"),
    Path("/bin/git"),
)


class GuardError(Exception):
    pass


def git_executable():
    """Select a root-owned system Git, failing closed on mutable paths."""
    for candidate in SYSTEM_GIT_CANDIDATES:
        if not candidate.is_absolute():
            continue
        try:
            executable = candidate.resolve(strict=True)
            metadata = executable.stat()
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0
                    or metadata.st_mode & 0o022 or not os.access(executable, os.X_OK)):
                continue
            # Check both paths: a mutable symlink must not point to trusted Git.
            directories = set(candidate.parents) | set(executable.parents)
            for directory in directories:
                metadata = directory.stat()
                if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0
                        or metadata.st_mode & 0o022):
                    break
            else:
                return str(executable)
        except (OSError, RuntimeError):
            continue
    raise GuardError("Aucun exécutable Git système de confiance ; opération bloquée.")


def git(root, *args, data=None):
    result = subprocess.run([git_executable(), *args], cwd=root, input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # Do not echo command arguments: a push hook receives a remote URL.
        raise GuardError("Impossible de lire l’état Git requis pour le contrôle.")
    return result.stdout


def safe_path(raw):
    path = PurePosixPath(raw)
    if path.is_absolute() or not path.parts or ".." in path.parts or "\\" in raw:
        raise GuardError("Chemin Git non pris en charge par le contrôle.")
    return path


def matches(name, pattern):
    if pattern == ".":
        return True
    if not any(char in pattern for char in "*?["):
        return name == pattern or name.startswith(pattern + "/")
    patterns = [pattern]
    while patterns[-1].startswith("**/"):
        patterns.append(patterns[-1][3:])
    return any(fnmatch.fnmatchcase(name, item) or PurePosixPath(name).match(item) for item in patterns)


def link_is_in_scope(name, config):
    # The index stores only the link target, never its descendants. No finite
    # list of invented filenames can prove a directory contains no source that
    # matches an include glob. Fail closed unless the whole linked path/tree
    # has an explicit exclusion; an extension filter such as *.css is not one.
    for pattern in config["excludes"]:
        if not any(char in pattern for char in "*?[") and matches(name, pattern):
            return False
        if pattern.endswith("/**") and matches(name, pattern[:-3]):
            return False
    return True


def entries(root, revision):
    result = []
    if revision is None:
        records = git(root, "ls-files", "--stage", "-z").split(b"\0")
        for record in records:
            if not record:
                continue
            meta, raw = record.split(b"\t", 1)
            mode, oid, stage = meta.decode("ascii").split()
            if stage != "0":
                raise GuardError("Index non résolu : terminer les conflits avant le contrôle.")
            result.append((mode, oid, os.fsdecode(raw)))
    else:
        records = git(root, "ls-tree", "-r", "-z", revision).split(b"\0")
        for record in records:
            if not record:
                continue
            meta, raw = record.split(b"\t", 1)
            mode, _kind, oid = meta.decode("ascii").split()
            result.append((mode, oid, os.fsdecode(raw)))
    return result


def blobs(root, object_ids):
    unique = list(dict.fromkeys(object_ids))
    if not unique:
        return {}
    output = git(root, "cat-file", "--batch", data=("\n".join(unique) + "\n").encode())
    result, offset, total = {}, 0, 0
    for oid in unique:
        end = output.find(b"\n", offset)
        header = output[offset:end].decode("ascii").split()
        if len(header) != 3 or header[1] != "blob":
            raise GuardError("Objet source Git absent ou non lisible.")
        size = int(header[2])
        total += size
        if size > MAX_SOURCE_BYTES or total > MAX_SNAPSHOT_BYTES:
            raise GuardError("Snapshot source trop volumineux : contrôle à configurer explicitement.")
        start = end + 1
        result[oid] = output[start:start + size]
        if len(result[oid]) != size:
            raise GuardError("Snapshot Git incomplet.")
        offset = start + size + 1
    return result


def snapshot_check(root, revision, detector):
    listed = entries(root, revision)
    lookup = {name: (mode, oid) for mode, oid, name in listed}
    if any(name not in lookup or lookup[name][0] not in ("100644", "100755")
           for name in (CONFIG, COPY, RECEIPT)):
        raise GuardError("Contrôle absent du snapshot Git. Installer puis indexer .studio/ avant commit ou push.")
    metadata = blobs(root, [lookup[name][1] for name in (CONFIG, RECEIPT)])
    config = json.loads(metadata[lookup[CONFIG][1]])
    if (not isinstance(config, dict) or any(not isinstance(config.get(key), list)
            or any(not isinstance(item, str) for item in config[key]) for key in ("includes", "excludes"))):
        raise GuardError("Portée de configuration indexée invalide.")
    selected = []
    for mode, oid, name in listed:
        path = safe_path(name)
        if mode in ("120000", "160000") and link_is_in_scope(name, config):
            raise GuardError("Lien ou sous-module source non contrôlé dans l’index : " + name)
        if name in (CONFIG, COPY, RECEIPT) or path.suffix.lower() in SUFFIXES:
            if mode not in ("100644", "100755"):
                raise GuardError("Source indexée non régulière : " + name)
            selected.append((oid, name))
    by_name = {name: oid for oid, name in selected}
    if any(name not in by_name for name in (CONFIG, COPY, RECEIPT)):
        raise GuardError("Contrôle absent du snapshot Git. Installer puis indexer .studio/ avant commit ou push.")
    contents = blobs(root, [oid for oid, _ in selected])
    if hashlib.sha256(contents[by_name[COPY]]).digest() != hashlib.sha256(detector.read_bytes()).digest():
        raise GuardError("Copie du détecteur différente de la version installée. Réinstaller puis indexer .studio/design_guard.py.")
    receipt = json.loads(contents[by_name[RECEIPT]])
    if (not isinstance(receipt, dict) or not isinstance(receipt.get("managedFiles"), dict)
            or receipt.get("schemaVersion") != "studio-design-guard-install.v1"
            or receipt.get("managedFiles", {}).get(CONFIG) != hashlib.sha256(contents[by_name[CONFIG]]).hexdigest()):
        raise GuardError("Configuration différente du reçu d’installation indexé : inspection puis réinstallation requises.")
    with tempfile.TemporaryDirectory(prefix="studio-design-index-") as directory:
        snapshot = Path(directory)
        for oid, name in selected:
            target = snapshot / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(contents[oid])
        try:
            result = subprocess.run([sys.executable, str(detector), "--root", str(snapshot), "--json"],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    timeout=120)
        except subprocess.TimeoutExpired as error:
            raise GuardError("Contrôle interrompu par sa limite de temps ; opération bloquée.") from error
        if result.stdout:
            sys.stdout.buffer.write(result.stdout)
        if result.stderr:
            sys.stderr.buffer.write(result.stderr)
        return result.returncode


def push_revisions(root, payload):
    revisions = []
    for line in payload.decode("utf-8", "strict").splitlines():
        fields = line.split()
        if len(fields) != 4 or not re.fullmatch(r"[a-fA-F0-9]{40}|[a-fA-F0-9]{64}", fields[1]):
            raise GuardError("Entrée pre-push invalide ; aucune référence supposée saine.")
        oid = fields[1]
        if set(oid) == {"0"}:
            continue  # Deleting a remote ref does not deliver a source tree.
        commit = git(root, "rev-parse", "--verify", oid + "^{commit}").decode().strip()
        if commit not in revisions:
            revisions.append(commit)
    return revisions


def in_scope(root, policy, always):
    if always or (root / CONFIG).exists():
        return True
    if not policy:
        return False
    document = json.loads(policy.read_text(encoding="utf-8"))
    if document.get("schemaVersion") != "studio-git-guard-policy.v1":
        raise GuardError("Version de politique Git inconnue.")
    scopes = document.get("scopeRoots")
    if not isinstance(scopes, list) or not scopes:
        raise GuardError("Périmètre de politique Git absent.")
    common = Path(os.fsdecode(git(root, "rev-parse", "--git-common-dir")).strip())
    if not common.is_absolute():
        common = root / common
    for item in scopes:
        path = Path(item)
        if not path.is_absolute():
            raise GuardError("Racine absolue requise dans la politique Git.")
        if root.is_relative_to(path.resolve()) or common.resolve().is_relative_to(path.resolve()):
            return True
    return False


def chain_original(root, hook, hook_args, payload):
    common = Path(os.fsdecode(git(root, "rev-parse", "--git-common-dir")).strip())
    if not common.is_absolute():
        common = root / common
    previous = subprocess.run([git_executable(), "config", "--local", "--get", "studio.previousHooksPath"],
                              cwd=root, capture_output=True, text=True)
    if previous.returncode not in (0, 1):
        raise GuardError("Ancien raccord de hooks illisible.")
    directory = Path(previous.stdout.strip()).expanduser() if previous.stdout.strip() else common.resolve() / "hooks"
    if not directory.is_absolute():
        directory = root / directory
    original = directory / hook
    if original.is_file() and os.access(original, os.X_OK):
        # Global hooksPath hides default repository hooks. Preserve their effect.
        return subprocess.run([str(original), *hook_args], cwd=root, input=payload).returncode
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hook", choices=("pre-commit", "pre-merge-commit", "pre-applypatch", "pre-push"))
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--always", action="store_true")
    parser.add_argument("--no-chain", action="store_true")
    parser.add_argument("--hook-arg", action="append", default=[])
    args = parser.parse_args(argv)
    payload = sys.stdin.buffer.read() if args.hook == "pre-push" else b""
    try:
        bare = git(args.root, "rev-parse", "--is-bare-repository").strip() == b"true"
        option = "--absolute-git-dir" if bare else "--show-toplevel"
        root = Path(os.fsdecode(git(args.root, "rev-parse", option)).strip()).resolve()
        if args.policy and not args.policy.is_file():
            raise GuardError("Politique globale de contrôle absente ; opération bloquée.")
        if in_scope(root, args.policy, args.always):
            detector = Path(__file__).resolve().with_name("design_guard.py")
            if not detector.is_file():
                raise GuardError("Détecteur installé absent ; opération bloquée.")
            revisions = push_revisions(root, payload) if args.hook == "pre-push" else [None]
            for revision in revisions:
                status = snapshot_check(root, revision, detector)
                if status:
                    print("Studio : liseré interdit ou contrôle invalide, opération Git bloquée.", file=sys.stderr)
                    return status
        return 0 if args.no_chain else chain_original(root, args.hook, args.hook_arg, payload)
    except (GuardError, OSError, ValueError, UnicodeError, subprocess.SubprocessError) as error:
        print("Studio : " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
