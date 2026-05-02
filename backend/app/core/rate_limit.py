from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

RATE_LIMIT_EXCEEDED_MESSAGE = "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau."

limiter = Limiter(key_func=get_remote_address, headers_enabled=False)


def rate_limit_exceeded_handler(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": RATE_LIMIT_EXCEEDED_MESSAGE},
    )
