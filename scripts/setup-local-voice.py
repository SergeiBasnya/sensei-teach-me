"""Installation facultative de VOICEVOX dans ce projet, sans service ni paquet global."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import urllib.request

VERSION = "0.17.1"
ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Sensei-personal-voice-setup"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accept-voicevox-terms", action="store_true", help="Confirmer les conditions des modèles : https://github.com/VOICEVOX/voicevox_vvm et https://amehau.com/rules/amehare-hau-rule")
    args = parser.parse_args()
    if not args.accept_voicevox_terms:
        parser.error("Lire les conditions référencées puis relancer avec --accept-voicevox-terms.")
    if sys.version_info < (3, 10):
        parser.error("Python 3.10 ou plus récent est requis.")
    system = {"Darwin": "osx", "Linux": "linux", "Windows": "windows"}.get(platform.system())
    arch = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64", "AMD64": "x64"}.get(platform.machine())
    if not system or not arch:
        parser.error("Plateforme non prise en charge par cet installateur.")
    local = ROOT / ".local/voicevox"
    local.mkdir(parents=True, exist_ok=True)
    release = json.loads(fetch(f"https://api.github.com/repos/VOICEVOX/voicevox_core/releases/tags/{VERSION}"))
    name = f"download-{system}-{arch}" + (".exe" if system == "windows" else "")
    downloader = next(asset for asset in release["assets"] if asset["name"] == name)
    content = fetch(downloader["browser_download_url"])
    digest = "sha256:" + hashlib.sha256(content).hexdigest()
    if downloader.get("digest") != digest:
        raise RuntimeError("Empreinte du téléchargement officiel non vérifiée : installation interrompue.")
    executable = local / name
    executable.write_bytes(content)
    executable.chmod(0o755)
    wheel_mark = "macosx_11_0_arm64" if system == "osx" and arch == "arm64" else "macosx_10_12_x86_64" if system == "osx" else "win_amd64" if system == "windows" else "manylinux_2_34_aarch64" if arch == "arm64" else "manylinux_2_34_x86_64"
    wheel = next(asset for asset in release["assets"] if asset["name"].endswith(wheel_mark + ".whl"))
    environment = ROOT / ".venv"
    if not environment.exists():
        subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True)
    python = environment / ("Scripts/python.exe" if system == "windows" else "bin/python")
    subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check", wheel["browser_download_url"],
                    "-r", str(ROOT / "server/speech-requirements.txt")], check=True)
    with (local / "setup.log").open("w") as log:
        subprocess.run([str(executable), "--only", "onnxruntime", "models", "dict", "--models-pattern", "[04].vvm", "--models-version", "0.17.0", "--onnxruntime-version", "1.17.3", "-o", str(local / "runtime")], input="y\n", text=True, stdout=log, stderr=subprocess.STDOUT, cwd=ROOT, check=True)
    (local / "setup-receipt.json").write_text(json.dumps({"coreVersion": VERSION, "downloader": name, "digest": digest, "models": "0.17.0", "termsAccepted": True}, indent=2) + "\n")
    print("Moteur local installé dans le projet. Crédit : VOICEVOX:雨晴はう. Aucun compte ni clé API requis pour la voix.")


if __name__ == "__main__":
    main()
