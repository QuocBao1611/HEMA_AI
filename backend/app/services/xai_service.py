"""
xai_service.py — EigenCAM for ONNX models (no gradient needed)
===============================================================
Triển khai kỹ thuật EigenCAM để tạo heatmap giải thích quyết định của AI.
Phù hợp với ONNX vì không yêu cầu autograd/gradients.
Sử dụng model_id từ request để load đúng model ONNX tương ứng.
"""
import base64
import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnx
import onnxruntime as ort
from PIL import Image

from backend.app.core.paths import CLASSIFIER_MODELS_DIR

logger = logging.getLogger(__name__)

TARGET_LAYER_KEYWORDS = [
    "out_relu",
    "block_16_project_BN",
    "block_13_expand_relu",
    "block_13_expand",
    "Conv_1",
]


def _softmax(x: np.ndarray) -> np.ndarray:
    """Stable softmax implementation."""
    e = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e / np.sum(e, axis=-1, keepdims=True)


def _to_base64_png(img_array: np.ndarray) -> str:
    """Convert BGR image array to base64 PNG string."""
    success, buf = cv2.imencode(".png", img_array)
    if not success:
        raise RuntimeError("Failed to encode image to PNG")
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def _find_target_layer_output(model: onnx.ModelProto) -> str | None:
    """Find the output name of the target convolutional layer in ONNX graph."""
    for keyword in TARGET_LAYER_KEYWORDS:
        for node in model.graph.node:
            if keyword.lower() in node.name.lower():
                if node.output:
                    return node.output[0]
    # Fallback: find the last Conv or Relu node before the final Dense layer
    conv_outputs: list[str] = []
    for node in model.graph.node:
        if node.op_type in ("Conv", "Relu", "Clip"):
            if node.output:
                conv_outputs.append(node.output[0])
    return conv_outputs[-1] if conv_outputs else None


def _add_intermediate_output(
    model_path: Path,
    target_output_name: str,
) -> onnx.ModelProto:
    """Add an intermediate output node to the ONNX graph."""
    model = onnx.load(str(model_path))
    existing_outputs = {o.name for o in model.graph.output}
    if target_output_name in existing_outputs:
        return model
    intermediate_info = onnx.helper.make_tensor_value_info(
        target_output_name,
        onnx.TensorProto.FLOAT,
        None,
    )
    model.graph.output.append(intermediate_info)
    return model


# ── EigenCAM Service ───────────────────────────────────────────────────────────

