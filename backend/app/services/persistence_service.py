from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from backend.app.core.auth_utils import get_password_hash
from backend.app.core.config import settings
from backend.app.db.base import Base
from backend.app.db.models import AnalysisRecord, AppSetting, LabelConfiguration, ModelCatalog, RevokedToken, User
from backend.app.db.session import database_health, engine, mark_database_ready, open_session, ping_database
from backend.app.services.classifier_service import (
    force_default_model,
    get_classifier,
    get_classifier_registry,
    get_default_model_id,
)

CLINICAL_FLAG_SETTINGS_KEY = "clinical_flag_rules"
DEFAULT_CLINICAL_FLAG_RULES = [
    {
        # Tế bào non (IG): Bất kỳ số lượng nào trong mẫu đủ lớn là bất thường
        # Yêu cầu confidence TB >= 40% để tránh báo nhầm từ những ô phân loại yếu
        "key": "ig_present",
        "enabled": True,
        "label": "IG",
        "source": "grouped_counts",
        "field": "count",
        "threshold": 1,
        "min_avg_confidence": 0.40,
        "severity": "critical",
        "title": "Nghi ngờ có tế bào non bất thường",
        "action": "Cần bác sĩ huyết học xem lại tiêu bản và đối chiếu thêm với lâm sàng.",
    },
    {
        # Neutrophil cao: ngưỡng lâm sàng >= 75% trong WBC differential
        # Cần ít nhất 10 WBC phân loại để tỉ lệ có ý nghĩa thống kê
        # warn_threshold: 70-75% = borderline (info), >75% = cảnh báo chính thức
        "key": "ne_high",
        "enabled": True,
        "label": "NE",
        "source": "wbc_differential",
        "field": "ratio",
        "threshold": 0.75,
        "warn_threshold": 0.70,
        "min_sample": 10,
        "severity": "warning",
        "title": "Nghi ngờ nhiễm trùng cấp",
        "action": "Nên đối chiếu thêm với CRP, Procalcitonin và các chỉ số lâm sàng.",
    },
    {
        # Eosinophil cao: ngưỡng lâm sàng >= 5% (bình thường 1-4%)
        # Cần ít nhất 10 WBC, warn_threshold 3% = borderline
        "key": "eo_high",
        "enabled": True,
        "label": "EO",
        "source": "wbc_differential",
        "field": "ratio",
        "threshold": 0.05,
        "warn_threshold": 0.03,
        "min_sample": 10,
        "severity": "warning",
        "title": "Tăng bạch cầu ái toan",
        "action": "Cần xem xét dị ứng, ký sinh trùng hoặc bệnh lý tủy liên quan.",
    },
    {
        # Hồng cầu có nhân (ERB/nRBC): bất kỳ số lượng nào ở người lớn là bất thường
        # Yêu cầu confidence TB >= 40%
        "key": "erb_present",
        "enabled": True,
        "label": "ERB",
        "source": "estimated_counts",
        "field": "count",
        "threshold": 1,
        "min_avg_confidence": 0.40,
        "severity": "warning",
        "title": "Phát hiện hồng cầu có nhân",
        "action": "Nên kiểm tra thêm các nguyên nhân thiếu máu tán huyết hoặc rối loạn tủy.",
    },
    {
        # Basophil cao: ngưỡng lâm sàng >= 1% (bình thường <1%)
        # Cần ít nhất 10 WBC, warn_threshold 0.5% = borderline
        "key": "ba_high",
        "enabled": True,
        "label": "BA",
        "source": "wbc_differential",
        "field": "ratio",
        "threshold": 0.01,
        "warn_threshold": 0.005,
        "min_sample": 10,
        "severity": "warning",
        "title": "Tăng bạch cầu ái kiềm",
        "action": "Cần đối chiếu thêm với bối cảnh tăng sinh tủy và các chỉ số liên quan.",
    },
    {
        # Monocyte cao: >= 12% trong WBC differential (bình thường 2-8%)
        # Cần ít nhất 10 WBC
        "key": "mo_high",
        "enabled": True,
        "label": "MO",
        "source": "wbc_differential",
        "field": "ratio",
        "threshold": 0.12,
        "warn_threshold": 0.10,
        "min_sample": 10,
        "severity": "warning",
        "title": "Tăng bạch cầu đơn nhân",
        "action": "Cần xem xét nhiễm virus, lao, hoặc bệnh lý tự miễn.",
    },
]


