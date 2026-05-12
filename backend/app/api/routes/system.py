import gc
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.app.core.config import settings
from backend.app.db.session import database_health
from backend.app.schemas.labels import LabelsUpdateRequest
from backend.app.services.analysis_service import (
    BEST9_CLASS_LIST,
    DIAGNOSTIC_GROUP_BY_LABEL,
    is_unified_detector,
    list_detector_models,
)
from backend.app.services.classifier_service import (
    get_classifier,
    get_classifier_registry,
    get_default_classifier,
    labels_are_configured,
    serialize_classifier_info,
    update_classifier_labels,
)
from backend.app.services.persistence_service import (
    get_analysis_record,
    list_recent_analyses_filtered,
    load_clinical_flag_rules,
    save_label_configuration,
)

router = APIRouter(prefix="/api/v1", tags=["system"])

# Alias router — mountable without prefix for backward compat (/, /health, /info)
alias_router = APIRouter(tags=["system"])


def _build_lightweight_model_list() -> list:
    """Build model list from file discovery ONLY - no model loading.
    
    CRITICAL: Must NOT call get_classifier_registry() or get_default_classifier()
    as those trigger loading ALL TensorFlow models (~200-400MB each), causing OOM
    on Render Free Tier (512MB RAM).
    
    Models are lazy-loaded on first analysis request only.
    """
    from backend.app.services.classifier_service import discover_model_paths, load_model_manifest, slugify_model_id
    manifest = load_model_manifest()
    model_paths = discover_model_paths()
    
    models = []
    for model_path in model_paths:
        manifest_entry = manifest.get(model_path.name, {})
        base_id = slugify_model_id(str(manifest_entry.get("model_id") or model_path.stem))
        if model_path.name == "best (9).pt" or model_path.stem == "best9":
            base_id = "best9"
        display_name = str(manifest_entry.get("display_name") or model_path.stem.replace("_", " "))
        if base_id == "best9":
            display_name = "Best9 YOLO (unified)"
        models.append({
            "model_id": base_id,
            "display_name": display_name,
            "model_path": model_path.name,
            "loaded_model_path": model_path.name,
            "source_path": model_path.name,
            "preprocessing": str(manifest_entry.get("preprocessing", "mobilenet_v2")),
            "num_classes": int(manifest_entry.get("num_classes", 14)),
            "input_shape": manifest_entry.get("input_shape", [224, 224, 3]),
            "unified": base_id == "best9",
        })

    return models


def _build_available_models() -> list:
    """Return classifier models (Best9 is now included in registry).
    
    WARNING: This triggers loading ALL TensorFlow models. Only call this
    when models are already loaded (e.g., after an analysis request).
    For /info and /health endpoints, use _build_lightweight_model_list() instead.
    """
    return [serialize_classifier_info(c) for c in get_classifier_registry().values()]



@router.get("/", include_in_schema=False)
def root() -> dict[str, Any]:
    return {
        "name": settings.app_name,
        "status": "ok",
        "role": "api",
        "frontend_url": settings.frontend_url,
        "health_url": "/health",
        "docs_url": "/docs",
    }


@router.get("/health")
def health() -> dict[str, Any]:
    """Health check - uses lightweight file discovery, does NOT load ML models.
    
    CRITICAL: Must NOT call get_default_classifier() or get_classifier_registry()
    as those trigger loading ALL TensorFlow models (~200-400MB each), causing OOM
    on Render Free Tier (512MB RAM).
    """
    models = _build_lightweight_model_list()
    default_model = models[0] if models else {}
    return {
        "status": "ok",
        "default_model_id": default_model.get("model_id"),
        "default_model_name": default_model.get("display_name"),
        "model_path": default_model.get("source_path"),
        "input_shape": default_model.get("input_shape"),
        "num_classes": default_model.get("num_classes"),
        "analysis_mode": "slide_count",
        "available_analysis_modes": ["slide_count", "grid_estimation"],
        "preprocessing": default_model.get("preprocessing"),
        "available_models": models,
        "database": database_health(),
    }


