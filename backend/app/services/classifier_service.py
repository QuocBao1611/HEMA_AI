import io
import json
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import tensorflow as tf
from fastapi import HTTPException
from PIL import Image
from ultralytics import YOLO

from backend.app.core.paths import (
    CLASS_NAMES_PATH,
    CLASSIFIER_MODELS_DIR,
    DATASET_CLASSES_DIR_CANDIDATES,
    IGNORED_ROOT_DIRS,
    MODEL_MANIFEST_PATH,
    PROJECT_ROOT,
)

REMOVE_CONFIG_KEYS = {"optional", "quantization_config"}
DEFAULT_MODEL_PREPROCESSING = "mobilenet_v2"
RESAMPLING = getattr(Image, "Resampling", Image)


@dataclass
class LoadedClassifier:
    model_id: str
    display_name: str
    source_path: Path
    loaded_path: Path
    model: Any
    input_height: int
    input_width: int
    num_classes: int
    class_names: list[str]
    preprocessing: str

    @property
    def input_shape(self) -> list[int]:
        return [self.input_height, self.input_width, 3]


_CLASSIFIER_REGISTRY: dict[str, LoadedClassifier] | None = None
_DEFAULT_MODEL_ID: str | None = None


class YoloClassificationAdapter:
    def __init__(self, model_path: Path):
        self.model_path = model_path
        self._model: YOLO | None = None

    def _load(self) -> YOLO:
        if self._model is None:
            try:
                self._model = YOLO(self.model_path)
            except AttributeError as exc:
                missing = str(exc)
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Không thể nạp Best9 YOLO vì môi trường thiếu custom layer trong checkpoint. "
                        f"Chi tiết: {missing}"
                    ),
                ) from exc
        return self._model

    def predict(self, batch: np.ndarray, verbose: int | bool = 0) -> np.ndarray:
        model = self._load()
        images = [
            Image.fromarray(np.clip(item, 0, 255).astype(np.uint8)).convert("RGB")
            for item in np.asarray(batch)
        ]
        results = model.predict(images, verbose=bool(verbose))
        vectors: list[np.ndarray] = []
        for result in results:
            probs = getattr(result, "probs", None)
            if probs is None:
                raise HTTPException(
                    status_code=500,
                    detail="Best9 YOLO không trả về xác suất phân loại. Hãy kiểm tra checkpoint có phải YOLO classification model không.",
                )
            vectors.append(probs.data.detach().cpu().numpy().astype(np.float32))
        return np.stack(vectors, axis=0)