def initialize_database() -> tuple[bool, str | None]:
    ok, error = ping_database()
    if not ok:
        return False, error

    if settings.database_auto_create:
        try:
            Base.metadata.create_all(bind=engine)
            mark_database_ready(True, None)
            ensure_default_user()
            return True, None
        except SQLAlchemyError:
            message = "Không thể khởi tạo bảng dữ liệu."
            mark_database_ready(False, message)
            return False, message
    return True, None


def sync_model_catalog() -> tuple[bool, str | None]:
    """Sync model catalog with DB using file discovery only (no model loading).
    
    CRITICAL: This function must NOT call get_classifier_registry() or any 
    function that loads ML models (TensorFlow, PyTorch, ONNX). Model loading 
    happens lazily on first request to avoid OOM on Render Free Tier (512MB RAM).
    """
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    # Use file discovery only - no model loading
    from backend.app.services.classifier_service import discover_model_paths, load_model_manifest, slugify_model_id
    from backend.app.core.paths import YOLO_MODEL_PATH
    
    manifest = load_model_manifest()
    model_paths = discover_model_paths()
    
    # Build a lightweight catalog from file metadata only
    catalog_entries: list[dict] = []
    for model_path in model_paths:
        manifest_entry = manifest.get(model_path.name, {})
        base_id = slugify_model_id(str(manifest_entry.get("model_id") or model_path.stem))
        if model_path.name == "best (9).pt" or model_path.stem == "best9":
            base_id = "best9"
        display_name = str(manifest_entry.get("display_name") or model_path.stem.replace("_", " "))
        if base_id == "best9":
            display_name = str(manifest_entry.get("display_name") or "YOLOv13")
        catalog_entries.append({
            "model_id": base_id,
            "display_name": display_name,
            "source_path": model_path.name,
            "loaded_path": model_path.name,
            "preprocessing": str(manifest_entry.get("preprocessing", "mobilenet_v2")),
            "num_classes": int(manifest_entry.get("num_classes", 14)),
            "input_shape": manifest_entry.get("input_shape", [224, 224, 3]),
        })
    
    default_model_id = "mobilenet_blood_cell" if any(e["model_id"] == "mobilenet_blood_cell" for e in catalog_entries) else ("mobilenetv2_phase2_best" if any(e["model_id"] == "mobilenetv2_phase2_best" for e in catalog_entries) else (catalog_entries[0]["model_id"] if catalog_entries else "best9"))

    try:
        with open_session() as db:
            existing = {
                item.model_id: item
                for item in db.execute(select(ModelCatalog)).scalars().all()
            }
            persisted_default_id = next(
                (item.model_id for item in existing.values() if item.is_default and item.model_id in {e["model_id"] for e in catalog_entries}),
                None,
            )
            if persisted_default_id:
                default_model_id = persisted_default_id
            for entry in catalog_entries:
                record = existing.get(entry["model_id"])
                if record is None:
                    record = ModelCatalog(model_id=entry["model_id"])
                    db.add(record)
                record.display_name = entry["display_name"]
                record.source_path = entry["source_path"]
                record.loaded_path = entry["loaded_path"]
                record.preprocessing = entry["preprocessing"]
                record.num_classes = entry["num_classes"]
                record.input_shape = entry["input_shape"]
                record.is_default = entry["model_id"] == default_model_id
            db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Không thể đồng bộ model catalog với cơ sở dữ liệu."


def save_default_model_selection(model_id: str) -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    try:
        with open_session() as db:
            rows = db.execute(select(ModelCatalog)).scalars().all()
            found = False
            for row in rows:
                row.is_default = row.model_id == model_id
                if row.is_default:
                    found = True
            if not found:
                return False, "Khong the luu model mac dinh vi model khong ton tai trong database."
            db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Khong the luu model mac dinh."


def ensure_default_user() -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    try:
        with open_session() as db:
            admin = db.execute(select(User).where(User.username == "admin")).scalar_one_or_none()
            if admin is None:
                admin = User(
                    username="admin",
                    full_name="System Administrator",
                    hashed_password=get_password_hash("admin123"),
                    role="admin",
                )
                db.add(admin)
                db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Không thể khởi tạo người dùng mặc định."


def get_user_by_username(username: str) -> User | None:
    if not database_health()["ready"]:
        return None
    try:
        with open_session() as db:
            return db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    except SQLAlchemyError:
        return None


