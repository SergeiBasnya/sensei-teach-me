#!/usr/bin/env python3
"""Prepare/stage/publish only studio CI files; CI reads candidate data, never runs it."""
from __future__ import annotations
import argparse
import base64
import fnmatch
import grp
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import quote
from typing import Literal, overload

VERSION = "1.0.4"
DETECTOR_SHA256 = "fd9946767f2a5788219be82837270a9fe1a51f0e9b7eab21adc45e169effe4f0"
CHECKOUT_SHA = "11d5960a326750d5838078e36cf38b85af677262"  # checkout v4.4.0
CONTEXT = "studio-design-guard"
WORKFLOW = ".github/workflows/studio-design-guard.yml"
RUNNER = ".studio/design_guard_ci.py"
CONFIG = ".studio/design-guard.json"
DETECTOR = ".studio/design_guard.py"
RECEIPT = ".studio/design-guard-install.json"
PUBLISH_FILES = frozenset({WORKFLOW, RUNNER, CONFIG, DETECTOR, RECEIPT})
MANAGED_CONTROL_FILES = PUBLISH_FILES | frozenset({
    ".studio/studio_git_guard.py", ".studio/check.sh", ".studio/.gitignore",
})
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_EXPANDED = 1024 * 1024 * 1024
# Fixed installation locations only: neither PATH nor a repository adds candidates.
EXECUTABLE_CANDIDATES = {
    "git": (Path("/Library/Developer/CommandLineTools/usr/bin/git"),
            Path("/usr/bin/git"), Path("/bin/git"), Path("/usr/local/bin/git")),
    "gh": (Path("/usr/bin/gh"), Path("/bin/gh"), Path("/usr/local/bin/gh"),
           Path("/opt/homebrew/bin/gh")),
}

class PublicationError(ValueError):
    pass

def trusted_executable(name: str) -> str:
    """Resolve a trusted installation, independently of PATH and the audited tree.

    System tools require root ownership and no group/other write permissions.
    On macOS only, gh may come from the invoking user's standard Homebrew
    Cellar. Its owner and macOS administrators are trusted installers; this
    does not isolate the tool from its own owner or from administrators.
    """
    for candidate in EXECUTABLE_CANDIDATES.get(name, ()):
        if not candidate.is_absolute():
            continue
        try:
            executable = candidate.resolve(strict=True)
            owners = {0}
            brew_root = None
            admin_gid = None
            if name == "gh" and sys.platform == "darwin":
                for prefix in (Path("/opt/homebrew"), Path("/usr/local")):
                    if (candidate == prefix / "bin/gh"
                            and executable.is_relative_to(prefix / "Cellar/gh")
                            and executable.parent.name == "bin" and executable.name == "gh"):
                        brew_root = prefix
                        owners.add(os.geteuid())
                        try:
                            admin_gid = grp.getgrnam("admin").gr_gid
                        except KeyError:
                            pass
            metadata = executable.stat()
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid not in owners
                    or metadata.st_mode & 0o022 or not os.access(executable, os.X_OK)):
                continue
            for directory in set(candidate.parents) | set(executable.parents):
                metadata = directory.stat()
                admin_writable_brew = (brew_root is not None
                    and directory.is_relative_to(brew_root) and admin_gid is not None
                    and metadata.st_gid == admin_gid)
                if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid not in owners
                        or metadata.st_mode & 0o002
                        or (metadata.st_mode & 0o020 and not admin_writable_brew)):
                    break
            else:
                return str(executable)
        except (OSError, RuntimeError):
            continue
    raise PublicationError(f"No trusted {name} executable; operation blocked.")

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()

