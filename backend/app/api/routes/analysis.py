import asyncio
import gc
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from backend.app.core.config import settings
from backend.app.core.logging import get_logger
from backend.app.core.rate_limit import limiter
from backend.app.core.security import safe_filename, validate_image_upload
from backend.app.services.analysis_service import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_MAX_DETECTIONS,
    DEFAULT_MAX_REGIONS,
    DEFAULT_MIN_COMPONENT_AREA,
    DEFAULT_OVERLAP_RATIO,
    DEFAULT_PADDING_RATIO,
    build_analysis_batch,
    normalize_positive_int,
    normalize_probability_value,
    run_model_comparison,
    run_slide_count_analysis,
    run_yolo_unified_analysis,
    summarize_grid_analysis,
)
from backend.app.services.classifier_service import (
    get_classifier,
    get_classifier_registry,
    parse_model_ids_json,
    preprocess_image,
    read_image_from_bytes,
    vector_to_prediction_items,
)
from backend.app.services.persistence_service import record_analysis

router = APIRouter(prefix="/api/v1", tags=["analysis"])

logger = get_logger("analysis_routes")
inference_semaphore = asyncio.Semaphore(1)  # Only 1 concurrent inference to avoid OOM


def _cleanup_memory() -> None:
    """Force garbage collection after each analysis to free RAM.
    
    Critical for Render Free Tier (512MB RAM). After each inference:
    - Large numpy arrays, tensors, and image data are freed
    - gc.collect() releases memory back to the OS
    """
    gc.collect()
    # Also try to clear any cached large objects
    import ctypes
    try:
        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
    except Exception:
        pass  # malloc_trim not available on all systems (e.g., Alpine Linux)
    logger.debug("Memory cleanup completed")



async def _run_slide_analysis(
    file: UploadFile,
    *,
    confidence_threshold: float,
    padding_ratio: float,
    min_component_area: int,
    max_detections: int,
    model_id: str | None,
) -> dict[str, Any]:
    raw_bytes = await file.read()
    validate_image_upload(file, raw_bytes)

    image = read_image_from_bytes(raw_bytes)
    normalized_threshold = normalize_probability_value(confidence_threshold, "confidence_threshold")
    normalized_padding = normalize_probability_value(padding_ratio, "padding_ratio")
    normalized_min_component_area = normalize_positive_int(
        min_component_area,
        "min_component_area",
        minimum=16,
        maximum=200000,
    )
    normalized_max_detections = normalize_positive_int(
        max_detections,
        "max_detections",
        minimum=1,
        maximum=2000,
    )

    logger.info("Starting full analysis for %s", safe_filename(file.filename))

    # Best9 is a unified YOLO detect+classify model — bypass the standard pipeline
    if str(model_id or "").strip() == "best9":
        async with inference_semaphore:
            def _run_unified() -> dict[str, Any]:
                return run_yolo_unified_analysis(
                    image,
                    filename=file.filename,
                    confidence_threshold=normalized_threshold,
                    max_detections=normalized_max_detections,
                )
            result = await run_in_threadpool(_run_unified)
        record_analysis(
            result,
            {
                "model_id": "best9",
                "confidence_threshold": normalized_threshold,
                "max_detections": normalized_max_detections,
            },
        )
        _cleanup_memory()
        return result

    async with inference_semaphore:
        classifier = get_classifier(model_id)

        def _run_analysis() -> dict[str, Any]:
            return run_slide_count_analysis(
                image,
                filename=file.filename,
                classifier=classifier,
                confidence_threshold=normalized_threshold,
                padding_ratio=normalized_padding,
                min_component_area=normalized_min_component_area,
                max_detections=normalized_max_detections,
            )

        result = await run_in_threadpool(_run_analysis)
    record_analysis(
        result,
        {
            "model_id": classifier.model_id,
            "confidence_threshold": normalized_threshold,
            "padding_ratio": normalized_padding,
            "min_component_area": normalized_min_component_area,
            "max_detections": normalized_max_detections,
        },
    )
    _cleanup_memory()
    return result


@router.post("/predict")
@limiter.limit(settings.inference_rate_limit)
async def predict(
    request: Request,
    file: UploadFile = File(...),
    model_id: str | None = Form(None),
) -> dict[str, Any]:
    raw_bytes = await file.read()
    validate_image_upload(file, raw_bytes)

    logger.info("Starting prediction for %s", safe_filename(file.filename))
    async with inference_semaphore:
        classifier = get_classifier(model_id)
        batch = preprocess_image(raw_bytes, classifier)

        def _predict() -> Any:
            return classifier.model.predict(batch, verbose=0)[0]

        predictions = await run_in_threadpool(_predict)
    prediction_items = vector_to_prediction_items(predictions, classifier.class_names)
    best = prediction_items[0]

    result = {
        "mode": "predict",
        "filename": file.filename,
        "selected_model_id": classifier.model_id,
        "selected_model_name": classifier.display_name,
        "input_shape": classifier.input_shape,
        "preprocessing": classifier.preprocessing,
        "label": best["label"],
        "class_index": best["index"],
        "confidence": best["confidence"],
        "predictions": prediction_items,
    }
    record_analysis(result, {"model_id": classifier.model_id})
    _cleanup_memory()
    return result


