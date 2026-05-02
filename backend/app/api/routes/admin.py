from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.api.routes.auth import get_current_user
from backend.app.schemas.labels import LabelsUpdateRequest
from backend.app.services.classifier_service import (
    get_classifier,
    get_classifier_registry,
    get_default_model_id,
    labels_are_configured,
    serialize_classifier_info,
    set_default_model,
    update_classifier_labels,
)
from backend.app.services.persistence_service import (
    load_clinical_flag_rules,
    save_clinical_flag_rules,
    save_default_model_selection,
    save_label_configuration,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def check_admin_role(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ban khong co quyen thuc hien hanh dong nay.",
        )
    return current_user


class SetDefaultModelRequest(BaseModel):
    model_id: str


class ClinicalFlagRulePayload(BaseModel):
    key: str
    enabled: bool = True
    label: str
    source: str
    field: str
    threshold: float = Field(ge=0)
    severity: str
    title: str
    action: str


class ClinicalFlagSettingsPayload(BaseModel):
    rules: list[ClinicalFlagRulePayload]


@router.get("/overview")
async def get_admin_overview(_=Depends(check_admin_role)):
    registry = get_classifier_registry()
    default_classifier = get_classifier(get_default_model_id())
    return {
        "default_model_id": default_classifier.model_id,
        "models": [serialize_classifier_info(model) for model in registry.values()],
        "default_labels": {
            "model_id": default_classifier.model_id,
            "display_name": default_classifier.display_name,
            "num_classes": default_classifier.num_classes,
            "class_names": default_classifier.class_names,
            "labels_configured": labels_are_configured(default_classifier.class_names),
        },
        "clinical_flag_rules": load_clinical_flag_rules(),
    }


@router.get("/models")
async def list_models(_=Depends(check_admin_role)):
    registry = get_classifier_registry()
    default_id = get_default_model_id()
    return {
        "models": [serialize_classifier_info(model) for model in registry.values()],
        "default_model_id": default_id,
    }


@router.post("/models/default")
async def update_default_model(payload: SetDefaultModelRequest, _=Depends(check_admin_role)):
    new_default = set_default_model(payload.model_id)
    db_saved, db_error = save_default_model_selection(new_default)
    return {
        "message": f"Da chuyen model mac dinh sang {new_default}",
        "default_model_id": new_default,
        "database_saved": db_saved,
        "database_error": db_error,
    }


@router.get("/labels")
async def get_admin_labels(model_id: str | None = None, _=Depends(check_admin_role)):
    classifier = get_classifier(model_id)
    return {
        "model_id": classifier.model_id,
        "display_name": classifier.display_name,
        "num_classes": classifier.num_classes,
        "class_names": classifier.class_names,
        "labels_configured": labels_are_configured(classifier.class_names),
    }


@router.put("/labels")
async def update_admin_labels(
    payload: LabelsUpdateRequest,
    model_id: str | None = None,
    _=Depends(check_admin_role),
):
    classifier = update_classifier_labels(model_id or "", payload.class_names)
    db_saved, db_error = save_label_configuration(
        classifier.model_id,
        classifier.class_names,
    )
    return {
        "message": "Da cap nhat nhan cho model.",
        "model_id": classifier.model_id,
        "display_name": classifier.display_name,
        "num_classes": classifier.num_classes,
        "class_names": classifier.class_names,
        "labels_configured": labels_are_configured(classifier.class_names),
        "database_saved": db_saved,
        "database_error": db_error,
    }


@router.get("/clinical-flags")
async def get_admin_clinical_flags(_=Depends(check_admin_role)):
    return {
        "rules": load_clinical_flag_rules(),
    }


@router.put("/clinical-flags")
async def update_admin_clinical_flags(
    payload: ClinicalFlagSettingsPayload,
    _=Depends(check_admin_role),
):
    cleaned_rules: list[dict[str, Any]] = []
    for rule in payload.rules:
        cleaned_rules.append(
            {
                "key": rule.key.strip(),
                "enabled": bool(rule.enabled),
                "label": rule.label.strip(),
                "source": rule.source.strip(),
                "field": rule.field.strip(),
                "threshold": float(rule.threshold),
                "severity": rule.severity.strip(),
                "title": rule.title.strip(),
                "action": rule.action.strip(),
            }
        )

    db_saved, db_error = save_clinical_flag_rules(cleaned_rules)
    if not db_saved:
        raise HTTPException(
            status_code=500,
            detail=db_error or "Khong the luu clinical flags.",
        )

    return {
        "message": "Da cap nhat nguong clinical flags.",
        "rules": cleaned_rules,
        "database_saved": db_saved,
        "database_error": db_error,
    }