def valid_repo(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", value):
        raise PublicationError("Repository must be owner/name, without credentials or URL.")
    return value

def valid_sha(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise PublicationError("An immutable 40-character lowercase Git SHA is required.")
    return value

def load_json(path):
    try:
        value = json.loads(Path(path).read_text())
    except (OSError, ValueError) as exc:
        raise PublicationError("Invalid or unreadable JSON input.") from exc
    if not isinstance(value, dict):
        raise PublicationError("JSON object required.")
    return value

class GhAPI:
    """Credentials are inherited by gh; no token or raw error output is printed."""
    @overload
    def request(self, method: str, endpoint: str, payload=None, binary: Literal[False] = False) -> dict: ...

    @overload
    def request(self, method: str, endpoint: str, payload=None, *, binary: Literal[True]) -> bytes: ...

    @overload
    def request(self, method: str, endpoint: str, payload=None, binary: bool = False) -> dict | bytes: ...

    def request(self, method: str, endpoint: str, payload=None, binary: bool = False) -> dict | bytes:
        if not endpoint.startswith("repos/") or ":" in endpoint or ".." in endpoint.split("/"):
            raise PublicationError("Unsupported API endpoint.")
        args = [trusted_executable("gh"), "api", "--hostname", "github.com", "--method", method,
                "-H", "Accept: application/vnd.github+json", endpoint]
        temporary = None
        try:
            if payload is not None:
                with tempfile.NamedTemporaryFile("wb", delete=False) as handle:
                    temporary = handle.name
                    handle.write(json_bytes(payload))
                args += ["--input", temporary]
            result = subprocess.run(args, capture_output=True)
            if result.returncode:
                raise PublicationError(f"GitHub API {method} failed for {endpoint} (exit {result.returncode}).")
            if binary:
                return result.stdout
            value = json.loads(result.stdout or b"{}")
            if not isinstance(value, dict):
                raise PublicationError("GitHub API JSON object required.")
            return value
        except (OSError, ValueError) as exc:
            if isinstance(exc, PublicationError):
                raise
            raise PublicationError(f"GitHub API {method} transport/JSON error.") from exc
        finally:
            if temporary:
                Path(temporary).unlink(missing_ok=True)

def git(root, *args):
    result = subprocess.run([trusted_executable("git"), "--no-replace-objects", "-C", str(root), *args], capture_output=True)
    if result.returncode:
        raise PublicationError("Git snapshot inspection failed.")
    return result.stdout

def detector_module(path):
    path = Path(path).resolve()
    if sha256(path.read_bytes()) != DETECTOR_SHA256:
        raise PublicationError("Canonical detector fingerprint mismatch.")
    spec = importlib.util.spec_from_file_location("studio_frozen_detector", path)
    if spec is None or spec.loader is None:
        raise PublicationError("Canonical detector loader unavailable.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def ci_workflow_bytes():
    return f'''# Managed by OFA studio design guard CI v1
name: Studio design guard
on:
  pull_request_target:
    types: [opened, reopened, synchronize, ready_for_review, edited]
  push:
  merge_group:
    types: [checks_requested]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: studio-design-${{{{ github.event_name }}}}-${{{{ github.event.pull_request.number || github.ref }}}}
  cancel-in-progress: true
jobs:
  analyze-studio-design:
    name: Analyze studio design sources
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      statuses: write
    steps:
      - name: Resolve immutable trusted revision
        id: trusted
        env:
          GH_TOKEN: ${{{{ github.token }}}}
          STUDIO_BOOTSTRAP: ${{{{ vars.STUDIO_DESIGN_GUARD_BOOTSTRAP }}}}
        run: |
          python3 -I - <<'PY'
          import json, os, re, stat, subprocess
          from pathlib import Path
          from urllib.parse import quote
          # This bootstrap runs on Ubuntu before any repository is checked out.
          # Root-owned system installations only, never PATH or candidate code.
          def trusted_gh_executable():
              for candidate in (Path('/usr/bin/gh'), Path('/bin/gh'), Path('/usr/local/bin/gh')):
                  try:
                      executable = candidate.resolve(strict=True)
                      metadata = executable.stat()
                      if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0
                          or metadata.st_mode & 0o022 or not os.access(executable, os.X_OK)):
                          continue
                      for directory in set(candidate.parents) | set(executable.parents):
                          metadata = directory.stat()
                          if (not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0
                              or metadata.st_mode & 0o022):
                              break
                      else:
                          return str(executable)
                  except (OSError, RuntimeError):
                      continue
              raise SystemExit('No trusted gh executable; bootstrap blocked')
          gh_executable = trusted_gh_executable()
          with open(os.environ['GITHUB_EVENT_PATH']) as event_file:
              e = json.load(event_file)
          event = os.environ['GITHUB_EVENT_NAME']
          repo = os.environ['GITHUB_REPOSITORY']
          if e['repository']['full_name'] != repo:
              raise SystemExit('Repository mismatch')
          if event == 'pull_request_target':
              sha = e['pull_request']['base']['sha']
          elif event == 'merge_group':
              sha = e['merge_group']['base_sha']
          else:
              branch = quote(e['repository']['default_branch'], safe='')
              data = subprocess.check_output([gh_executable, 'api', '--hostname', 'github.com', 'repos/' + repo + '/git/ref/heads/' + branch])
              sha = json.loads(data)['object']['sha']
          if not re.fullmatch('[0-9a-f]{{40}}', sha):
              raise SystemExit('Invalid trusted revision')
          if event == 'push':
              prefix = 'repos/' + repo
              def read_api(path):
                  return json.loads(subprocess.check_output([gh_executable, 'api', '--hostname', 'github.com', prefix + path]))
              tree = read_api('/git/trees/' + sha + '?recursive=1')
              if tree.get('truncated') or not isinstance(tree.get('tree'), list):
                  raise SystemExit('Complete trusted tree required')
              if not any(x.get('path') == '{RUNNER}' and x.get('type') == 'blob' for x in tree['tree']):
                  bootstrap = json.loads(os.environ.get('STUDIO_BOOTSTRAP') or '{{}}')
                  seed = bootstrap.get('sha', '')
                  if (bootstrap.get('repository') != repo or bootstrap.get('baseSha') != sha
                      or e.get('ref') != 'refs/heads/' + bootstrap.get('branch', '')
                      or not re.fullmatch('[0-9a-f]{{40}}', seed)):
                      raise SystemExit('Administrator-approved bootstrap required before initial publication')
                  pinned = read_api('/git/commits/' + seed)
                  if pinned.get('sha') != seed or [p['sha'] for p in pinned.get('parents', [])] != [sha]:
                      raise SystemExit('Bootstrap must be a reviewed direct child of the unchanged default branch')
                  sha = seed
          with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
              output.write('sha=' + sha + '\\n')
          PY
      - name: Checkout trusted base only
        uses: actions/checkout@{CHECKOUT_SHA}
        with:
          ref: ${{{{ steps.trusted.outputs.sha }}}}
          path: studio-trusted
          persist-credentials: false
          fetch-depth: 1
          submodules: false
          lfs: false
      - name: Analyze candidate data and report exact commit
        working-directory: ${{{{ runner.temp }}}}
        env:
          GH_TOKEN: ${{{{ github.token }}}}
          STUDIO_TRUSTED_SHA: ${{{{ steps.trusted.outputs.sha }}}}
        run: python3 -I -B "$GITHUB_WORKSPACE/studio-trusted/{RUNNER}" ci-check --trusted-root "$GITHUB_WORKSPACE/studio-trusted" --event "$GITHUB_EVENT_PATH"
'''.encode()

def make_bundle(config_bytes, detector_path=None):
    canonical = Path(detector_path) if detector_path else Path(__file__).with_name("design_guard.py")
    detector = canonical.read_bytes()
    if sha256(detector) != DETECTOR_SHA256:
        raise PublicationError("Canonical detector fingerprint mismatch.")
    files = {DETECTOR: detector, CONFIG: config_bytes, RUNNER: Path(__file__).read_bytes(), WORKFLOW: ci_workflow_bytes()}
    receipt = {"schemaVersion": "studio-design-guard-install.v1", "installerVersion": "1.0.0",
               "installationScope": "ci-only", "configSha256": sha256(config_bytes),
               "managedFiles": {key: sha256(value) for key, value in files.items()},
               "packages": [], "ci": True}
    files[RECEIPT] = json_bytes(receipt)
    return files

def validate_export_snapshot(proof_path, repository, base_sha, root):
    """Verify every regular export against immutable Git blobs, never local app files."""
    proof = json.loads(Path(proof_path).read_text())
    entries = proof if isinstance(proof, list) else proof.get("exports", [])
    entry = next((e for e in entries if e.get("repository") == repository and e.get("sha") == base_sha
                  and Path(e.get("source", "")).resolve() == root), None)
    if entry is None:
        raise PublicationError("No exact repository/SHA/path export proof.")
    expected = {}; links = []
    for record in git(Path(entry["root"]), "ls-tree", "-r", "-z", base_sha).split(b"\0"):
        if not record:
            continue
        meta, name = record.split(b"\t", 1); mode, kind, oid = meta.decode().split(); relative = name.decode()
        if mode == "120000":
            links.append(relative)
        elif kind == "blob":
            expected[relative] = oid
    actual = {}
    for path in root.rglob("*"):
        if path.is_symlink():
            raise PublicationError("Export must contain regular data only.")
        if path.is_file():
            data = path.read_bytes(); relative = path.relative_to(root).as_posix()
            actual[relative] = sha256(data)
    if actual.keys() != expected.keys():
        raise PublicationError("Export files differ from the immutable Git tree.")
    # Git OIDs select the immutable objects; the integrity comparison uses
    # their actual bytes and SHA-256, without reimplementing SHA-1 in Python.
    for relative, oid in expected.items():
        content = git(Path(entry["root"]), "cat-file", "blob", valid_sha(oid))
        if actual[relative] != sha256(content):
            raise PublicationError("Export files differ from the immutable Git tree.")
    return list(expected), links

def prepare_bundle(repository, branch, base_sha, remote_tree, config_path, output, detector_path=None, export_proof=None):
    repository, base_sha = valid_repo(repository), valid_sha(base_sha)
    root, output = Path(remote_tree).resolve(), Path(output).resolve()
    if output == root or output.is_relative_to(root) or root.is_relative_to(output):
        raise PublicationError("Output and immutable remote snapshot must be separate.")
    ignored_links = []
    if export_proof:
        tracked, ignored_links = validate_export_snapshot(export_proof, repository, base_sha, root)
    else:
        if git(root, "rev-parse", "HEAD").decode().strip() != base_sha:
            raise PublicationError("Remote snapshot HEAD does not match base SHA.")
        if git(root, "status", "--porcelain", "--untracked-files=all").strip():
            raise PublicationError("Remote snapshot is dirty; no local application changes may enter this plan.")
        tracked = [p for p in git(root, "ls-files", "-z").decode().split("\0") if p]
    if not branch or any(ord(c) < 32 for c in branch):
        raise PublicationError("Invalid publication branch.")
    if output.exists() and any(output.iterdir()):
        raise PublicationError("Output directory is not empty.")
    output.mkdir(parents=True, exist_ok=True)
    canonical = Path(detector_path) if detector_path else Path(__file__).with_name("design_guard.py")
    module = detector_module(canonical)
    config_bytes = Path(config_path).read_bytes()
    # Validate the policy using the exact frozen scanner before writing any bundle.
    config = module.load_config(Path(config_path))
    for relative in ignored_links:
        if not ignorable_link(relative, config):
            raise PublicationError("Export omitted an active source/control link: " + relative)
    # The clean/exported snapshot has already been bound to its Git tree. Scan
    # it normally: literal route names such as [slug].astro are not CLI globs.
    preflight = module.scan_project(root, Path(config_path).resolve())
    files = make_bundle(config_bytes, canonical)
    entries = []
    for relative, data in sorted(files.items()):
        target = output / "files" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        entries.append({"path": relative, "sha256": sha256(data), "contentFile": "files/" + relative})
    plan = {"schemaVersion": "studio-ci-publication.v1", "publisherVersion": VERSION,
            "repository": repository, "branch": branch, "baseSha": base_sha,
            "files": entries, "preflight": preflight,
            "ignoredNonSourceLinks": ignored_links,
            "enforcement": "blocked_plan", "published": False, "dryRun": True,
            "limitations": ["CI observation only; branch enforcement unavailable on the retained plan.",
                            "A failed remote preflight remains failed; no source baseline or app code is published.",
                            "Hosting/deployment side effects must be inspected before publishing the ref."]}
    (output / "plan.json").write_bytes(json_bytes(plan))
    return plan

def read_plan(path):
    path = Path(path).resolve()
    plan = load_json(path)
    valid_repo(plan.get("repository")); valid_sha(plan.get("baseSha"))
    entries = plan.get("files", [])
    if {e.get("path") for e in entries} != PUBLISH_FILES or len(entries) != len(PUBLISH_FILES):
        raise PublicationError("Publication file whitelist mismatch.")
    files = {}
    for entry in entries:
        expected = "files/" + entry["path"]
        if entry.get("contentFile") != expected:
            raise PublicationError("Unexpected bundle file path.")
        content_path = path.parent / expected
        if content_path.is_symlink() or not content_path.resolve().is_relative_to(path.parent):
            raise PublicationError("Bundle symlink or escape refused.")
        data = content_path.read_bytes()
        if sha256(data) != entry["sha256"]:
            raise PublicationError("Bundle fingerprint mismatch.")
        files[entry["path"]] = data
    return plan, files

def stage_commit(plan_path, api=None, apply=False, message=None):
    plan, files = read_plan(plan_path)
    result = {"repository": plan["repository"], "branch": plan["branch"], "baseSha": plan["baseSha"],
              "published": False, "refUpdated": False, "enforcement": "blocked_plan", "dryRun": not apply}
    if not apply:
        return result
    api = api or GhAPI()
    prefix = "repos/" + plan["repository"]
    base = api.request("GET", prefix + "/git/commits/" + plan["baseSha"])
    if base.get("sha") != plan["baseSha"]:
        raise PublicationError("Remote base commit identity mismatch.")
    tree = api.request("POST", prefix + "/git/trees", {"base_tree": base["tree"]["sha"],
        "tree": [{"path": relative, "mode": "100644", "type": "blob", "content": data.decode("utf-8")}
                 for relative, data in sorted(files.items())]})
    message = message or "ci: add trusted studio design guard"
    if re.search(r"\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]", message, re.I):
        raise PublicationError("Commit message must not suppress GitHub Actions.")
    commit = api.request("POST", prefix + "/git/commits", {"message": message,
        "tree": valid_sha(tree["sha"]), "parents": [plan["baseSha"]]})
    result.update(commitSha=valid_sha(commit["sha"]), treeSha=valid_sha(tree["sha"]),
                  planFile=str(Path(plan_path).resolve()), bundleFiles=[e["path"] for e in plan["files"]],
                  preflightStatus=plan["preflight"]["status"])
    return result

def verify_remote_blob(api, prefix, oid, expected):
    """Read-only verification against the reviewed bytes, before any ref write."""
    oid = valid_sha(oid)
    blob = api.request("GET", prefix + "/git/blobs/" + oid)
    if (not isinstance(blob, dict) or blob.get("sha") != oid or blob.get("encoding") != "base64"
            or type(blob.get("size")) is not int or blob["size"] != len(expected)
            or not isinstance(blob.get("content"), str)):
        raise PublicationError("Remote blob metadata/content invalid.")
    # GitHub wraps its base64 content with newlines. No other non-base64
    # characters or extra bytes are accepted, including oversized payloads.
    encoded = blob["content"].replace("\n", "").replace("\r", "")
    if len(encoded) != 4 * ((len(expected) + 2) // 3):
        raise PublicationError("Remote blob encoded size mismatch.")
    try:
        content = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise PublicationError("Remote blob encoding invalid.") from exc
    if len(content) != len(expected) or sha256(content) != sha256(expected):
        raise PublicationError("Remote blob differs from the reviewed file.")


def publish_commit(staged_path, api=None, apply=False, new_branch=None, allow_red=False):
    staged = load_json(staged_path)
    repository = valid_repo(staged.get("repository")); base = valid_sha(staged.get("baseSha")); commit = valid_sha(staged.get("commitSha"))
    plan, files = read_plan(staged["planFile"])
    if plan["repository"] != repository or plan["baseSha"] != base:
        raise PublicationError("Staged commit and prepared plan do not match.")
    if plan["preflight"].get("findings") and not allow_red:
        raise PublicationError("Remote source violations require explicit --allow-red publication acknowledgement; no baseline is added.")
    result = {**staged, "published": False, "refUpdated": False, "dryRun": not apply}
    if not apply:
        return result
    api = api or GhAPI(); prefix = "repos/" + repository
    # Verify the staged commit contains exactly the reviewed tree and sole parent.
    remote = api.request("GET", prefix + "/git/commits/" + commit)
    if remote.get("tree", {}).get("sha") != staged.get("treeSha") or [p["sha"] for p in remote.get("parents", [])] != [base]:
        raise PublicationError("Staged remote commit identity changed.")
    comparison = api.request("GET", prefix + "/compare/" + base + "..." + commit)
    changes = comparison.get("files")
    if not isinstance(changes, list) or any(
        change.get("filename") not in PUBLISH_FILES or change.get("status") not in ("added", "modified", "changed")
        for change in changes
    ):
        raise PublicationError("Staged commit changes files outside the reviewed CI bundle.")
    tree = api.request("GET", prefix + "/git/trees/" + staged["treeSha"] + "?recursive=1")
    if tree.get("truncated") or not isinstance(tree.get("tree"), list):
        raise PublicationError("Complete staged tree could not be verified.")
    entries = {entry["path"]: entry for entry in tree["tree"]}
    for relative, content in files.items():
        entry = entries.get(relative, {})
        if entry.get("type") != "blob" or entry.get("mode") != "100644":
            raise PublicationError("Staged tree differs from reviewed file: " + relative)
        verify_remote_blob(api, prefix, entry.get("sha"), content)
    if new_branch:
        if not re.fullmatch(r"[A-Za-z0-9_./-]+", new_branch) or ".." in new_branch or new_branch.startswith("/"):
            raise PublicationError("Invalid new branch name.")
        api.request("POST", prefix + "/git/refs", {"ref": "refs/heads/" + new_branch, "sha": commit})
        result["branch"] = new_branch
    else:
        branch = quote(plan["branch"], safe="")
        current = api.request("GET", prefix + "/git/ref/heads/" + branch)
        if current.get("object", {}).get("sha") != base:
            raise PublicationError("Branch advanced since preparation; reprepare without force.")
        api.request("PATCH", prefix + "/git/refs/heads/" + branch, {"sha": commit, "force": False})
    result.update(published=True, refUpdated=True)
    return result

def merge_required_checks(existing, context, app_id):
    """Pure future payload helper. This mission never applies branch protection."""
    if not isinstance(app_id, int) or app_id < 1:
        raise PublicationError("A positively observed producer App ID is required.")
    checks = {e["context"]: dict(e) for e in existing.get("checks", [])}
    for name in existing.get("contexts", []):
        checks.setdefault(name, {"context": name})
    if context in checks and checks[context].get("app_id") not in (None, app_id):
        raise PublicationError("Existing required check belongs to another producer.")
    checks[context] = {"context": context, "app_id": app_id}
    return {"strict": bool(existing.get("strict", True)), "checks": list(checks.values())}

def event_target(event, event_name, repository, event_sha, trusted_sha):
    repository = valid_repo(repository); valid_sha(trusted_sha)
    if event.get("repository", {}).get("full_name") != repository:
        raise PublicationError("Event repository mismatch.")
    if event_name == "pull_request_target":
        pr = event.get("pull_request", {})
        if not isinstance(event.get("number"), int) or event["number"] < 1 or pr.get("number") != event["number"]:
            raise PublicationError("Pull request number mismatch.")
        if pr.get("base", {}).get("repo", {}).get("full_name") != repository or pr.get("base", {}).get("sha") != trusted_sha:
            raise PublicationError("Pull request trusted base mismatch.")
        valid_repo(pr.get("head", {}).get("repo", {}).get("full_name"))
        return valid_sha(pr.get("head", {}).get("sha"))
    if event_name == "merge_group":
        group = event.get("merge_group", {})
        if group.get("base_sha") != trusted_sha:
            raise PublicationError("Merge group trusted base mismatch.")
        return valid_sha(group.get("head_sha"))
    if event_name in ("push", "workflow_dispatch"):
        sha = valid_sha(event_sha)
        if event_name == "push" and (event.get("deleted") or event.get("after") != sha):
            raise PublicationError("Push commit mismatch or deleted ref.")
        return sha
    raise PublicationError("Unsupported CI event.")

def excluded(relative, config):
    def match(pattern):
        return fnmatch.fnmatchcase(relative, pattern) or (pattern.endswith('/**') and relative.startswith(pattern[:-3].rstrip('/') + '/'))
    return any(match(pattern) for pattern in config["excludes"])

def ignorable_link(relative, config):
    if relative in PUBLISH_FILES:
        return False
    # Only known contextual aliases may bypass the active-source link refusal.
    # A broad CSS exclusion must never make a linked UI source disappear.
    if relative.startswith('.agents/skills/') and excluded(relative, config):
        return True
    # Explicit contextual aliases only. A suffix alone does not establish
    # that a link is a document rather than a directory of active sources.
    return PurePosixPath(relative).name in {'AGENTS.md', 'CLAUDE.md', 'README.md'}

def extract_candidate(archive, destination, config):
    if len(archive) > MAX_ARCHIVE:
        raise PublicationError("Archive compressed size limit exceeded.")
    destination = Path(destination).resolve(); destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise PublicationError("Candidate extraction requires an empty directory.")
    ignored_links=[]; total=0; prefix=None; names=set()
    try:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
            for index, member in enumerate(tar):
                if index > 100000:
                    raise PublicationError("Archive member limit exceeded.")
                raw = member.name
                parts = PurePosixPath(raw).parts
                if not parts or raw.startswith('/') or '\\' in raw or '..' in parts or any(ord(c)<32 for c in raw):
                    raise PublicationError("Archive path traversal/absolute/control path refused.")
                prefix = prefix or parts[0]
                if parts[0] != prefix:
                    raise PublicationError("Archive must have one GitHub snapshot root.")
                if len(parts)==1:
                    if not member.isdir():
                        raise PublicationError("Archive root must be a directory.")
                    continue
                relative='/'.join(parts[1:])
                if '.git' in parts or relative in names:
                    raise PublicationError("Git metadata or duplicate archive path refused.")
                names.add(relative)
                if member.isdir():
                    continue
                if member.issym() or member.islnk():
                    if ignorable_link(relative,config):
                        ignored_links.append(relative); continue
                    raise PublicationError("Link in active/controlled candidate sources refused: " + relative)
                if not member.isreg():
                    raise PublicationError("Special archive member refused.")
                total += member.size
                if total > MAX_EXPANDED or member.size > 128*1024*1024:
                    raise PublicationError("Archive expanded size limit exceeded.")
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                handle=tar.extractfile(member)
                if handle is None:
                    raise PublicationError("Unreadable regular archive member.")
                target.write_bytes(handle.read())
                target.chmod(0o600)
    except (tarfile.TarError,OSError) as exc:
        raise PublicationError("Invalid/unreadable archive.") from exc
    return {"ignoredExcludedLinks": ignored_links, "regularBytes": total}

def controlled_files(root):
    root=Path(root)
    return {p.relative_to(root).as_posix():p.read_bytes()
            for folder in [root/'.studio',root/'.github/workflows'] if folder.exists()
            for p in folder.rglob('*') if p.is_file() and not p.is_symlink()}

def analyze_candidate(trusted_root, candidate_root, timeout=120):
    trusted_root,candidate_root=Path(trusted_root).resolve(),Path(candidate_root).resolve()
    if trusted_root==candidate_root or trusted_root.is_relative_to(candidate_root) or candidate_root.is_relative_to(trusted_root):
        raise PublicationError("Trusted and candidate trees must be separate.")
    trusted=controlled_files(trusted_root);candidate=controlled_files(candidate_root)
    if trusted != candidate:
        raise PublicationError("Candidate modifies/adds/deletes a studio control or workflow; approved authority update required.")
    receipt=load_json(trusted_root/RECEIPT)
    for relative, expected in receipt["managedFiles"].items():
        if relative not in MANAGED_CONTROL_FILES or sha256((trusted_root/relative).read_bytes()) != expected:
            raise PublicationError("Trusted control receipt mismatch.")
    if sha256((trusted_root/DETECTOR).read_bytes()) != DETECTOR_SHA256:
        raise PublicationError("Trusted detector fingerprint mismatch.")
    command=[sys.executable,'-I','-B',str(trusted_root/DETECTOR),'--root',str(candidate_root),'--config',str(trusted_root/CONFIG),'--json']
    result=subprocess.run(command,cwd=trusted_root,capture_output=True,text=True,timeout=timeout)
    try: report=json.loads(result.stdout)
    except ValueError as exc: raise PublicationError("Scanner returned invalid JSON.") from exc
    if result.returncode not in (0,1,2) or not isinstance(report,dict):
        raise PublicationError("Scanner process failed.")
    return {"exitCode":result.returncode,"report":report}

def run_ci(trusted_root,event_path,env=None,api=None):
    env=dict(os.environ if env is None else env);api=api or GhAPI();trusted_root=Path(trusted_root).resolve()
    event=load_json(event_path);repo=valid_repo(env.get('GITHUB_REPOSITORY'));trust=valid_sha(env.get('STUDIO_TRUSTED_SHA'))
    if git(trusted_root,'rev-parse','HEAD').decode().strip()!=trust:
        raise PublicationError('Checked out trusted revision mismatch.')
    target=event_target(event,env.get('GITHUB_EVENT_NAME'),repo,env.get('GITHUB_SHA'),trust)
    prefix='repos/'+repo
    commit=api.request('GET',prefix+'/commits/'+target)
    if commit.get('sha')!=target:
        raise PublicationError('Candidate commit lookup mismatch.')
    status_endpoint=prefix+'/statuses/'+target
    def status(state,description):
        return api.request('POST',status_endpoint,{'state':state,'context':CONTEXT,'description':description})
    status('pending','Static source inspection from trusted base')
    try:
        archive=api.request('GET',prefix+'/tarball/'+target,binary=True)
        config=load_json(trusted_root/CONFIG)
        with tempfile.TemporaryDirectory(prefix='studio-candidate-',dir=env.get('RUNNER_TEMP')) as temp:
            extraction=extract_candidate(archive,Path(temp)/'candidate',config)
            analysis=analyze_candidate(trusted_root,Path(temp)/'candidate')
        passed=analysis['exitCode']==0
        status('success' if passed else 'failure','Static source check passed' if passed else 'Source violations or scanner error; see run log')
        return {'repository':repo,'scannedSha':target,'trustedSha':trust,'enforcement':'not-assessed-by-source-check',**extraction,**analysis}
    except (PublicationError,OSError,subprocess.TimeoutExpired) as exc:
        status('error','Static inspection failed; see trusted workflow log')
        raise PublicationError(str(exc)) from exc

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);subs=parser.add_subparsers(dest='command',required=True)
    p=subs.add_parser('prepare');p.add_argument('--repository',required=True);p.add_argument('--branch',required=True);p.add_argument('--base-sha',required=True);p.add_argument('--remote-tree',required=True,type=Path);p.add_argument('--config',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--export-proof',type=Path)
    p=subs.add_parser('stage');p.add_argument('--plan',required=True,type=Path);p.add_argument('--apply',action='store_true');p.add_argument('--output',type=Path);p.add_argument('--message-file',type=Path)
    p=subs.add_parser('publish');p.add_argument('--staged',required=True,type=Path);p.add_argument('--apply',action='store_true');p.add_argument('--new-branch');p.add_argument('--allow-red',action='store_true');p.add_argument('--output',type=Path)
    p=subs.add_parser('ci-check');p.add_argument('--trusted-root',required=True,type=Path);p.add_argument('--event',required=True,type=Path)
    args=parser.parse_args(argv)
    try:
        if args.command=='prepare':result=prepare_bundle(args.repository,args.branch,args.base_sha,args.remote_tree,args.config,args.output,export_proof=args.export_proof)
        elif args.command=='stage':result=stage_commit(args.plan,apply=args.apply,message=args.message_file.read_text() if args.message_file else None)
        elif args.command=='publish':result=publish_commit(args.staged,apply=args.apply,new_branch=args.new_branch,allow_red=args.allow_red)
        else:result=run_ci(args.trusted_root,args.event)
        if args.command in ('stage','publish') and args.output:args.output.write_bytes(json_bytes(result))
        print(json.dumps(result,ensure_ascii=False,indent=2))
        return result.get('exitCode',0) if args.command=='ci-check' else 0
    except (PublicationError,OSError,KeyError,subprocess.TimeoutExpired) as exc:
        print(json.dumps({'status':'error','message':str(exc),'enforcement':'blocked_plan'}));return 2

if __name__=='__main__':
    raise SystemExit(main())
