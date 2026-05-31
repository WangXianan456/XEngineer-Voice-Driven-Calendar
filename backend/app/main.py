from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .asr import transcribe_audio
from .config import settings
from .deepseek_client import parse_with_deepseek
from .schemas import AsrResponse, ParseCommandRequest, ParseCommandResponse

app = FastAPI(title="XEngineer Voice Calendar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "deepseekConfigured": bool(settings.deepseek_api_key),
        "asrModel": settings.asr_model,
        "asrDevice": settings.asr_device,
        "asrComputeType": settings.asr_compute_type,
        "asrMaxConcurrent": settings.asr_max_concurrent,
    }


@app.post("/api/parse-command", response_model=ParseCommandResponse)
async def parse_command(payload: ParseCommandRequest) -> ParseCommandResponse:
    return await parse_with_deepseek(payload)


@app.post("/api/asr", response_model=AsrResponse)
async def asr(file: UploadFile = File(...), language: str | None = "zh") -> AsrResponse:
    return await transcribe_audio(file, language)
