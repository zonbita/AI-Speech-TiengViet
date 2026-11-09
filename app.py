"""Local TTS: VieNeu (Việt+English) + F5-TTS Vietnamese. RTX 3060: VieNeu=CPU, F5=GPU.

  .venv\\Scripts\\python app.py "Xin chào, welcome to our game!"
  .venv\\Scripts\\python app.py "Xin chào" --pitch 3
  .venv\\Scripts\\python app.py "Xin chào" -e f5
  .venv\\Scripts\\python app.py --list
  .venv\\Scripts\\python app.py serve
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
VOICES = ROOT / "voices"
F5_REF = VOICES / "ref.wav"
F5_REF_TEXT = "Xin chào, đây là giọng mẫu mặc định cho F5-TTS tiếng Việt."
F5_REPO = "zalopay/vietnamese-tts"
F5_CKPT = "model_1290000.pt"
DEFAULT_VOICE = "Trúc Ly"
DEFAULT_PORT = 8765

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
F5_CACHE = Path.home() / ".cache" / "speechtiengviet" / "f5"

_vieneu = None
_f5 = None


def _ensure_dirs() -> None:
    OUT.mkdir(exist_ok=True)
    VOICES.mkdir(exist_ok=True)


def vieneu():
    global _vieneu
    if _vieneu is None:
        from vieneu import Vieneu

        _vieneu = Vieneu(backend="onnx")
    return _vieneu


def _setup_ffmpeg() -> None:
    try:
        import imageio_ffmpeg
        from pydub import AudioSegment

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        os.environ["PATH"] = str(Path(exe).parent) + os.pathsep + os.environ.get("PATH", "")
        AudioSegment.converter = exe
    except Exception:
        pass


def f5():
    global _f5
    if _f5 is None:
        from cached_path import cached_path
        from f5_tts.api import F5TTS

        _setup_ffmpeg()
        F5_CACHE.mkdir(parents=True, exist_ok=True)
        local_ckpt = F5_CACHE / F5_CKPT
        local_vocab = F5_CACHE / "vocab.txt"
        ckpt = (
            str(local_ckpt)
            if local_ckpt.exists() and local_ckpt.stat().st_size > 1_000_000_000
            else str(cached_path(f"hf://{F5_REPO}/{F5_CKPT}"))
        )
        vocab = str(local_vocab) if local_vocab.exists() else str(cached_path(f"hf://{F5_REPO}/vocab.txt"))
        _f5 = F5TTS(model="F5TTS_Base", ckpt_file=ckpt, vocab_file=vocab)
    return _f5


def _f5_ref(ref: str) -> tuple[str, str]:
    if ref:
        p = Path(ref)
        if not p.exists():
            raise FileNotFoundError(f"Không thấy file giọng: {p}")
        return str(p), ""
    if F5_REF.exists():
        return str(F5_REF), F5_REF_TEXT if F5_REF.stat().st_size > 0 else ""
    _ensure_dirs()
    wav, sr = synthesize("vieneu", F5_REF_TEXT, DEFAULT_VOICE, "")
    sf.write(F5_REF, wav, sr)
    return str(F5_REF), F5_REF_TEXT


def _vieneu_voices() -> list[tuple[str, str]]:
    return vieneu().list_preset_voices()


def _resolve_vieneu_voice(voice: str) -> str:
    voice = (voice or DEFAULT_VOICE).strip()
    presets = _vieneu_voices()
    ids = {vid for _, vid in presets}
    if voice in ids:
        return voice
    for label, vid in presets:
        if label == voice:
            return vid
    available = ", ".join(sorted(ids))
    raise ValueError(f"Voice '{voice}' not found. Available: {available}")


def _apply_pitch_shift(wav: np.ndarray, sr: int, pitch: float) -> np.ndarray:
    if abs(pitch) < 1e-6:
        return wav
    try:
        import librosa
    except Exception as e:
        raise RuntimeError("Thiếu librosa để đổi pitch") from e
    shifted = librosa.effects.pitch_shift(np.asarray(wav, dtype=np.float32), sr=sr, n_steps=pitch)
    return np.asarray(shifted, dtype=np.float32)


def synthesize(engine: str, text: str, voice: str, ref: str, pitch: float = 0.0) -> tuple[np.ndarray, int]:
    text = (text or "").strip()
    if not text:
        raise ValueError("Thiếu text")
    if engine == "f5":
        ref_file, ref_text = _f5_ref(ref)
        wav, sr, _ = f5().infer(ref_file=ref_file, ref_text=ref_text, gen_text=text)
        audio = np.asarray(wav, dtype=np.float32)
        sr = int(sr)
    else:
        audio = np.asarray(vieneu().infer(text, voice=_resolve_vieneu_voice(voice)), dtype=np.float32)
        sr = 48000
    return _apply_pitch_shift(audio, sr, pitch), sr


def to_wav_bytes(wav: np.ndarray, sr: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV")
    return buf.getvalue()


def save_wav(wav: np.ndarray, sr: int, path: Path) -> Path:
    _ensure_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, wav, sr)
    return path


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[tts] {self.address_string()} {fmt % args}")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _wav(self, data: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        u = urlparse(self.path)
        if u.path in ("/", "/health"):
            voices = []
            try:
                voices = [{"label": label, "id": vid} for label, vid in _vieneu_voices()]
            except Exception:
                pass
            return self._json(200, {"ok": True, "engines": ["vieneu", "f5"], "voices": voices})
        if u.path != "/tts":
            return self._json(404, {"error": "not found"})
        q = parse_qs(u.query)
        text = unquote((q.get("text") or [""])[0])
        engine = (q.get("engine") or ["vieneu"])[0]
        voice = (q.get("voice") or [DEFAULT_VOICE])[0]
        ref = (q.get("ref") or [""])[0]
        pitch = float((q.get("pitch") or ["0"])[0] or "0")
        try:
            wav, sr = synthesize(engine, text, voice, ref, pitch)
            self._wav(to_wav_bytes(wav, sr))
        except Exception as e:
            self._json(400, {"error": str(e)})

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/tts":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "JSON không hợp lệ"})
        try:
            wav, sr = synthesize(
                body.get("engine") or "vieneu",
                body.get("text") or "",
                body.get("voice") or DEFAULT_VOICE,
                body.get("ref") or "",
                float(body.get("pitch") or 0),
            )
            self._wav(to_wav_bytes(wav, sr))
        except Exception as e:
            self._json(400, {"error": str(e)})


def serve(host: str, port: int) -> None:
    httpd = ThreadingHTTPServer((host, port), Handler)
    import threading
    threading.Thread(target=lambda: _vieneu_voices(), daemon=True).start()
    print(f"TTS local  http://{host}:{port}/tts")
    print("POST {\"text\":\"Xin chào, welcome!\",\"engine\":\"vieneu\",\"pitch\":3}")
    httpd.serve_forever()


def _utf8_stdio() -> None:
    os.environ.setdefault("PYTHONUTF8", "1")
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_stdio()
    p = argparse.ArgumentParser(description="Local TTS Việt + English (VieNeu + F5)")
    p.add_argument("text", nargs="?", help="câu cần đọc, hoặc 'serve'")
    p.add_argument("-e", "--engine", choices=["vieneu", "f5"], default="vieneu")
    p.add_argument("-v", "--voice", default=DEFAULT_VOICE, help="giọng VieNeu, vd: Trúc Ly")
    p.add_argument("-o", "--out", default="", help="file wav output")
    p.add_argument("--ref", default="", help="file wav clone cho F5")
    p.add_argument("--pitch", type=float, default=0.0, help="đổi pitch theo semitone, vd: 3 hoặc -2")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--list", action="store_true", help="liệt kê giọng VieNeu")
    args = p.parse_args()

    if args.list:
        for label, vid in vieneu().list_preset_voices():
            print(f"{label}\t{vid}")
        return
    if args.text == "serve" or args.text is None and not args.list:
        if args.text is None:
            p.print_help()
            print("\nVí dụ: python app.py \"Xin chào, welcome!\"")
            print("       python app.py serve")
            return
        serve(args.host, args.port)
        return

    wav, sr = synthesize(args.engine, args.text, args.voice, args.ref, args.pitch)
    out = Path(args.out) if args.out else OUT / f"{args.engine}.wav"
    path = save_wav(wav, sr, out)
    print(path)


if __name__ == "__main__":
    main()