def update_user_password(username: str, hashed_password: str) -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]
    try:
        with open_session() as db:
            user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
            if not user:
                return False, "Không tìm thấy người dùng."
            user.hashed_password = hashed_password
            db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Không thể cập nhật mật khẩu."


def is_token_revoked(jti: str) -> bool:
    if not database_health()["ready"]:
        return False
    try:
        with open_session() as db:
            token = db.execute(select(RevokedToken).where(RevokedToken.jti == jti)).scalar_one_or_none()
            return token is not None
    except SQLAlchemyError:
        return False


def revoke_token(jti: str) -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]
    try:
        with open_session() as db:
            if not is_token_revoked(jti):
                db.add(RevokedToken(jti=jti))
                db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Không thể thu hồi token."


def apply_database_label_overrides() -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    try:
        with open_session() as db:
            rows = db.execute(select(LabelConfiguration)).scalars().all()
            for row in rows:
                try:
                    classifier = get_classifier(row.model_id)
                except Exception:
                    continue
                if isinstance(row.class_names, list) and len(row.class_names) == classifier.num_classes:
                    classifier.class_names = [str(item) for item in row.class_names]
        return True, None
    except SQLAlchemyError:
        return False, "Không thể áp dụng cấu hình nhãn từ cơ sở dữ liệu."


def save_label_configuration(model_id: str, class_names: list[str]) -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    try:
        with open_session() as db:
            row = db.execute(
                select(LabelConfiguration).where(LabelConfiguration.model_id == model_id)
            ).scalar_one_or_none()
            if row is None:
                row = LabelConfiguration(model_id=model_id, class_names=class_names)
                db.add(row)
            else:
                row.class_names = class_names
            db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Không thể lưu cấu hình nhãn vào cơ sở dữ liệu."


def load_clinical_flag_rules() -> list[dict[str, Any]]:
    if not database_health()["ready"]:
        return [dict(rule) for rule in DEFAULT_CLINICAL_FLAG_RULES]

    try:
        with open_session() as db:
            row = db.execute(
                select(AppSetting).where(AppSetting.setting_key == CLINICAL_FLAG_SETTINGS_KEY)
            ).scalar_one_or_none()
            if row is None or not isinstance(row.setting_value, dict):
                return [dict(rule) for rule in DEFAULT_CLINICAL_FLAG_RULES]
            rules = row.setting_value.get("rules")
            if not isinstance(rules, list):
                return [dict(rule) for rule in DEFAULT_CLINICAL_FLAG_RULES]
            return [dict(item) for item in rules if isinstance(item, dict)]
    except SQLAlchemyError:
        return [dict(rule) for rule in DEFAULT_CLINICAL_FLAG_RULES]


def save_clinical_flag_rules(rules: list[dict[str, Any]]) -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    try:
        with open_session() as db:
            row = db.execute(
                select(AppSetting).where(AppSetting.setting_key == CLINICAL_FLAG_SETTINGS_KEY)
            ).scalar_one_or_none()
            if row is None:
                row = AppSetting(setting_key=CLINICAL_FLAG_SETTINGS_KEY, setting_value={"rules": rules})
                db.add(row)
            else:
                row.setting_value = {"rules": rules}
            db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Khong the luu cau hinh clinical flags."


def summarize_result_for_history(result: dict[str, Any]) -> dict[str, Any]:
    image_size = result.get("image_size") or {}
    dominant = result.get("dominant_cell_type")
    dominant_label = dominant.get("label") if isinstance(dominant, dict) else dominant

    selected_model_id = result.get("selected_model_id")
    selected_model_name = result.get("selected_model_name")
    detected_cell_count = result.get("detected_cell_count") or result.get("detected_region_count")
    classified_cell_count = result.get("classified_cell_count")
    average_confidence = result.get("average_confidence")

    if result.get("mode") == "compare_models":
        comparison_rows = result.get("comparison_rows") or []
        best_row = result.get("best_by_average_confidence") or (comparison_rows[0] if comparison_rows else None)
        selected_model_id = selected_model_id or (best_row or {}).get("model_id")
        if comparison_rows:
            selected_model_name = selected_model_name or f"So sánh {len(comparison_rows)} mô hình"
            if average_confidence is None:
                average_confidence = sum(float(row.get("average_confidence") or 0) for row in comparison_rows) / len(
                    comparison_rows
                )
            if classified_cell_count is None:
                classified_cell_count = max(int(row.get("classified_cell_count") or 0) for row in comparison_rows)
            if detected_cell_count is None:
                detected_cell_count = result.get("shared_detection", {}).get("box_count") or max(
                    int(row.get("detected_cell_count") or 0) for row in comparison_rows
                )
            dominant_label = dominant_label or (best_row or {}).get("dominant_label")
        else:
            selected_model_name = selected_model_name or "So sánh mô hình"

    return {
        "image_size": image_size,
        "dominant_label": dominant_label,
        "selected_model_id": selected_model_id,
        "selected_model_name": selected_model_name,
        "detected_cell_count": detected_cell_count,
        "classified_cell_count": classified_cell_count,
        "average_confidence": average_confidence,
    }


