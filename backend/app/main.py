"""
main.py - HemaVision AI Backend
"""
import os
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

# ── Suppress noisy ML warnings at import time ──────────────────
os.environ["MPLBACKEND"] = "Agg"                   # Non-interactive matplotlib
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib"     # Avoid font cache regeneration


from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from backend.app.api.routes.admin import router as admin_router
from backend.app.api.routes.analysis import router as analysis_router
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.system import alias_router
from backend.app.api.routes.system import router as system_router
from backend.app.api.routes.xai import router as xai_router
from backend.app.core.config import settings
from backend.app.core.logging import get_logger, setup_logging
from backend.app.core.rate_limit import limiter, rate_limit_exceeded_handler
from backend.app.services.persistence_service import (
    apply_database_label_overrides,
    initialize_database,
    sync_model_catalog,
)

setup_logging()
logger = get_logger("main")



@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown lifecycle.
    
    CRITICAL: Do NOT load any ML models here! TensorFlow, PyTorch, ONNX, 
    and Ultralytics models are heavy (~200-400MB each). Loading them all 
    at startup will cause OOM crash on Render Free Tier (512MB RAM).
    
    Models are lazy-loaded on first request via:
    - classifier_service.py: initialize_classifier_registry() 
    - analysis_service.py: initialize_detection_runtime()
    - analysis_onnx_service.py: Best9ONNXService.get_instance()
    """
    logger.info("Initializing system registries and dependencies...")
    # Only initialize lightweight services (database, config)
    # ML models are loaded on-demand when the first analysis request hits.
    initialize_database()
    sync_model_catalog()
    apply_database_label_overrides()
    logger.info("Application startup complete. ML models will lazy-load on first request.")
    yield
    logger.info("Application shutting down...")


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Validation error on {request.method} {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": "Dữ liệu đầu vào không hợp lệ.", "errors": exc.errors()},
    )


@app.exception_handler(IntegrityError)
async def integrity_exception_handler(request: Request, exc: IntegrityError):
    logger.error(f"Database integrity error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=409,
        content={"detail": "Xung đột dữ liệu. Có thể bản ghi đã tồn tại."},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Lỗi cơ sở dữ liệu hệ thống."},
    )


import re
import time

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


@app.middleware("http")
async def security_and_logging_middleware(request: Request, call_next):
    start_time = time.time()
    response: Response = await call_next(request)
    process_time = time.time() - start_time

    # Attach security headers to every response
    for header_name, header_value in SECURITY_HEADERS.items():
        response.headers[header_name] = header_value

    # Prevent caching for API JSON responses
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"

    logger.info(
        "%s %s - Status: %s - Completed in %.4fs",
        request.method,
        request.url.path,
        response.status_code,
        process_time,
    )
    return response


# ── CORS configuration ────────────────────────────────────────────────
# Allow known origins: local dev + Vercel frontend
# Sử dụng danh sách cụ thể + pattern cho Vercel
_VERCEL_FRONTEND_PATTERN = re.compile(
    r"^https://[-a-zA-Z0-9]*\.vercel\.app$"
)

_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    *list(settings.cors_allow_origins),
]


def _cors_origin_validate(origin: str) -> bool:
    """Check if an origin is allowed (static list or Vercel frontend pattern)."""
    if not origin:
        return True  # Allow non-browser requests (server-to-server)
    if origin in _cors_origins:
        return True
    if _VERCEL_FRONTEND_PATTERN.match(origin):
        return True
    return False


class DynamicCORSMiddleware(CORSMiddleware):
    """CORSMiddleware that dynamically validates Render frontend subdomains."""

    def is_allowed_origin(self, origin: str) -> bool:
        return _cors_origin_validate(origin)


app.add_middleware(
    DynamicCORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(system_router)
app.include_router(analysis_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(xai_router)
app.include_router(alias_router)
