"""
classifier_service.py — ONNX-only version
==========================================
Đã loại bỏ hoàn toàn tensorflow và ultralytics.
Tất cả models phải ở định dạng .onnx trước khi deploy.

Script convert: scripts/convert_to_onnx.py
"""
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


import numpy as np
import onnxruntime as ort
from fastapi import HTTPException
from PIL import Image

from backend.app.core.paths import (
    CLASS_NAMES_PATH,
    CLASSIFIER_MODELS_DIR,
    DATASET_CLASSES_DIR_CANDIDATES,
    DETECTOR_MODELS_DIR,
    IGNORED_ROOT_DIRS,
    MODEL_MANIFEST_PATH,
    PROJECT_ROOT,
)

REMOVE_CONFIG_KEYS = {"optional", "quantization_config"}
DEFAULT_MODEL_PREPROCESSING = "mobilenet_v2"
RESAMPLING = getattr(Image, "Resampling", Image)


# ── ONNX Session Options (shared) ──────────────────────────────────────────
def _make_session_options() -> ort.SessionOptions:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1          # Render Free: 0.1 vCPU shared
    opts.inter_op_num_threads = 1
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return opts


# ── OnnxClassifierAdapter ───────────────────────────────────────────────────
class OnnxClassifierAdapter:
    """
    Unified ONNX inference adapter cho cả TF/Keras và YOLO models đã convert.
    Thread-safe (ort.InferenceSession là thread-safe sau khi khởi tạo).
    """

    def __init__(self, model_path: Path):
        self.model_path = model_path
        self._session: ort.InferenceSession | None = None
        self._input_name: str | None = None

    def _load(self) -> ort.InferenceSession:
        if self._session is None:
            if not self.model_path.exists() or self.model_path.stat().st_size == 0:
                raise HTTPException(
                    status_code=503,
                    detail=f"Model file không tìm thấy hoặc rỗng: {self.model_path.name}",
                )
            self._session = ort.InferenceSession(
                str(self.model_path),
                sess_options=_make_session_options(),
                providers=["CPUExecutionProvider"],
            )
            self._input_name = self._session.get_inputs()[0].name
        return self._session

    @property
    def input_name(self) -> str:
        self._load()
        return self._input_name  # type: ignore[return-value]

    def predict(self, batch: np.ndarray, verbose: int | bool = 0) -> np.ndarray:
        """
        Args:
            batch: shape (N, H, W, C) float32, đã qua preprocessing
        Returns:
            shape (N, num_classes) float32
        """
        sess = self._load()
        outputs = sess.run(None, {self._input_name: batch.astype(np.float32)})
        return np.asarray(outputs[0], dtype=np.float32)


# ── LoadedClassifier dataclass ──────────────────────────────────────────────
@dataclass
class LoadedClassifier:
    model_id: str
    display_name: str
    source_path: Path
    loaded_path: Path
    model: OnnxClassifierAdapter
    input_height: int
    input_width: int
    num_classes: int
    class_names: list[str]
    preprocessing: str
    unified: bool = False

    @property
    def input_shape(self) -> list[int]:
        return [self.input_height, self.input_width, 3]