def _clean_config(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {key: _clean_config(value) for key, value in obj.items() if key not in REMOVE_CONFIG_KEYS}
    if isinstance(obj, list):
        return [_clean_config(item) for item in obj]
    return obj


def discover_model_paths() -> list[Path]:
    search_dirs = [CLASSIFIER_MODELS_DIR]
    if CLASSIFIER_MODELS_DIR != PROJECT_ROOT:
        search_dirs.append(PROJECT_ROOT)

    discovered_candidates: list[Path] = []
    for search_dir in search_dirs:
        if not search_dir.exists():
            continue
        discovered_candidates.extend(
            [path for path in search_dir.glob("*.h5") if "_sanitized" not in path.stem]
        )
        discovered_candidates.extend(
            [path for path in search_dir.glob("*.keras") if "_sanitized" not in path.stem]
        )
        discovered_candidates.extend(
            [path for path in search_dir.glob("*.pt") if "_sanitized" not in path.stem]
        )

    discovered = sorted(
        discovered_candidates,
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not discovered:
        raise RuntimeError("Không tìm thấy file model .h5 hoặc .keras trong thư mục models/classifiers.")
    return discovered


def load_model_manifest() -> dict[str, dict[str, Any]]:
    if not MODEL_MANIFEST_PATH.exists():
        return {}

    with MODEL_MANIFEST_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    manifest_payload = payload.get("models") if isinstance(payload, dict) and "models" in payload else payload
    if not isinstance(manifest_payload, dict):
        raise RuntimeError("model_manifest.json phải là object hoặc có khóa 'models'.")

    manifest: dict[str, dict[str, Any]] = {}
    for key, value in manifest_payload.items():
        if isinstance(value, dict):
            manifest[str(key)] = value
    return manifest


def slugify_model_id(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return normalized or "model"


def build_sanitized_model_path(model_path: Path) -> Path:
    return model_path.with_name(f"{model_path.stem}_sanitized{model_path.suffix}")


def ensure_sanitized_h5_model(model_path: Path, sanitized_path: Path) -> Path:
    if sanitized_path.exists() and sanitized_path.stat().st_mtime >= model_path.stat().st_mtime:
        return sanitized_path

    shutil.copyfile(model_path, sanitized_path)
    with h5py.File(sanitized_path, "r+") as h5_file:
        for attr_name in ("model_config", "training_config"):
            raw_config = h5_file.attrs.get(attr_name)
            if raw_config is None:
                continue
            if isinstance(raw_config, bytes):
                raw_config = raw_config.decode("utf-8")
            cleaned_config = json.dumps(_clean_config(json.loads(raw_config)))
            h5_file.attrs.modify(attr_name, cleaned_config)
    return sanitized_path


def ensure_sanitized_keras_model(model_path: Path, sanitized_path: Path) -> Path:
    if sanitized_path.exists() and sanitized_path.stat().st_mtime >= model_path.stat().st_mtime:
        return sanitized_path

    with zipfile.ZipFile(model_path, "r") as zin, zipfile.ZipFile(
        sanitized_path,
        "w",
        compression=zipfile.ZIP_DEFLATED,
    ) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "config.json":
                config = json.loads(data)
                data = json.dumps(_clean_config(config)).encode("utf-8")
            zout.writestr(info, data)
    return sanitized_path


def ensure_compatible_model(model_path: Path) -> Path:
    if "_sanitized" in model_path.stem:
        return model_path

    sanitized_path = build_sanitized_model_path(model_path)
    if model_path.suffix == ".h5":
        return ensure_sanitized_h5_model(model_path, sanitized_path)
    if model_path.suffix == ".keras":
        return ensure_sanitized_keras_model(model_path, sanitized_path)
    return model_path


def resolve_preprocessing_name(model_path: Path, manifest_entry: dict[str, Any]) -> str:
    configured = str(manifest_entry.get("preprocessing", "")).strip().lower()
    if configured:
        return configured

    stem = model_path.stem.lower()
    if "efficientnet" in stem:
        return "efficientnet"
    if "resnet" in stem:
        return "resnet50"
    if "densenet" in stem:
        return "densenet"
    if "xception" in stem:
        return "xception"
    if "inception" in stem:
        return "inception_v3"
    if "mobilenet" in stem:
        return "mobilenet_v2"
    return DEFAULT_MODEL_PREPROCESSING


def load_class_names_from_dataset(num_classes: int) -> list[str] | None:
    for dataset_dir in DATASET_CLASSES_DIR_CANDIDATES:
        if not dataset_dir.exists():
            continue

        if dataset_dir == PROJECT_ROOT:
            class_dirs = sorted(
                path.name
                for path in dataset_dir.iterdir()
                if path.is_dir() and path.name not in IGNORED_ROOT_DIRS
            )
        else:
            class_dirs = sorted(path.name for path in dataset_dir.iterdir() if path.is_dir())

        if len(class_dirs) == num_classes:
            return class_dirs
    return None


def load_class_names(num_classes: int) -> list[str]:
    dataset_class_names = load_class_names_from_dataset(num_classes)
    if dataset_class_names is not None:
        return dataset_class_names

    if CLASS_NAMES_PATH.exists():
        with CLASS_NAMES_PATH.open("r", encoding="utf-8") as file:
            values = json.load(file)
        if isinstance(values, list) and len(values) == num_classes:
            return [str(item) for item in values]
    return [f"class_{index}" for index in range(num_classes)]


def save_default_class_names(values: list[str]) -> None:
    with CLASS_NAMES_PATH.open("w", encoding="utf-8") as file:
        json.dump(values, file, ensure_ascii=False, indent=2)
        file.write("\n")


def is_placeholder_label(label: str, index: int) -> bool:
    normalized = label.strip().lower()
    return normalized in {f"class_{index}", f"class {index}", f"lop {index + 1}"}


def labels_are_configured(values: list[str]) -> bool:
    return any(not is_placeholder_label(label, index) for index, label in enumerate(values))


def display_label_for_index(index: int, labels: list[str]) -> str:
    raw_label = labels[int(index)]
    if is_placeholder_label(raw_label, int(index)):
        return f"Lớp {int(index) + 1} (chưa đặt tên)"
    return raw_label


def serialize_classifier_info(classifier: LoadedClassifier) -> dict[str, Any]:
    return {
        "model_id": classifier.model_id,
        "display_name": classifier.display_name,
        "model_path": classifier.source_path.name,
        "loaded_model_path": classifier.loaded_path.name,
        "input_shape": classifier.input_shape,
        "num_classes": classifier.num_classes,
        "preprocessing": classifier.preprocessing,
    }


def initialize_classifier_registry() -> tuple[dict[str, LoadedClassifier], str]:
    global _CLASSIFIER_REGISTRY, _DEFAULT_MODEL_ID

    if _CLASSIFIER_REGISTRY is not None and _DEFAULT_MODEL_ID is not None:
        return _CLASSIFIER_REGISTRY, _DEFAULT_MODEL_ID

    manifest = load_model_manifest()
    registry: dict[str, LoadedClassifier] = {}
    used_ids: set[str] = set()

    for model_path in discover_model_paths():
        manifest_entry = manifest.get(model_path.name, {})
        compatible_path = ensure_compatible_model(model_path)
        if model_path.suffix == ".pt":
            configured_shape = manifest_entry.get("input_shape") or [224, 224, 3]
            input_height = int(configured_shape[0])
            input_width = int(configured_shape[1])
            num_classes = int(manifest_entry.get("num_classes") or 14)
            loaded_model = YoloClassificationAdapter(compatible_path)
        else:
            loaded_model = tf.keras.models.load_model(compatible_path)
            input_height = int(loaded_model.input_shape[1])
            input_width = int(loaded_model.input_shape[2])
            num_classes = int(loaded_model.output_shape[-1])
        class_names = load_class_names(num_classes)

        base_id = slugify_model_id(str(manifest_entry.get("model_id") or model_path.stem))
        candidate_id = base_id
        suffix = 2
        while candidate_id in used_ids:
            candidate_id = f"{base_id}_{suffix}"
            suffix += 1
        used_ids.add(candidate_id)

        display_name = str(manifest_entry.get("display_name") or model_path.stem.replace("_", " "))
        registry[candidate_id] = LoadedClassifier(
            model_id=candidate_id,
            display_name=display_name,
            source_path=model_path,
            loaded_path=compatible_path,
            model=loaded_model,
            input_height=input_height,
            input_width=input_width,
            num_classes=num_classes,
            class_names=class_names,
            preprocessing=resolve_preprocessing_name(model_path, manifest_entry),
        )

    if not registry:
        raise RuntimeError("Không thể nạp bất kỳ model classifier nào.")

    _CLASSIFIER_REGISTRY = registry
    _DEFAULT_MODEL_ID = "mobilenetv2_phase2_best" if "mobilenetv2_phase2_best" in registry else next(iter(registry))
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
    selected_id = str(model_id or get_default_model_id()).strip() or get_default_model_id()
    classifier = get_classifier_registry().get(selected_id)
    if classifier is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy model_id '{selected_id}'.")
    return classifier


def parse_model_ids_json(model_ids_json: str | None) -> list[str]:
    if not model_ids_json:
        return []

    try:
        payload = json.loads(model_ids_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="model_ids_json phải là JSON array hợp lệ.") from exc

    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="model_ids_json phải là JSON array.")

    values: list[str] = []
    for item in payload:
        text = str(item).strip()
        if text and text not in values:
            values.append(text)
    return values


def get_comparison_classifiers(model_ids_json: str | None) -> list[LoadedClassifier]:
    requested_ids = parse_model_ids_json(model_ids_json)
    if not requested_ids:
        return list(get_classifier_registry().values())
    return [get_classifier(model_id) for model_id in requested_ids]


def get_default_runtime_info() -> dict[str, Any]:
    classifier = get_default_classifier()
    return {
        "default_model_id": classifier.model_id,
        "default_model_name": classifier.display_name,
        "model_path": classifier.source_path.name,
        "loaded_model_path": classifier.loaded_path.name,
        "input_shape": classifier.input_shape,
        "num_classes": classifier.num_classes,
        "preprocessing": classifier.preprocessing,
    }


def image_to_array(image: Image.Image, *, classifier: LoadedClassifier) -> np.ndarray:
    resized = image.resize((classifier.input_width, classifier.input_height), RESAMPLING.BILINEAR)
    return np.asarray(resized, dtype=np.float32)


def apply_model_preprocessing(batch: np.ndarray, preprocessing_name: str) -> np.ndarray:
    normalized_name = str(preprocessing_name or DEFAULT_MODEL_PREPROCESSING).strip().lower()
    if normalized_name == "mobilenet_v2":
        return tf.keras.applications.mobilenet_v2.preprocess_input(batch)
    if normalized_name == "efficientnet":
        return tf.keras.applications.efficientnet.preprocess_input(batch)
    if normalized_name == "resnet50":
        return tf.keras.applications.resnet50.preprocess_input(batch)
    if normalized_name == "densenet":
        return tf.keras.applications.densenet.preprocess_input(batch)
    if normalized_name == "xception":
        return tf.keras.applications.xception.preprocess_input(batch)
    if normalized_name == "inception_v3":
        return tf.keras.applications.inception_v3.preprocess_input(batch)
    if normalized_name in {"zero_one", "0_1"}:
        return np.asarray(batch, dtype=np.float32) / 255.0
    if normalized_name == "yolo_classify":
        return np.asarray(batch, dtype=np.float32)
    if normalized_name == "none":
        return np.asarray(batch, dtype=np.float32)
    raise RuntimeError(f"Preprocessing '{preprocessing_name}' chưa được hỗ trợ.")


def read_image_from_bytes(raw_bytes: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(raw_bytes)) as image:
            return image.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Tệp ảnh không hợp lệ.") from exc


def preprocess_image(raw_bytes: bytes, classifier: LoadedClassifier) -> np.ndarray:
    image = read_image_from_bytes(raw_bytes)
    batch = np.expand_dims(image_to_array(image, classifier=classifier), axis=0)
    return apply_model_preprocessing(batch, classifier.preprocessing)


def vector_to_prediction_items(vector: np.ndarray, labels: list[str]) -> list[dict[str, Any]]:
    ranked_indices = np.argsort(vector)[::-1]
    return [
        {
            "index": int(index),
            "label": display_label_for_index(int(index), labels),
            "raw_label": labels[int(index)],
            "confidence": float(vector[int(index)]),
        }
        for index in ranked_indices
    ]


def update_classifier_labels(model_id: str, values: list[str]) -> LoadedClassifier:
    classifier = get_classifier(model_id)
    if len(values) != classifier.num_classes:
        raise HTTPException(status_code=400, detail=f"Cần đúng {classifier.num_classes} tên lớp.")
    if any(not str(value).strip() for value in values):
        raise HTTPException(status_code=400, detail="Tên lớp không được để trống.")

    cleaned_values = [str(value).strip() for value in values]
    classifier.class_names = cleaned_values
    if classifier.model_id == get_default_model_id():
        save_default_class_names(cleaned_values)
    return classifier
