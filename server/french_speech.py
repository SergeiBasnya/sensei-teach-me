"""Voix française Vivienne via Edge TTS ; texte uniquement, sans journalisation."""
import asyncio
from pathlib import Path
import subprocess
import tempfile

import edge_tts
import imageio_ffmpeg

FRENCH_VOICE = "fr-FR-VivienneMultilingualNeural"
FRENCH_TIMEOUT_SECONDS = 25
MAX_MP3_BYTES = 1_000_000


async def collect_audio(text):
    voice = edge_tts.Communicate(
        text, FRENCH_VOICE, rate="+0%", pitch="+0Hz",
        connect_timeout=5, receive_timeout=15,
    )
    audio = bytearray()
    async for chunk in voice.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
            if len(audio) > MAX_MP3_BYTES:
                raise ValueError("french_audio_too_large")
    if not audio:
        raise ValueError("empty_french_audio")
    return bytes(audio)


def synthesize_french(text):
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500:
        raise ValueError("invalid_french_speech")
    async def generate():
        return await asyncio.wait_for(collect_audio(text.strip()), FRENCH_TIMEOUT_SECONDS)
    mp3 = asyncio.run(generate())
    with tempfile.TemporaryDirectory(prefix="mochi-fr-") as temporary:
        source, target = Path(temporary) / "voice.mp3", Path(temporary) / "voice.wav"
        source.write_bytes(mp3)
        subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-v", "error", "-i", str(source),
             "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(target)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=10,
        )
        wav = target.read_bytes()
    if not 44 < len(wav) <= 2_900_000 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise ValueError("invalid_french_wav")
    return wav
