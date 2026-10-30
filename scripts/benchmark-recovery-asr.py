"""Bounded Small-profile smoke test on three public synthetic assets, never human validation."""
import argparse
import base64
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--exclusive', action='store_true', required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('private_comparison', ROOT / 'scripts/compare-human-asr.py')
    comparison = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(comparison)
    output = comparison.private_path(args.output)
    if output.exists():
        raise ValueError('fresh_private_output_required')
    running = subprocess.run(['pgrep', '-f', 'server/(conversation_worker|voice_lab_worker|voice_worker).py'], capture_output=True)
    if running.returncode != 1:
        raise ValueError('exclusive_workers_not_confirmed')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_DATASETS_OFFLINE'] = '1'
    os.environ['NUMBA_CACHE_DIR'] = str(ROOT / '.local/conversation/numba')
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        import imageio_ffmpeg
        import numpy as np
        import mlx.core as mx
        import mlx_whisper
        from mlx_whisper.transcribe import ModelHolder
        from voice_lab_worker import transcribe_request, signal_metrics
        from conversation_worker import recognized_utterance
        model = ROOT / '.local/conversation/models/whisper'
        ModelHolder.get_model(str(model), mx.float16)
        mx.synchronize()
    fixtures = [
        ('origin', '109e155eca21856c868a.wav', 'フランスから来ました。', False),
        ('choice', 'a39332e0aafc35578065.wav', 'ホットでお願いします。', False),
        ('choice-weak-tail', 'a39332e0aafc35578065.wav', 'ホットでお願いします。', True),
    ]
    rows = []
    for index, (name, file, reference, weak) in enumerate(fixtures):
        pcm = subprocess.check_output([imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-v', 'error', '-i', str(ROOT / 'assets/speech' / file), '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'])
        if weak:
            audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32)
            audio *= (0.0013 / max(1e-6, float(np.sqrt(np.mean((audio / 32768) ** 2)))) )
            pcm = np.clip(audio, -32768, 32767).astype('<i2').tobytes() + bytes(16000 * 2 * 6)
        levels = signal_metrics(np.frombuffer(pcm, dtype='<i2').astype(np.float32)/32768)
        profiles = list(comparison.PROFILES)
        for profile in profiles[index:] + profiles[:index]:
            settings = comparison.PROFILES[profile]
            def decode(audio, **options):
                options.update(settings)
                return mlx_whisper.transcribe(audio, **options)
            started = time.perf_counter()
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                result = transcribe_request({'id':1, 'pcm':base64.b64encode(pcm).decode(), 'language':'auto', 'diagnostic':True}, model=model, transcribe=decode, recognize=recognized_utterance)
                mx.synchronize()
            raw = result['diagnostic']['rawText']
            rows.append({'fixture':name, 'profile':profile, 'pcmSha256':hashlib.sha256(pcm).hexdigest(), 'referenceOrigin':'public-synthesis-script-not-human', 'reference':reference, 'rawText':raw, 'finalText':result['text'], 'uncertain':result['uncertain'], 'gate':result['diagnostic']['signalGate'], 'beforeGlobalGateWouldSkip':levels['rms_db_below_full_scale']>60, 'metrics':result['metrics'], 'totalMs':round((time.perf_counter()-started)*1000,1), 'rawCER':comparison.character_error(reference,raw,True), 'finalCER':comparison.character_error(reference,result['text'],True), 'firstInference':not rows})
    comparison.write_private(output, {'schema':'sensei-recovery-asr-synthetic.v1', 'humanValidation':'pending', 'modelChanged':False, 'repeats':1, 'limitations':['Easy public synthesized Japanese only; no beginner human accent, hesitation, French or ambient noise.', 'One first inference is cold; alternating order is not an independent repeated latency study.', 'References are synthesis scripts, not human-verified recordings. No profile selected.'], 'rows':rows})
    print(json.dumps({'status':'complete','syntheticOnly':True,'comparisons':len(rows),'humanValidation':'pending'}))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Synthetic ASR comparison failed; no private payload emitted.', file=sys.stderr)
        sys.exit(1)
