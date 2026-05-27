"""
xai.py — XAI API Router
========================
Cung cấp các API endpoint cho tính năng giải thích AI (Explainable AI).
Sử dụng tiền tố /api/v1/xai theo quy chuẩn của hệ thống.
"""
import gc
import logging
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from backend.app.core.logging import get_logger
from backend.app.core.rate_limit import limiter
from backend.app.core.config import settings
from backend.app.core.security import validate_image_upload
from backend.app.services.classifier_service import read_image_from_bytes

logger = get_logger("xai_routes")

# Tiền tố /api/v1/xai nhất quán với các route khác
router = APIRouter(prefix="/api/v1/xai", tags=["XAI"])


@router.post("/gradcam")
@limiter.limit(settings.inference_rate_limit)
async def get_gradcam(
    request: Request,
    file: UploadFile = File(...),
    class_idx: int | None = Form(None),
    model_id: str | None = Form(None),
):
    """
    Tính toán heatmap EigenCAM cho một ảnh tế bào được tải lên.
    
    - **file**: File ảnh tế bào (PNG/JPG)
    - **class_idx**: Index lớp mục tiêu (mặc định là lớp AI dự đoán cao nhất)
    - **model_id**: ID của model (tùy chọn)
    
    Trả về heatmap base64 và thông tin độ tin cậy đã hiệu chuẩn.
    """
    # 1. Đọc và validate ảnh
    raw_bytes = await file.read()
    try:
        validate_image_upload(file, raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    image = read_image_from_bytes(raw_bytes)

    logger.info(
        "🔍 XAI Request: file=%s, size=%d, target_idx=%s", 
        file.filename, len(raw_bytes), class_idx
    )

    # 2. Lazy import dịch vụ XAI để tránh tiêu tốn RAM khi khởi động server
    from backend.app.services.xai_service import EigenCAMService

    # 3. Chạy xử lý trong threadpool để không block event loop
    def _compute():
        svc = EigenCAMService.get_instance(model_id)
        return svc.compute_eigencam(image, class_idx=class_idx)

    try:
        result = await run_in_threadpool(_compute)
    except Exception as exc:
        logger.error("❌ XAI Computation Failed: %s", exc)
        raise HTTPException(
            status_code=500, 
            detail=f"Lỗi khi tính toán heatmap giải thích: {str(exc)}"
        )
    finally:
        # Giải phóng RAM ngay lập tức sau khi xử lý xong (phục vụ Render Free Tier)
        gc.collect()

    # 4. Kiểm tra kết quả
    if not result.get("success"):
        raise HTTPException(
            status_code=500, 
            detail=result.get("error", "XAI failed")
        )

    return result