# ── Registry globals ─────────────────────────────────────────────────────────
_CLASSIFIER_REGISTRY: dict[str, LoadedClassifier] | None = None
_DEFAULT_MODEL_ID: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────
def slugify_model_id(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return normalized or "model"


def discover_model_paths() -> list[Path]:
    """Scan .onnx files trong classifiers và detectors directories."""
    discovered: list[Path] = []

    if CLASSIFIER_MODELS_DIR.exists():
        for path in sorted(CLASSIFIER_MODELS_DIR.glob("*.onnx")):
            if "_sanitized" in path.stem:
                continue
            discovered.append(path)

    if DETECTOR_MODELS_DIR.exists():
        for path in sorted(DETECTOR_MODELS_DIR.glob("*.onnx")):
            if "_sanitized" in path.stem:
                continue
            discovered.append(path)

    if not discovered:
        raise RuntimeError(
            "Không tìm thấy file model .onnx trong thư mục models/classifiers/ hoặc models/detectors/. "
            "Chạy scripts/convert_to_onnx.py trước."
        )
    return sorted(discovered, key=lambda p: p.stat().st_mtime, reverse=True)




def load_model_manifest() -> dict[str, dict[str, Any]]:
    if not MODEL_MANIFEST_PATH.exists():
        return {}
    with MODEL_MANIFEST_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    manifest_payload = payload.get("models") if isinstance(payload, dict) and "models" in payload else payload
    if not isinstance(manifest_payload, dict):
        raise RuntimeError("model_manifest.json phải là object hoặc có khóa 'models'.")
    return {str(k): v for k, v in manifest_payload.items() if isinstance(v, dict)}


def resolve_preprocessing_name(model_path: Path, manifest_entry: dict[str, Any]) -> str:
    configured = str(manifest_entry.get("preprocessing", "")).strip().lower()
    if configured:
        return configured
    stem = model_path.stem.lower()
    if "efficientnet" in stem:   return "efficientnet"
    if "resnet"       in stem:   return "resnet50"
    if "densenet"     in stem:   return "densenet"
    if "xception"     in stem:   return "xception"
    if "inception"    in stem:   return "inception_v3"
    if "mobilenet"    in stem:   return "mobilenet_v2"
    if "best9" in stem or "best (9)" in stem: return "yolo_detect"
    if "yolo" in stem:           return "yolo_detect"
    return DEFAULT_MODEL_PREPROCESSING


def load_class_names_from_dataset(num_classes: int) -> list[str] | None:
    for dataset_dir in DATASET_CLASSES_DIR_CANDIDATES:
        if not dataset_dir.exists():
            continue
        if dataset_dir == PROJECT_ROOT:
            class_dirs = sorted(
                p.name for p in dataset_dir.iterdir()
                if p.is_dir() and p.name not in IGNORED_ROOT_DIRS
            )
        else:
            class_dirs = sorted(p.name for p in dataset_dir.iterdir() if p.is_dir())
        if len(class_dirs) == num_classes:
            return class_dirs
    return None


def load_class_names(num_classes: int) -> list[str]:
    from_dataset = load_class_names_from_dataset(num_classes)
    if from_dataset is not None:
        return from_dataset
    if CLASS_NAMES_PATH.exists():
        with CLASS_NAMES_PATH.open("r", encoding="utf-8") as f:
            values = json.load(f)
        if isinstance(values, list) and len(values) == num_classes:
            return [str(v) for v in values]
    return [f"class_{i}" for i in range(num_classes)]


def save_default_class_names(values: list[str]) -> None:
    with CLASS_NAMES_PATH.open("w", encoding="utf-8") as f:
        json.dump(values, f, ensure_ascii=False, indent=2)
        f.write("\n")


def is_placeholder_label(label: str, index: int) -> bool:
    normalized = label.strip().lower()
    return normalized in {f"class_{index}", f"class {index}", f"lop {index + 1}"}


def labels_are_configured(values: list[str]) -> bool:
    return any(not is_placeholder_label(label, i) for i, label in enumerate(values))


def display_label_for_index(index: int, labels: list[str]) -> str:
    raw_label = labels[int(index)]
    if is_placeholder_label(raw_label, int(index)):
        return f"Lớp {int(index) + 1} (chưa đặt tên)"
    return raw_label


def serialize_classifier_info(classifier: LoadedClassifier) -> dict[str, Any]:
    return {
        "model_id":         classifier.model_id,
        "display_name":     classifier.display_name,
        "model_path":       classifier.source_path.name,
        "loaded_model_path": classifier.loaded_path.name,
        "input_shape":      classifier.input_shape,
        "num_classes":      classifier.num_classes,
        "preprocessing":    classifier.preprocessing,
        "unified":          classifier.unified,
    }


# ── Load single model from .onnx ────────────────────────────────────────────
def _load_onnx_classifier(model_path: Path, manifest_entry: dict[str, Any]) -> LoadedClassifier:
    """
    Load một .onnx model và trả về LoadedClassifier.
    Đọc input/output shape trực tiếp từ ONNX graph.
    """
    adapter = OnnxClassifierAdapter(model_path)
    sess = adapter._load()

    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]

    # Lấy shape từ ONNX graph (có thể có dim dynamic = None/string)
    raw_in_shape = inp.shape    # e.g. [1, 224, 224, 3] hoặc ['batch', 224, 224, 3]
    raw_out_shape = out.shape   # e.g. [1, 14]

    # Manifest override takes priority, fall back to ONNX graph shape
    configured_shape = manifest_entry.get("input_shape")
    if configured_shape and len(configured_shape) >= 2:
        input_height = int(configured_shape[0])
        input_width  = int(configured_shape[1])
    else:
        # NHWC: [batch, H, W, C] — index 1,2
        try:
            input_height = int(raw_in_shape[1]) if not isinstance(raw_in_shape[1], str) else 224
            input_width  = int(raw_in_shape[2]) if not isinstance(raw_in_shape[2], str) else 224
        except (IndexError, ValueError):
            input_height, input_width = 224, 224

    configured_classes = manifest_entry.get("num_classes")
    if configured_classes:
        num_classes = int(configured_classes)
    else:
        try:
            num_classes = int(raw_out_shape[-1]) if not isinstance(raw_out_shape[-1], str) else 14
        except (IndexError, ValueError):
            num_classes = 14

    class_names = load_class_names(num_classes)

    base_id = slugify_model_id(str(manifest_entry.get("model_id") or model_path.stem))
    is_unified = False
    if model_path.stem in ("best9", "best_9"):
        base_id = "best9"
        is_unified = True
        input_height, input_width = 640, 640

    display_name = str(manifest_entry.get("display_name") or model_path.stem.replace("_", " "))
    if base_id == "best9":
        display_name = "Best9 YOLO (unified)"

    return LoadedClassifier(
        model_id=base_id,
        display_name=display_name,
        source_path=model_path,
        loaded_path=model_path,   # no sanitized copy needed for ONNX
        model=adapter,
        input_height=input_height,
        input_width=input_width,
        num_classes=num_classes,
        class_names=class_names,
        preprocessing=resolve_preprocessing_name(model_path, manifest_entry),
        unified=is_unified,
    )