class EigenCAMService:
    """
    Service tính EigenCAM heatmap.
    Mỗi model_id có instance riêng, không dùng singleton chung.
    """

    _instances: dict[str, "EigenCAMService"] = {}

    def __init__(
        self,
        model_path: Path,
        model_id: str,
        input_height: int = 224,
        input_width: int = 224,
        preprocessing: str = "mobilenet_v2",
    ):
        self._model_path = model_path
        self._model_id = model_id
        self._input_height = input_height
        self._input_width = input_width
        self._preprocessing = preprocessing
        self._session: ort.InferenceSession | None = None
        self._input_name: str | None = None
        self._output_names: list[str] | None = None
        self._target_layer_output: str | None = None

    @classmethod
    def get_instance(cls, model_id: str | None = None) -> "EigenCAMService":
        # Dùng classifier_service để resolve model_id → path
        from backend.app.services.classifier_service import get_classifier_registry, get_default_model_id
        registry = get_classifier_registry()

        if model_id and model_id in registry:
            classifier = registry[model_id]
        else:
            # Fallback: lấy model mặc định
            default_id = get_default_model_id()
            classifier = registry[default_id]
            model_id = default_id

        # Nếu classifier là unified (YOLO/detect) hoặc nằm trong thư mục detectors, fallback về default classifier vì các model detector không hỗ trợ EigenCAM
        if classifier.unified or "yolo" in classifier.preprocessing.lower() or "detectors" in str(classifier.loaded_path).replace("\\", "/").lower():
            default_id = get_default_model_id()
            if default_id != model_id and default_id in registry:
                classifier = registry[default_id]
                model_id = default_id

        model_path = classifier.loaded_path

        # Tạo instance mới nếu chưa có
        if model_id not in cls._instances:
            cls._instances[model_id] = cls(
                model_path,
                model_id=model_id,
                input_height=classifier.input_height,
                input_width=classifier.input_width,
                preprocessing=classifier.preprocessing,
            )
        return cls._instances[model_id]

    def _initialize(self) -> None:
        if self._session is not None:
            return

        logger.info("🔬 XAI: Loading ONNX for EigenCAM: %s", self._model_path.name)
        model_proto = onnx.load(str(self._model_path))
        self._target_layer_output = _find_target_layer_output(model_proto)

        if not self._target_layer_output:
            raise RuntimeError(f"Cannot find target layer in {self._model_path.name}")

        modified_model = _add_intermediate_output(self._model_path, self._target_layer_output)

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1

        self._session = ort.InferenceSession(
            modified_model.SerializeToString(),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        self._output_names = [o.name for o in self._session.get_outputs()]

    def compute_eigencam(
        self,
        image: Image.Image | np.ndarray,
        class_idx: int | None = None,
    ) -> dict[str, Any]:
        self._initialize()

        if isinstance(image, np.ndarray):
            img_rgb = image
        else:
            img_rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)

        # 1. Resize dynamically using model's expected shape
        img_resized = cv2.resize(img_rgb, (self._input_width, self._input_height))

        # 2. Add batch dimension
        img_batch = np.expand_dims(img_resized, axis=0)

        # 3. Apply model-specific preprocessing
        from backend.app.services.classifier_service import apply_model_preprocessing
        inp = apply_model_preprocessing(img_batch, self._preprocessing)

        # 4. Transpose if the model expects NCHW (e.g. shape is [batch, 3, H, W])
        input_shape = self._session.get_inputs()[0].shape
        is_nchw = False
        if len(input_shape) == 4:
            if input_shape[1] == 3 or str(input_shape[1]).lower() in ('3', 'c', 'channel', 'channels'):
                is_nchw = True
            elif input_shape[3] == 3 or str(input_shape[3]).lower() in ('3', 'c', 'channel', 'channels'):
                is_nchw = False
            else:
                is_nchw = (self._preprocessing in ("yolo_detect", "resnet50"))

        if is_nchw:
            inp = np.transpose(inp, (0, 3, 1, 2))

        # 5. Run inference
        outputs = self._session.run(self._output_names, {self._input_name: inp.astype(np.float32)})

        logits, feature_maps = None, None
        for out in outputs:
            if len(out.shape) == 2:
                logits = out
            elif len(out.shape) == 4:
                feature_maps = out

        if logits is None or feature_maps is None:
            return {"success": False, "error": "Cannot separate logits and feature maps"}

        raw_output = logits[0]
        is_softmax = np.isclose(np.sum(raw_output), 1.0, atol=1e-3)
        if is_softmax:
            probs = raw_output
        else:
            probs = _softmax(raw_output)

        # Áp dụng Temperature Scaling để đồng bộ độ tự tin với Slide Count
        from backend.app.services.classifier_service import _apply_temperature_scaling
        probs = _apply_temperature_scaling(probs[np.newaxis], self._model_id)[0]

        if class_idx is None:
            class_idx = int(np.argmax(probs))

        # 4. EigenCAM: PCA trên feature maps để tìm vùng quan trọng nhất
        fm = feature_maps[0]  # Bỏ batch dimension

        # Nhận diện định dạng NCHW vs NHWC
        if fm.shape[0] > fm.shape[1] and fm.shape[1] == fm.shape[2]:
            # NCHW: (C, H, W) -> Transpose về (H, W, C)
            fm = np.transpose(fm, (1, 2, 0))
        elif fm.shape[0] == fm.shape[1] and fm.shape[2] > fm.shape[0]:
            # NHWC: (H, W, C) -> Giữ nguyên
            pass

        h, w, c = fm.shape
        fm_flat = fm.reshape(-1, c)  # (H*W, C)

        # Trừ trung bình để chuẩn bị cho PCA
        fm_centered = fm_flat - fm_flat.mean(axis=0)

        try:
            # SVD lấy thành phần chính đầu tiên
            U, S, _ = np.linalg.svd(fm_centered, full_matrices=False)
            cam = (U[:, 0] * S[0]).reshape(h, w)
        except np.linalg.LinAlgError:
            # Fallback nếu SVD lỗi
            cam = fm.mean(axis=-1)

        # 5. ReLU + Normalize + Upsample
        cam = np.maximum(cam, 0)
        if cam.max() > 0:
            cam = cam / cam.max()
        cam = cv2.resize(cam, (224, 224))

        # 6. Tạo Heatmap và Overlay
        heatmap = cv2.applyColorMap((cam * 255).astype(np.uint8), cv2.COLORMAP_JET)

        # Overlay lên ảnh gốc (BGR cho OpenCV)
        img_resized_bgr = cv2.resize(img_rgb, (224, 224))
        img_bgr = cv2.cvtColor(img_resized_bgr, cv2.COLOR_RGB2BGR)
        overlay = cv2.addWeighted(img_bgr, 0.5, heatmap, 0.5, 0)

        # Lấy class names từ classifier_service
        from backend.app.services.classifier_service import get_classifier_registry
        registry = get_classifier_registry()
        if self._model_id in registry:
            class_names = registry[self._model_id].class_names
        else:
            class_names = ["BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PLT", "PMY", "RBC", "SNE"]

        nc = min(len(probs), len(class_names))
        return {
            "success": True,
            "top_class": class_names[class_idx] if class_idx < nc else f"class_{class_idx}",
            "confidence": float(probs[class_idx]),
            "calibrated_probs": {class_names[i]: float(probs[i]) for i in range(nc)},
            "heatmap_b64": _to_base64_png(heatmap),
            "overlay_b64": _to_base64_png(overlay),
        }

    def release(self):
        """Giải phóng bộ nhớ."""
        self._session = None
        self._target_layer_output = None

    @classmethod
    def reset(cls):
        """Xóa tất cả instances và giải phóng tài nguyên."""
        for inst in cls._instances.values():
            inst.release()
        cls._instances.clear()