def _load_model_benchmarks() -> dict:
    """Load model benchmarks from config file if available."""
    try:
        benchmark_path = Path("config/model_benchmarks.json")
        if benchmark_path.exists():
            with open(benchmark_path, "r", encoding="utf-8") as f:
                return json.load(f).get("benchmarks", {})
    except Exception:
        pass
    return {}

@router.get("/info")
def info() -> dict[str, Any]:
    """System info - uses lightweight file discovery, does NOT load ML models.
    
    CRITICAL: Must NOT call get_default_classifier() or get_classifier_registry()
    as those trigger loading ALL TensorFlow models (~200-400MB each), causing OOM
    on Render Free Tier (512MB RAM).
    """
    models = _build_lightweight_model_list()
    default_model = models[0] if models else {}
    return {
        "default_model_id": default_model.get("model_id"),
        "default_model_name": default_model.get("display_name"),
        "input_shape": default_model.get("input_shape"),
        "num_classes": default_model.get("num_classes"),
        "class_names": BEST9_CLASS_LIST,
        "labels_configured": True,
        "supports_estimated_counts": True,
        "supports_slide_count": True,
        "supports_grid_estimation": True,
        "supports_model_comparison": True,
        "analysis_note": (
            "Default mode is slide_count: detect cell candidates, crop with padding, "
            "then classify each crop with the selected model."
        ),
        "diagnostic_group_map": DIAGNOSTIC_GROUP_BY_LABEL,
        "clinical_flag_rules": load_clinical_flag_rules(),
        "available_models": models,
        "model_benchmarks": _load_model_benchmarks(),
        "database": database_health(),
    }


@router.get("/labels")
def get_labels(model_id: str | None = None) -> dict[str, Any]:
    classifier = get_classifier(model_id)
    return {
        "model_id": classifier.model_id,
        "display_name": classifier.display_name,
        "num_classes": classifier.num_classes,
        "class_names": classifier.class_names,
        "labels_configured": labels_are_configured(classifier.class_names),
    }


@router.post("/labels")
def update_labels(payload: LabelsUpdateRequest, model_id: str | None = None) -> dict[str, Any]:
    classifier = update_classifier_labels(model_id or "", payload.class_names)
    db_saved, db_error = save_label_configuration(
        classifier.model_id,
        classifier.class_names,
    )
    return {
        "message": "Da luu ten lop thanh cong.",
        "model_id": classifier.model_id,
        "display_name": classifier.display_name,
        "num_classes": classifier.num_classes,
        "class_names": classifier.class_names,
        "labels_configured": labels_are_configured(classifier.class_names),
        "database_saved": db_saved,
        "database_error": db_error,
    }


@router.get("/settings/clinical-flags")
def get_clinical_flags() -> dict[str, Any]:
    return {
        "rules": load_clinical_flag_rules(),
        "database": database_health(),
    }


@router.get("/history")
def get_history(
    limit: int = 20,
    model_id: str | None = None,
    mode: str | None = None,
    since_days: int | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit), 100))
    safe_since_days = None if since_days is None else max(1, min(int(since_days), 365))
    return {
        "items": list_recent_analyses_filtered(
            limit=safe_limit,
            model_id=model_id,
            mode=mode,
            since_days=safe_since_days,
        ),
        "database": database_health(),
    }


@router.get("/history/{record_id}")
def get_history_detail(record_id: int) -> dict[str, Any]:
    record = get_analysis_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Khong tim thay ban ghi lich su.")
    return {
        **record,
        "database": database_health(),
    }


# ---------------------------------------------------------------------------
# Backward-compat aliases — mounted WITHOUT /api/v1 prefix in main.py
# so existing clients calling /health, /info, / still work.
# ---------------------------------------------------------------------------

@alias_router.get("/", include_in_schema=False)
def alias_root() -> dict[str, Any]:
    return root()


@alias_router.get("/health", include_in_schema=False)
def alias_health() -> dict[str, Any]:
    return health()


@alias_router.get("/info", include_in_schema=False)
def alias_info() -> dict[str, Any]:
    return info()