# ── Registry init ────────────────────────────────────────────────────────────
def initialize_classifier_registry() -> tuple[dict[str, LoadedClassifier], str]:
    global _CLASSIFIER_REGISTRY, _DEFAULT_MODEL_ID

    if _CLASSIFIER_REGISTRY is not None and _DEFAULT_MODEL_ID is not None:
        return _CLASSIFIER_REGISTRY, _DEFAULT_MODEL_ID

    manifest = load_model_manifest()
    registry: dict[str, LoadedClassifier] = {}
    used_ids: set[str] = set()

    for model_path in discover_model_paths():
        manifest_entry = manifest.get(model_path.name, {})
        try:
            classifier = _load_onnx_classifier(model_path, manifest_entry)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Bỏ qua model %s: %s", model_path.name, exc
            )
            continue

        candidate_id = classifier.model_id
        suffix = 2
        while candidate_id in used_ids:
            candidate_id = f"{classifier.model_id}_{suffix}"
            suffix += 1
        used_ids.add(candidate_id)
        classifier.model_id = candidate_id
        registry[candidate_id] = classifier

    if not registry:
        raise RuntimeError(
            "Không thể nạp bất kỳ model nào. "
            "Kiểm tra thư mục models/ có chứa file .onnx không."
        )

    _CLASSIFIER_REGISTRY = registry
    _DEFAULT_MODEL_ID = (
        "mobilenetv2_phase2_best" if "mobilenetv2_phase2_best" in registry
        else next(iter(registry))
    )
    return _CLASSIFIER_REGISTRY, _DEFAULT_MODEL_ID


def get_classifier_registry() -> dict[str, LoadedClassifier]:
    registry, _ = initialize_classifier_registry()
    return registry


