import os
import tempfile
import threading
from functools import lru_cache

from fastapi import HTTPException, UploadFile

from .config import settings
from .schemas import AsrResponse

_transcribe_semaphore = threading.Semaphore(settings.asr_max_concurrent)


@lru_cache(maxsize=1)
def _load_model():
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="faster-whisper is not installed. Run: pip install -r backend/requirements.txt",
        ) from exc

    try:
        return WhisperModel(settings.asr_model, device=settings.asr_device, compute_type=settings.asr_compute_type)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "ASR model is not ready. Check model download/network and ASR_DEVICE/ASR_COMPUTE_TYPE. "
                f"Original error: {exc}"
            ),
        ) from exc


async def transcribe_audio(file: UploadFile, language: str | None = "zh") -> AsrResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    if len(content) > settings.max_audio_bytes:
        raise HTTPException(status_code=413, detail="Audio file is too large")

    suffix = _safe_suffix(file.filename)
    temp_path = ""

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        if not _transcribe_semaphore.acquire(blocking=False):
            raise HTTPException(status_code=429, detail="ASR is busy. Please retry after the current transcription finishes")

        try:
            model = _load_model()
            try:
                segments, info = model.transcribe(
                    temp_path,
                    language=language or None,
                    vad_filter=False,
                    beam_size=5,
                )
                text = "".join(segment.text for segment in segments).strip()
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Audio transcription failed: {exc}") from exc
        finally:
            _transcribe_semaphore.release()

        return AsrResponse(
            text=text,
            language=getattr(info, "language", None),
            duration=getattr(info, "duration", None),
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def _safe_suffix(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ".webm"

    suffix = "." + filename.rsplit(".", 1)[-1].lower()
    return suffix if suffix in {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".flac"} else ".webm"