def record_analysis(result: dict[str, Any], request_payload: dict[str, Any] | None = None) -> tuple[bool, str | None]:
    if not database_health()["ready"]:
        return False, database_health()["last_error"]  # type: ignore[index]

    summary = summarize_result_for_history(result)
    image_size = summary["image_size"]

    try:
        with open_session() as db:
            db.add(
                AnalysisRecord(
                    mode=str(result.get("mode") or "unknown"),
                    analysis_mode=result.get("analysis_mode"),
                    filename=result.get("filename"),
                    model_id=summary["selected_model_id"],
                    model_name=summary["selected_model_name"],
                    image_width=image_size.get("width"),
                    image_height=image_size.get("height"),
                    detected_cell_count=summary["detected_cell_count"],
                    classified_cell_count=summary["classified_cell_count"],
                    average_confidence=summary["average_confidence"],
                    dominant_label=summary["dominant_label"],
                    request_payload=request_payload or {},
                    result_payload=result,
                    notes=result.get("note"),
                )
            )
            db.commit()
        return True, None
    except SQLAlchemyError:
        return False, "Không thể lưu lịch sử phân tích vào cơ sở dữ liệu."


def list_recent_analyses(limit: int | None = None) -> list[dict[str, Any]]:
    return list_recent_analyses_filtered(limit=limit)


def list_recent_analyses_filtered(
    *,
    limit: int | None = None,
    model_id: str | None = None,
    mode: str | None = None,
    since_days: int | None = None,
) -> list[dict[str, Any]]:
    if not database_health()["ready"]:
        return []

    try:
        with open_session() as db:
            size = limit or settings.history_page_size
            query = select(AnalysisRecord)
            if model_id:
                query = query.where(AnalysisRecord.model_id == model_id)
            if mode:
                query = query.where(AnalysisRecord.mode == mode)
            if since_days is not None and since_days > 0:
                from datetime import timedelta

                cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
                query = query.where(AnalysisRecord.created_at >= cutoff)

            rows = db.execute(query.order_by(AnalysisRecord.created_at.desc()).limit(size)).scalars().all()
            return [
                {
                    "id": row.id,
                    "mode": row.mode,
                    "analysis_mode": row.analysis_mode,
                    "filename": row.filename,
                    "model_id": row.model_id,
                    "model_name": row.model_name,
                    "image_width": row.image_width,
                    "image_height": row.image_height,
                    "detected_cell_count": row.detected_cell_count,
                    "classified_cell_count": row.classified_cell_count,
                    "average_confidence": row.average_confidence,
                    "dominant_label": row.dominant_label,
                    "created_at": row.created_at.isoformat() if row.created_at.tzinfo else f"{row.created_at.isoformat()}Z",
                }
                for row in rows
            ]
    except SQLAlchemyError:
        return []


def get_analysis_record(record_id: int) -> dict[str, Any] | None:
    if not database_health()["ready"]:
        return None

    try:
        with open_session() as db:
            row = db.execute(
                select(AnalysisRecord).where(AnalysisRecord.id == record_id)
            ).scalar_one_or_none()
            if row is None:
                return None
            return {
                "id": row.id,
                "mode": row.mode,
                "analysis_mode": row.analysis_mode,
                "filename": row.filename,
                "model_id": row.model_id,
                "model_name": row.model_name,
                "image_width": row.image_width,
                "image_height": row.image_height,
                "detected_cell_count": row.detected_cell_count,
                "classified_cell_count": row.classified_cell_count,
                "average_confidence": row.average_confidence,
                "dominant_label": row.dominant_label,
                "request_payload": row.request_payload,
                "result_payload": row.result_payload,
                "notes": row.notes,
                "created_at": row.created_at.isoformat() if row.created_at.tzinfo else f"{row.created_at.isoformat()}Z",
            }
    except SQLAlchemyError:
        return None