def get_default_model_id() -> str:
    _, default_model_id = initialize_classifier_registry()
    return default_model_id


def set_default_model(model_id: str) -> str:
    global _DEFAULT_MODEL_ID
    registry = get_classifier_registry()
    if model_id not in registry:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy model_id '{model_id}' trong registry.")
    _DEFAULT_MODEL_ID = model_id
    return _DEFAULT_MODEL_ID


def force_default_model(model_id: str) -> str:
    return set_default_model(model_id)


def get_default_classifier() -> LoadedClassifier:
    registry, default_model_id = initialize_classifier_registry()
    return registry[default_model_id]


def get_classifier(model_id: str | None) -> LoadedClassifier:
    """
    Lấy classifier theo model_id. Lazy-load từng model khi được yêu cầu.
    Không load tất cả models cùng lúc lúc khởi động để tránh OOM trên Render Free (512MB).
    Tuy nhiên, nếu người dùng request compare nhiều models, chúng sẽ được nạp dần vào bộ nhớ.
    """
    global _CLASSIFIER_REGISTRY, _DEFAULT_MODEL_ID

    selected_id = str(model_id or "").strip()

    if _CLASSIFIER_REGISTRY is None:
        _CLASSIFIER_REGISTRY = {}

    if not selected_id:
        if not _CLASSIFIER_REGISTRY:
            # Load default model if registry is empty and no ID provided
            registry, default_id = initialize_classifier_registry()
            return registry[default_id]
        selected_id = _DEFAULT_MODEL_ID or next(iter(_CLASSIFIER_REGISTRY))

    if selected_id in _CLASSIFIER_REGISTRY:
        return _CLASSIFIER_REGISTRY[selected_id]

    # Model chưa có trong registry -> load nó
    manifest = load_model_manifest()
    model_paths = discover_model_paths()

    target_path: Path | None = None
    for mp in model_paths:
        base_id = slugify_model_id(str(manifest.get(mp.name, {}).get("model_id") or mp.stem))
        if mp.stem in ("best9", "best_9"):
            base_id = "best9"
        if base_id == selected_id:
            target_path = mp
            break

    if target_path is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy model_id '{selected_id}'.")

    manifest_entry = manifest.get(target_path.name, {})
    classifier = _load_onnx_classifier(target_path, manifest_entry)

    _CLASSIFIER_REGISTRY[classifier.model_id] = classifier
    if not _DEFAULT_MODEL_ID:
        _DEFAULT_MODEL_ID = classifier.model_id
        
    return classifier

def evict_classifier(model_id: str) -> None:
    """
    Xóa model khỏi registry và giải phóng ONNX session khỏi bộ nhớ.
    Dùng sau mỗi bước trong quá trình so sánh để tránh OOM.
    """
    global _CLASSIFIER_REGISTRY
    if _CLASSIFIER_REGISTRY is None:
        return
    clf = _CLASSIFIER_REGISTRY.pop(model_id, None)
    if clf is not None:
        # Free the ONNX InferenceSession
        if hasattr(clf.model, "_session") and clf.model._session is not None:
            clf.model._session = None


def parse_model_ids_json(model_ids_json: str | None) -> list[str]:
    if not model_ids_json:
        return []
    try:
        payload = json.loads(model_ids_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="model_ids_json phải là JSON array hợp lệ.") from exc
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="model_ids_json phải là JSON array.")
    return [str(item).strip() for item in payload if str(item).strip()]


def get_comparison_classifiers(model_ids_json: str | None) -> list[LoadedClassifier]:
    requested_ids = parse_model_ids_json(model_ids_json)
    if not requested_ids:
        return list(get_classifier_registry().values())
    return [get_classifier(mid) for mid in requested_ids]


def get_default_runtime_info() -> dict[str, Any]:
    classifier = get_default_classifier()
    return {
        "default_model_id":   classifier.model_id,
        "default_model_name": classifier.display_name,
        "model_path":         classifier.source_path.name,
        "loaded_model_path":  classifier.loaded_path.name,
        "input_shape":        classifier.input_shape,
        "num_classes":        classifier.num_classes,
        "preprocessing":      classifier.preprocessing,
    }


