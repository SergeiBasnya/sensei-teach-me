"""Installe Whisper et Qwen dans le projet (Mac Apple Silicon), sans compte ni service système."""
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MODELS = {
    "chat-qwen3-14b": ("mlx-community/Qwen3-14B-4bit", "a4d9b2df59d2c150bef02fcbe0d91046b7ca33a4"),
    "whisper": ("mlx-community/whisper-small-mlx", "45f3915923c7a79a5a5b5a7d909d39aeb0e5630e"),
}


def main():
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise SystemExit("Ce moteur local nécessite un Mac Apple Silicon. Le téléphone se connecte à ce serveur.")
    if sys.version_info < (3, 10):
        raise SystemExit("Python 3.10 ou plus récent est requis.")
    python = ROOT / ".venv/bin/python"
    if not python.exists():
        subprocess.run([sys.executable, "-m", "venv", str(ROOT / ".venv")], check=True)
    subprocess.run([str(python), "-m", "pip", "install", "--cache-dir", str(ROOT / ".local/pip-cache"),
                    "mlx-lm==0.32.2", "mlx-whisper==0.4.3", "imageio-ffmpeg==0.6.0", "pykakasi==2.3.0"], check=True)
    if Path(sys.prefix).resolve() != (ROOT / ".venv").resolve():
        subprocess.run([str(python), str(Path(__file__).resolve())], check=True)
        return
    os.environ["HF_HOME"] = str(ROOT / ".local/conversation/hf")
    from huggingface_hub import snapshot_download
    for name, (repo, revision) in MODELS.items():
        print(f"Téléchargement local : {repo}", flush=True)
        snapshot_download(repo, revision=revision, local_dir=str(ROOT / ".local/conversation/models" / name),
                          allow_patterns=["*.json", "*.safetensors", "*.npz", "*.txt", "*.jinja", "*.md"],
                          max_workers=3)
    receipt = ROOT / ".local/conversation/setup-receipt.json"
    receipt.write_text(json.dumps(MODELS, indent=2) + "\n")
    print("Dialogue et transcription installés. Aucun appel IA payant. Lancer npm run local.")


if __name__ == "__main__":
    main()
