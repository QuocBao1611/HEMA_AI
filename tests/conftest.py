import io
from pathlib import Path
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
import pytest_asyncio
from PIL import Image

from backend.app.core.rate_limit import limiter


class DummyModel:
    def predict(self, batch, verbose=0):
        if getattr(batch, "ndim", 1) == 4 and batch.shape[0] == 1:
            return np.asarray([[0.91, 0.09]], dtype=np.float32)
        rows = getattr(batch, "shape", [1])[0]
        return np.tile(np.asarray([[0.91, 0.09]], dtype=np.float32), (rows, 1))


def _build_dummy_classifier():
    return SimpleNamespace(
        model_id="dummy_model",
        display_name="Dummy Model",
        source_path=Path("dummy_model.h5"),
        loaded_path=Path("dummy_model_sanitized.h5"),
        model=DummyModel(),
        input_height=32,
        input_width=32,
        input_shape=[32, 32, 3],
        num_classes=2,
        class_names=["NE", "LY"],
        preprocessing="mobilenet_v2",
        unified=False,
    )


@pytest.fixture
def app(monkeypatch):
    import backend.app.api.routes.admin as admin_routes
    import backend.app.api.routes.analysis as analysis_routes
    import backend.app.api.routes.auth as auth_routes
    import backend.app.api.routes.system as system_routes
    import backend.app.main as main_module
    import backend.app.services.classifier_service as classifier_service
    import backend.app.services.analysis_service as analysis_service
    import backend.app.services.persistence_service as persistence_service

    dummy_classifier = _build_dummy_classifier()
    registry = {dummy_classifier.model_id: dummy_classifier}
    dummy_admin = SimpleNamespace(
        username="admin",
        full_name="System Administrator",
        role="admin",
        hashed_password="hashed-admin123",
        is_active=True,
    )
    dummy_user = SimpleNamespace(
        username="user",
        full_name="Regular User",
        role="user",
        hashed_password="hashed-user123",
        is_active=True,
    )
    history_record = {
        "id": 77,
        "mode": "analyze",
        "analysis_mode": "slide_count",
        "filename": "sample.png",
        "model_id": dummy_classifier.model_id,
        "model_name": dummy_classifier.display_name,
        "image_width": 48,
        "image_height": 48,
        "detected_cell_count": 1,
        "classified_cell_count": 1,
        "average_confidence": 0.91,
        "dominant_label": "NE",
        "request_payload": {"model_id": dummy_classifier.model_id},
        "result_payload": {
            "mode": "analyze",
            "filename": "sample.png",
            "selected_model_id": dummy_classifier.model_id,
            "selected_model_name": dummy_classifier.display_name,
        },
        "notes": "Dummy history record",
        "created_at": "2026-04-23T00:00:00+00:00",
    }
    clinical_rules = [
        {
            "key": "ig_present",
            "enabled": True,
            "label": "IG",
            "source": "grouped_counts",
            "field": "count",
            "threshold": 1,
            "severity": "critical",
            "title": "IG detected",
            "action": "Review smear",
        }
    ]

    if hasattr(limiter._storage, "reset"):
        limiter._storage.reset()

    monkeypatch.setattr(classifier_service, "initialize_classifier_registry", lambda: (registry, dummy_classifier.model_id))
    monkeypatch.setattr(analysis_service, "initialize_detection_runtime", lambda: None)
    monkeypatch.setattr(persistence_service, "initialize_database", lambda: (True, None))
    monkeypatch.setattr(persistence_service, "sync_model_catalog", lambda: (True, None))
    monkeypatch.setattr(persistence_service, "apply_database_label_overrides", lambda: (True, None))

    # Patch services
    monkeypatch.setattr(classifier_service, "get_classifier", lambda model_id=None: dummy_classifier)
    monkeypatch.setattr(classifier_service, "get_comparison_classifiers", lambda model_ids_json=None: [dummy_classifier])
    monkeypatch.setattr(classifier_service, "preprocess_image", lambda raw_bytes, classifier: np.zeros((1, classifier.input_height, classifier.input_width, 3), dtype=np.float32))
    monkeypatch.setattr(classifier_service, "vector_to_prediction_items", lambda vector, labels: [{"index": 0, "label": "NE", "raw_label": "NE", "confidence": 0.91}, {"index": 1, "label": "LY", "raw_label": "LY", "confidence": 0.09}])
    monkeypatch.setattr(classifier_service, "read_image_from_bytes", lambda raw_bytes: Image.open(io.BytesIO(raw_bytes)).convert("RGB"))
    
    # Patch routers' copies of service functions
    monkeypatch.setattr(analysis_routes, "get_classifier", lambda model_id=None: dummy_classifier)
    monkeypatch.setattr(analysis_routes, "preprocess_image", lambda raw_bytes, classifier: np.zeros((1, classifier.input_height, classifier.input_width, 3), dtype=np.float32))
    monkeypatch.setattr(analysis_routes, "vector_to_prediction_items", lambda vector, labels: [{"index": 0, "label": "NE", "raw_label": "NE", "confidence": 0.91}, {"index": 1, "label": "LY", "raw_label": "LY", "confidence": 0.09}])
    monkeypatch.setattr(analysis_routes, "read_image_from_bytes", lambda raw_bytes: Image.open(io.BytesIO(raw_bytes)).convert("RGB"))
    monkeypatch.setattr(analysis_routes, "parse_model_ids_json", lambda model_ids_json=None: ["dummy_model"])
    
    monkeypatch.setattr(system_routes, "get_default_classifier", lambda: dummy_classifier)
    monkeypatch.setattr(system_routes, "get_classifier", lambda model_id=None: dummy_classifier)
    monkeypatch.setattr(system_routes, "get_classifier_registry", lambda: registry)
    monkeypatch.setattr(system_routes, "labels_are_configured", lambda labels: True)
    monkeypatch.setattr(system_routes, "serialize_classifier_info", lambda classifier: {"model_id": classifier.model_id, "display_name": classifier.display_name, "model_path": classifier.source_path.name, "loaded_model_path": classifier.loaded_path.name, "input_shape": classifier.input_shape, "num_classes": classifier.num_classes, "preprocessing": classifier.preprocessing})

    monkeypatch.setattr(admin_routes, "get_classifier_registry", lambda: registry)
    monkeypatch.setattr(admin_routes, "get_default_model_id", lambda: dummy_classifier.model_id)
    monkeypatch.setattr(admin_routes, "get_classifier", lambda model_id=None: dummy_classifier)
    monkeypatch.setattr(admin_routes, "labels_are_configured", lambda labels: True)
    monkeypatch.setattr(admin_routes, "serialize_classifier_info", lambda classifier: {"model_id": classifier.model_id, "display_name": classifier.display_name, "model_path": classifier.source_path.name, "loaded_model_path": classifier.loaded_path.name, "input_shape": classifier.input_shape, "num_classes": classifier.num_classes, "preprocessing": classifier.preprocessing})
    # analysis_service mocks
    grid_summary = {
        "detected_cell_count": 2,
        "classified_cell_count": 2,
        "estimated_total_cells": 2,
        "average_confidence": 0.91,
        "average_region_confidence": 0.91,
        "dominant_cell_type": {"label": "NE"},
        "estimated_counts": [{"label": "NE", "count": 2, "ratio": 1.0, "average_confidence": 0.91}],
        "grouped_counts": [{"label": "NE", "count": 2, "ratio": 1.0, "average_confidence": 0.91}],
        "wbc_differential": [{"label": "NE", "count": 2, "ratio": 1.0, "average_confidence": 0.91}],
        "region_predictions": [
            {"region_index": 0, "label": "NE", "confidence": 0.91, "bounds": {"x": 0, "y": 0, "width": 32, "height": 32}},
            {"region_index": 1, "label": "NE", "confidence": 0.91, "bounds": {"x": 16, "y": 16, "width": 32, "height": 32}},
        ],
        "cells": [],
    }
    monkeypatch.setattr(analysis_service, "run_slide_count_analysis", lambda *args, **kwargs: grid_summary)
    monkeypatch.setattr(analysis_service, "build_analysis_batch", lambda *args, **kwargs: (np.zeros((2, 32, 32, 3), dtype=np.float32), [{"x": 0, "y": 0, "width": 32, "height": 32}, {"x": 16, "y": 16, "width": 32, "height": 32}], 0.25))
    monkeypatch.setattr(analysis_service, "summarize_grid_analysis", lambda *args, **kwargs: grid_summary)
    
    # Patch routers' copies of analysis functions
    monkeypatch.setattr(analysis_routes, "run_slide_count_analysis", lambda *args, **kwargs: grid_summary)
    monkeypatch.setattr(analysis_routes, "build_analysis_batch", lambda *args, **kwargs: (np.zeros((2, 32, 32, 3), dtype=np.float32), [{"x": 0, "y": 0, "width": 32, "height": 32}, {"x": 16, "y": 16, "width": 32, "height": 32}], 0.25))
    monkeypatch.setattr(analysis_routes, "summarize_grid_analysis", lambda *args, **kwargs: grid_summary)
    monkeypatch.setattr(analysis_routes, "record_analysis", lambda *args, **kwargs: (True, None))

    # persistence_service mocks
    monkeypatch.setattr(persistence_service, "database_health", lambda: {"enabled": True, "ready": True, "last_error": None})
    monkeypatch.setattr(persistence_service, "load_clinical_flag_rules", lambda: clinical_rules)
    monkeypatch.setattr(persistence_service, "list_recent_analyses_filtered", lambda **kwargs: [history_record])
    monkeypatch.setattr(persistence_service, "get_analysis_record", lambda record_id: history_record if record_id == 77 else None)
    
    # Patch routers' copies of persistence functions
    monkeypatch.setattr(system_routes, "database_health", lambda: {"enabled": True, "ready": True, "last_error": None})
    monkeypatch.setattr(system_routes, "load_clinical_flag_rules", lambda: clinical_rules)
    monkeypatch.setattr(system_routes, "list_recent_analyses_filtered", lambda **kwargs: [history_record])
    monkeypatch.setattr(system_routes, "get_analysis_record", lambda record_id: history_record if record_id == 77 else None)
    monkeypatch.setattr(admin_routes, "load_clinical_flag_rules", lambda: clinical_rules)
    monkeypatch.setattr(admin_routes, "save_clinical_flag_rules", lambda rules: (True, None))
    monkeypatch.setattr(admin_routes, "save_default_model_selection", lambda model_id: (True, None))
    monkeypatch.setattr(admin_routes, "save_label_configuration", lambda model_id, values: (True, None))

    import backend.app.core.auth_utils as auth_utils
    # Auth mocks
    monkeypatch.setattr(persistence_service, "get_user_by_username", lambda username: {"admin": dummy_admin, "user": dummy_user}.get(username))
    monkeypatch.setattr(persistence_service, "is_token_revoked", lambda jti: False)
    monkeypatch.setattr(persistence_service, "revoke_token", lambda jti: (True, None))
    monkeypatch.setattr(auth_utils, "verify_password", lambda plain_password, hashed_password: hashed_password == f"hashed-{plain_password}")
    
    # Patch routers' copies of auth functions
    monkeypatch.setattr(auth_routes, "get_user_by_username", lambda username: {"admin": dummy_admin, "user": dummy_user}.get(username))
    monkeypatch.setattr(auth_routes, "is_token_revoked", lambda jti: False)
    monkeypatch.setattr(auth_routes, "revoke_token", lambda jti: (True, None))
    monkeypatch.setattr(auth_routes, "verify_password", lambda plain_password, hashed_password: hashed_password == f"hashed-{plain_password}")

    monkeypatch.setattr(classifier_service, "get_default_model_id", lambda: dummy_classifier.model_id)
    monkeypatch.setattr(classifier_service, "set_default_model", lambda model_id: model_id)
    monkeypatch.setattr(classifier_service, "update_classifier_labels", lambda model_id, values: SimpleNamespace(**{**dummy_classifier.__dict__, "class_names": values}))
    
    monkeypatch.setattr(admin_routes, "get_default_model_id", lambda: dummy_classifier.model_id)
    monkeypatch.setattr(admin_routes, "set_default_model", lambda model_id: model_id)
    monkeypatch.setattr(admin_routes, "update_classifier_labels", lambda model_id, values: SimpleNamespace(**{**dummy_classifier.__dict__, "class_names": values}))

    return main_module.app


@pytest_asyncio.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client


@pytest.fixture
def image_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (48, 48), color=(240, 240, 240)).save(buffer, format="PNG")
    return buffer.getvalue()
