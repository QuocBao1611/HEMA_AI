from typing import Any

from fastapi import APIRouter, HTTPException

from backend.app.core.config import settings
from backend.app.db.session import database_health
from backend.app.schemas.labels import LabelsUpdateRequest
from backend.app.services.analysis_service import DIAGNOSTIC_GROUP_BY_LABEL
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


router = APIRouter(tags=["system"])


@router.get("/", include_in_schema=False)
def root() -> dict[str, Any]:
    return {
        "name": settings.app_name,
        "status": "ok",
        "role": "api",
        "frontend_url": "http://127.0.0.1:3000",
        "health_url": "/health",
        "docs_url": "/docs",
    }


@router.get("/health")
def health() -> dict[str, Any]:
    default_classifier = get_default_classifier()
    return {
        "status": "ok",
        "default_model_id": default_classifier.model_id,
        "default_model_name": default_classifier.display_name,
        "model_path": str(default_classifier.source_path.name),
        "loaded_model_path": str(default_classifier.loaded_path.name),
        "input_shape": default_classifier.input_shape,
        "num_classes": default_classifier.num_classes,
        "analysis_mode": "slide_count",
        "available_analysis_modes": ["slide_count", "grid_estimation"],
        "preprocessing": default_classifier.preprocessing,
        "available_models": [
            serialize_classifier_info(classifier)
            for classifier in get_classifier_registry().values()
        ],
        "database": database_health(),
    }


@router.get("/info")
def info() -> dict[str, Any]:
    default_classifier = get_default_classifier()
    return {
        "default_model_id": default_classifier.model_id,
        "default_model_name": default_classifier.display_name,
        "input_shape": default_classifier.input_shape,
        "num_classes": default_classifier.num_classes,
        "class_names": default_classifier.class_names,
        "labels_configured": labels_are_configured(default_classifier.class_names),
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
        "available_models": [
            serialize_classifier_info(classifier)
            for classifier in get_classifier_registry().values()
        ],
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
