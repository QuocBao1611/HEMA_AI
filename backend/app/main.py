"""
main.py - HemaVision AI Backend
"""
import os
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

# ── Suppress noisy TensorFlow/ML warnings at import time ──────────────────
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"          # Suppress TF info/warnings
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"          # Disable oneDNN messages
os.environ["MPLBACKEND"] = "Agg"                   # Non-interactive matplotlib
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib"     # Avoid font cache regeneration
os.environ["TF_CPP_MIN_VLOG_LEVEL"] = "0"          # Suppress verbose logging
os.environ["KMP_WARNINGS"] = "0"                   # Suppress KMP warnings
os.environ["GRPC_VERBOSITY"] = "ERROR"             # Suppress gRPC noise

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


# ── YOLOv13 / Best9 compatibility layer (lazy-loaded) ──────────────────────
def _patch_ultralytics_modules():
    """Apply YOLOv13 custom layer patches to ultralytics modules.
    This is only needed when loading best9.pt (PyTorch) model.
    ONNX inference does NOT require this patch.
    """
    import torch
    import torch.nn as nn

    class AdaHGConv(nn.Module):
        def __init__(self, c1, c2, k=1, s=1, p=None, g=1, act=True):
            super().__init__()
            self.conv = nn.Conv2d(c1, c2, k, s, p or (k//2), groups=1, bias=False)
            self.bn = nn.BatchNorm2d(c2)
            self.act = nn.SiLU() if act is True else (act if isinstance(act, nn.Module) else nn.Identity())
        def forward(self, x):
            if x.shape[1] != self.conv.in_channels:
                if x.shape[1] < self.conv.in_channels:
                    pad = torch.zeros(x.shape[0], self.conv.in_channels - x.shape[1], x.shape[2], x.shape[3], device=x.device)
                    x = torch.cat([x, pad], dim=1)
                else:
                    x = x[:, :self.conv.in_channels, :, :]
            return self.act(self.bn(self.conv(x)))

    class HyperACE(nn.Module):
        def __init__(self, c1, c2, k=1, s=1, p=None, g=1, act=True):
            super().__init__()
            self.conv = AdaHGConv(c1, c2, k, s, p, g, act)
        def forward(self, x):
            return self.conv(x)

    class AdaHGComputation(nn.Module):
        def __init__(self, c1, c2, *args, **kwargs):
            super().__init__()
            self.conv = AdaHGConv(c1, c2)
        def forward(self, x):
            return self.conv(x)

    class GenericYOLOv13Layer(nn.Module):
        def __init__(self, *args, **kwargs):
            super().__init__()
            if len(args) > 0: self.c1 = args[0]
            if len(args) > 1: self.c2 = args[1]
            c1, c2 = getattr(self, 'c1', None), getattr(self, 'c2', None)
            if c1 and c2 and c1 != c2:
                self.conv = nn.Conv2d(c1, c2, 1, bias=False)
                self.bn = nn.BatchNorm2d(c2)
        def forward(self, x, *args, **kwargs):
            try:
                if isinstance(x, (list, tuple)): x = x[0]
                conv = getattr(self, 'conv', None)
                bn = getattr(self, 'bn', None)
                c2 = getattr(self, 'c2', None)
                if conv:
                    if x.shape[1] != conv.in_channels:
                        if x.shape[1] < conv.in_channels:
                            pad = torch.zeros(x.shape[0], conv.in_channels - x.shape[1], x.shape[2], x.shape[3], device=x.device)
                            x = torch.cat([x, pad], dim=1)
                        else:
                            x = x[:, :conv.in_channels, :, :]
                    x = conv(x)
                    if bn: x = bn(x)
                    return x
                if c2 and x.shape[1] != c2:
                    if x.shape[1] < c2:
                        pad = torch.zeros(x.shape[0], c2 - x.shape[1], x.shape[2], x.shape[3], device=x.device)
                        return torch.cat([x, pad], dim=1)
                    else:
                        return x[:, :c2, :, :]
                return x
            except Exception:
                return x

    class ModuleWrapper:
        def __init__(self, original):
            self.original = original
            self.__name__ = original.__name__
            self.__file__ = getattr(original, "__file__", "")
        def __getattr__(self, name):
            if hasattr(self.original, name):
                return getattr(self.original, name)
            mappings = {
                "AdaHGConv": AdaHGConv,
                "HyperACE": HyperACE,
                "AdaHGComputation": AdaHGComputation,
                "AdaHyperedgeGen": GenericYOLOv13Layer,
                "FullPAD_Tunnel": GenericYOLOv13Layer,
                "FuseModule": GenericYOLOv13Layer,
            }
            if name in mappings: return mappings[name]
            if name and name[0].isupper():
                if name.startswith("DSC3"): return getattr(self.original, "C3k2", self.original.C2f)
                return GenericYOLOv13Layer
            raise AttributeError(f"module {self.original.__name__} has no attribute {name}")

    import ultralytics.nn.modules.block as block
    import ultralytics.nn.modules.conv as conv
    sys.modules['ultralytics.nn.modules.block'] = ModuleWrapper(block)
    sys.modules['ultralytics.nn.modules.conv'] = ModuleWrapper(conv)
    logger.info("Ultralytics modules patched for YOLOv13 compatibility")


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
# Allow known origins: local dev + Render frontend (hmai-frontend)
# Sử dụng allow_origins=["*"] cho đơn giản, vì Render free tier có IP thay đổi
# NHƯNG allow_origins=["*"] không hoạt động với allow_credentials=True
# Nên ta dùng danh sách cụ thể + pattern cho Render

_RENDER_FRONTEND_PATTERN = re.compile(
    r"^https://hmai-frontend[-a-zA-Z0-9]*\.onrender\.com$"
)

_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://hmai-frontend.onrender.com",
    *list(settings.cors_allow_origins),
]


def _cors_origin_validate(origin: str) -> bool:
    """Check if an origin is allowed (static list or Render frontend pattern)."""
    if not origin:
        return True  # Allow non-browser requests (server-to-server)
    if origin in _cors_origins:
        return True
    if _RENDER_FRONTEND_PATTERN.match(origin):
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
app.include_router(alias_router)