@router.post("/analyze-grid")
@limiter.limit(settings.inference_rate_limit)
async def analyze_grid(
    request: Request,
    file: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE_THRESHOLD),
    overlap_ratio: float = Form(DEFAULT_OVERLAP_RATIO),
    max_regions: int = Form(DEFAULT_MAX_REGIONS),
    model_id: str | None = Form(None),
) -> dict[str, Any]:
    raw_bytes = await file.read()
    validate_image_upload(file, raw_bytes)

    normalized_threshold = normalize_probability_value(confidence_threshold, "confidence_threshold")
    normalized_overlap = normalize_probability_value(overlap_ratio, "overlap_ratio")
    if normalized_overlap >= 0.95:
        raise HTTPException(status_code=400, detail="overlap_ratio phải nhỏ hơn 0.95 để tránh quét quá dày.")
    normalized_max_regions = normalize_positive_int(max_regions, "max_regions", minimum=1, maximum=400)

    logger.info("Starting analyze-grid for %s", safe_filename(file.filename))
    async with inference_semaphore:
        classifier = get_classifier(model_id)
        image = read_image_from_bytes(raw_bytes)
        batch, regions, effective_overlap = build_analysis_batch(
            image,
            normalized_overlap,
            normalized_max_regions,
            classifier,
        )

        def _predict_grid() -> Any:
            return classifier.model.predict(batch, verbose=0)

        predictions = await run_in_threadpool(_predict_grid)
        summary = summarize_grid_analysis(predictions, regions, normalized_threshold, classifier)

    result = {
        "mode": "analyze",
        "analysis_mode": "grid_estimation",
        "selected_model_id": classifier.model_id,
        "selected_model_name": classifier.display_name,
        "input_shape": classifier.input_shape,
        "preprocessing": classifier.preprocessing,
        "filename": file.filename,
        "image_size": {"width": image.width, "height": image.height},
        "confidence_threshold": normalized_threshold,
        "requested_overlap_ratio": normalized_overlap,
        "effective_overlap_ratio": effective_overlap,
        "max_regions": normalized_max_regions,
        "analysis_method": "Grid estimation over sliding regions",
        "count_unit": "recognized regions",
        "note": "This is the legacy grid-based estimation mode kept for comparison.",
        **summary,
    }
    record_analysis(
        result,
        {
            "model_id": classifier.model_id,
            "confidence_threshold": normalized_threshold,
            "overlap_ratio": normalized_overlap,
            "max_regions": normalized_max_regions,
        },
    )
    _cleanup_memory()
    return result


@router.post("/diagnose")
@limiter.limit(settings.inference_rate_limit)
async def diagnose(
    request: Request,
    file: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE_THRESHOLD),
    padding_ratio: float = Form(DEFAULT_PADDING_RATIO),
    min_component_area: int = Form(DEFAULT_MIN_COMPONENT_AREA),
    max_detections: int = Form(DEFAULT_MAX_DETECTIONS),
    model_id: str | None = Form(None),
) -> dict[str, Any]:
    return await _run_slide_analysis(
        file=file,
        confidence_threshold=confidence_threshold,
        padding_ratio=padding_ratio,
        min_component_area=min_component_area,
        max_detections=max_detections,
        model_id=model_id,
    )


@router.post("/analyze")
@limiter.limit(settings.inference_rate_limit)
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE_THRESHOLD),
    padding_ratio: float = Form(DEFAULT_PADDING_RATIO),
    min_component_area: int = Form(DEFAULT_MIN_COMPONENT_AREA),
    max_detections: int = Form(DEFAULT_MAX_DETECTIONS),
    model_id: str | None = Form(None),
) -> dict[str, Any]:
    return await _run_slide_analysis(
        file=file,
        confidence_threshold=confidence_threshold,
        padding_ratio=padding_ratio,
        min_component_area=min_component_area,
        max_detections=max_detections,
        model_id=model_id,
    )


@router.post("/compare-models")
@limiter.limit(settings.inference_rate_limit)
async def compare_models(
    request: Request,
    file: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE_THRESHOLD),
    padding_ratio: float = Form(DEFAULT_PADDING_RATIO),
    min_component_area: int = Form(DEFAULT_MIN_COMPONENT_AREA),
    max_detections: int = Form(DEFAULT_MAX_DETECTIONS),
    model_ids_json: str | None = Form(None),
) -> dict[str, Any]:
    raw_bytes = await file.read()
    validate_image_upload(file, raw_bytes)

    image = read_image_from_bytes(raw_bytes)
    normalized_threshold = normalize_probability_value(confidence_threshold, "confidence_threshold")
    normalized_padding = normalize_probability_value(padding_ratio, "padding_ratio")
    normalized_min_component_area = normalize_positive_int(
        min_component_area,
        "min_component_area",
        minimum=16,
        maximum=200000,
    )
    normalized_max_detections = normalize_positive_int(
        max_detections,
        "max_detections",
        minimum=1,
        maximum=2000,
    )

    logger.info("Starting compare-models for %s", safe_filename(file.filename))
    requested_ids = parse_model_ids_json(model_ids_json)
    if not requested_ids:
        requested_ids = list(get_classifier_registry().keys())

    async with inference_semaphore:
        def _run_comparison() -> dict[str, Any]:
            return run_model_comparison(
                image,
                filename=file.filename,
                model_ids=requested_ids,
                confidence_threshold=normalized_threshold,
                padding_ratio=normalized_padding,
                min_component_area=normalized_min_component_area,
                max_detections=normalized_max_detections,
            )

        result = await run_in_threadpool(_run_comparison)
    record_analysis(
        result,
        {
            "model_ids": requested_ids,
            "confidence_threshold": normalized_threshold,
            "padding_ratio": normalized_padding,
            "min_component_area": normalized_min_component_area,
            "max_detections": normalized_max_detections,
        },
    )
    _cleanup_memory()
    return result