# ── Image preprocessing (NumPy-only, no TensorFlow) ─────────────────────────
def apply_model_preprocessing(batch: np.ndarray, preprocessing_name: str) -> np.ndarray:
    """
    Tái tạo TF Keras preprocessing bằng NumPy thuần — không cần tensorflow.

    Tất cả formulas được lấy từ Keras source (keras/applications/<name>.py).
    """
    name = str(preprocessing_name or DEFAULT_MODEL_PREPROCESSING).strip().lower()

    if name == "mobilenet_v2":
        # tf.keras.applications.mobilenet_v2.preprocess_input:
        # x / 127.5 - 1.0  → range [-1, 1]
        return (np.asarray(batch, dtype=np.float32) / 127.5) - 1.0

    if name in ("resnet50", "resnet"):
        # tf.keras.applications.resnet50.preprocess_input:
        # BGR mean subtract (ImageNet), input assumed RGB
        b = np.asarray(batch, dtype=np.float32)[..., ::-1]   # RGB → BGR
        mean = np.array([103.939, 116.779, 123.68], dtype=np.float32)
        return b - mean

    if name == "densenet":
        # tf.keras.applications.densenet.preprocess_input:
        # x / 127.5 - 1.0 (same as mobilenet_v2)
        return (np.asarray(batch, dtype=np.float32) / 127.5) - 1.0

    if name == "efficientnet":
        # tf.keras.applications.efficientnet.preprocess_input:
        # No-op (returns input as-is, expects [0,255])
        return np.asarray(batch, dtype=np.float32)

    if name in ("xception", "inception_v3"):
        # tf.keras.applications.xception.preprocess_input:
        # x / 127.5 - 1.0 → range [-1, 1]
        return (np.asarray(batch, dtype=np.float32) / 127.5) - 1.0

    if name in ("zero_one", "0_1"):
        return np.asarray(batch, dtype=np.float32) / 255.0

    if name in ("yolo_classify", "yolo_detect", "none"):
        return np.asarray(batch, dtype=np.float32)

    raise RuntimeError(f"Preprocessing '{preprocessing_name}' chưa được hỗ trợ.")


# ── Image I/O ────────────────────────────────────────────────────────────────
def read_image_from_bytes(raw_bytes: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(raw_bytes)) as image:
            return image.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Tệp ảnh không hợp lệ.") from exc


def image_to_array(image: Image.Image, *, classifier: LoadedClassifier) -> np.ndarray:
    resized = image.resize((classifier.input_width, classifier.input_height), RESAMPLING.BILINEAR)
    return np.asarray(resized, dtype=np.float32)


def preprocess_image(raw_bytes: bytes, classifier: LoadedClassifier) -> np.ndarray:
    image = read_image_from_bytes(raw_bytes)
    batch = np.expand_dims(image_to_array(image, classifier=classifier), axis=0)
    return apply_model_preprocessing(batch, classifier.preprocessing)


# ── Prediction helpers ────────────────────────────────────────────────────────
def vector_to_prediction_items(vector: np.ndarray, labels: list[str]) -> list[dict[str, Any]]:
    ranked_indices = np.argsort(vector)[::-1]
    return [
        {
            "index":      int(index),
            "label":      display_label_for_index(int(index), labels),
            "raw_label":  labels[int(index)],
            "confidence": float(vector[int(index)]),
        }
        for index in ranked_indices
    ]


def update_classifier_labels(model_id: str, values: list[str]) -> LoadedClassifier:
    classifier = get_classifier(model_id)
    if len(values) != classifier.num_classes:
        raise HTTPException(
            status_code=400,
            detail=f"Cần đúng {classifier.num_classes} tên lớp.",
        )
    if any(not str(v).strip() for v in values):
        raise HTTPException(status_code=400, detail="Tên lớp không được để trống.")
    cleaned = [str(v).strip() for v in values]
    classifier.class_names = cleaned
    if classifier.model_id == get_default_model_id():
        save_default_class_names(cleaned)
    return classifier
