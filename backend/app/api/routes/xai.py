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
    class_label: str | None = Form(None),
    model_id: str | None = Form(None),
    box_w: int | None = Form(None),
    box_h: int | None = Form(None),
    x1: int | None = Form(None),
    y1: int | None = Form(None),
    x2: int | None = Form(None),
    y2: int | None = Form(None),
    image_width: int | None = Form(None),
    image_height: int | None = Form(None),
):
    """
    Tính toán heatmap EigenCAM cho một ảnh tế bào được tải lên.
    
    - **file**: File ảnh tế bào (PNG/JPG)
    - **class_idx**: Index lớp mục tiêu (mặc định là lớp AI dự đoán cao nhất)
    - **class_label**: Tên lớp mục tiêu (ví dụ: "LY", "MO")
    - **model_id**: ID của model (tùy chọn)
    - **box_w / box_h**: Chiều rộng/cao hộp giới hạn tế bào để lọc kích thước
    - **x1 / y1 / x2 / y2**: Tọa độ hộp giới hạn tế bào để kiểm tra chạm biên
    - **image_width / image_height**: Kích thước ảnh gốc
    
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
        "🔍 XAI Request: file=%s, size=%d, target_idx=%s, target_label=%s, box_w=%s, box_h=%s, is_border=%s", 
        file.filename, len(raw_bytes), class_idx, class_label, box_w, box_h,
        f"x1={x1},y1={y1},x2={x2},y2={y2}" if x1 is not None else "No"
    )

    # 2. Lazy import dịch vụ XAI để tránh tiêu tốn RAM khi khởi động server
    from backend.app.services.xai_service import EigenCAMService

    # 3. Chạy xử lý trong threadpool để không block event loop
    def _compute():
        svc = EigenCAMService.get_instance(model_id)
        return svc.compute_eigencam(
            image, 
            class_idx=class_idx,
            class_label=class_label,
            box_w=box_w,
            box_h=box_h,
            x1=x1,
            y1=y1,
            x2=x2,
            y2=y2,
            image_width=image_width,
            image_height=image_height,
        )

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
