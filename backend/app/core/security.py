import io
import re
from collections.abc import Iterable

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

import os

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://127.0.0.1",
    "http://localhost",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
)

_SENSITIVE_PATTERNS = (
    re.compile(r"(://)([^:/\s]+):([^@/\s]+)@", re.IGNORECASE),
    re.compile(r"(?i)\b(password|passwd|pwd|token|secret|authorization)\b\s*[:=]\s*([^\s,;]+)"),
)


def safe_filename(filename: str | None) -> str:
    """Sanitize filenames before they appear in logs."""
    if not filename:
        return "<unknown>"
    return filename.replace("\n", "_").replace("\r", "_")[:120]


def parse_cors_allow_origins(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return DEFAULT_CORS_ALLOW_ORIGINS

    values = []
    for item in raw_value.split(","):
        candidate = item.strip().rstrip("/")
        if not candidate or candidate == "*":
            continue
        values.append(candidate)

    return tuple(dict.fromkeys(values)) or DEFAULT_CORS_ALLOW_ORIGINS


def sanitize_error_message(message: str | None) -> str | None:
    if not message:
        return None

    sanitized = message
    sanitized = _SENSITIVE_PATTERNS[0].sub(r"\1***:***@", sanitized)
    sanitized = _SENSITIVE_PATTERNS[1].sub(r"\1=***", sanitized)
    return sanitized


def _has_known_image_signature(raw_bytes: bytes) -> bool:
    signatures: Iterable[bytes] = (
        b"\xff\xd8\xff",
        b"\x89PNG\r\n\x1a\n",
        b"GIF87a",
        b"GIF89a",
        b"BM",
        b"II*\x00",
        b"MM\x00*",
    )
    if any(raw_bytes.startswith(signature) for signature in signatures):
        return True
    return raw_bytes.startswith(b"RIFF") and raw_bytes[8:12] == b"WEBP"


def verify_image_bytes(raw_bytes: bytes) -> None:
    if not _has_known_image_signature(raw_bytes):
        raise HTTPException(status_code=400, detail="Tệp ảnh không hợp lệ.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Tệp ảnh không hợp lệ.") from exc


def validate_image_upload(file: UploadFile, raw_bytes: bytes) -> None:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Chỉ nhận tệp ảnh.")
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Tệp ảnh trống.")
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Tệp quá lớn. Giới hạn: {MAX_UPLOAD_SIZE_MB}MB.",
        )
    verify_image_bytes(raw_bytes)
