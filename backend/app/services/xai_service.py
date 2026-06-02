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
    # Find the index of the first global pooling, squeeze, flatten or dense layer
    pooling_idx = len(model.graph.node)
    for idx, node in enumerate(model.graph.node):
        op_lower = node.op_type.lower()
        name_lower = node.name.lower()
        if "global" in op_lower or "global" in name_lower or "flatten" in op_lower or "squeeze" in op_lower or "dense" in name_lower or "fc" in name_lower:
            pooling_idx = idx
            break

    # Search only nodes before the pooling layer (in reverse order)
    nodes_before_pooling = list(enumerate(model.graph.node[:pooling_idx]))

    # 1. Look for specific target layer keywords first (within the valid range)
    for keyword in TARGET_LAYER_KEYWORDS:
        for idx, node in reversed(nodes_before_pooling):
            if keyword.lower() in node.name.lower():
                # Avoid matching first conv 'conv1' or general conv blocks when searching for final conv 'conv_1'
                if keyword.lower() == "conv_1":
                    import re
                    # Match conv_1 as a whole word or separate component (e.g. /conv_1, _conv_1, or exact)
                    if not re.search(r'(?<![a-zA-Z0-9_])conv_1(?![a-zA-Z0-9])', node.name.lower()):
                        continue
                if node.output:
                    return node.output[0]

    # 2. Fallback: last Conv/Relu/Add/Clip node before pooling
    for idx, node in reversed(nodes_before_pooling):
        if node.op_type in ("Conv", "Relu", "Add", "Clip"):
            if node.output:
                return node.output[0]
    return None


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
        class_label: str | None = None,
        box_w: int | None = None,
        box_h: int | None = None,
        x1: int | None = None,
        y1: int | None = None,
        x2: int | None = None,
        y2: int | None = None,
        image_width: int | None = None,
        image_height: int | None = None,
    ) -> dict[str, Any]:
        self._initialize()

        from backend.app.services.classifier_service import get_classifier, image_to_array, apply_model_preprocessing
        classifier = get_classifier(self._model_id)
        class_names = classifier.class_names

        # Resolve class index from class label string to prevent ordering mismatches between frontend and backend
        if class_label and class_label in class_names:
            class_idx = class_names.index(class_label)

        if isinstance(image, np.ndarray):
            image_pil = Image.fromarray(image)
        else:
            image_pil = image.convert("RGB")

        # 1. Resize dynamically using aspect-ratio preserving letterbox (exactly like the model)
        img_resized_arr = image_to_array(image_pil, classifier=classifier)
        img_resized_uint8 = img_resized_arr.astype(np.uint8)

        # 2. Add batch dimension
        img_batch = np.expand_dims(img_resized_arr, axis=0)

        # 3. Apply model-specific preprocessing
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

        # Áp dụng các Heuristics tinh chỉnh của mô hình
        ranked = [
            {
                "index": i,
                "raw_label": class_names[i],
                "label": class_names[i],
                "confidence": float(probs[i]),
            }
            for i in range(len(probs))
        ]
        ranked.sort(key=lambda x: x["confidence"], reverse=True)
        best = ranked[0]

        # H1. Kiểm tra nhân tế bào (WBC hoặc ERB nhưng không nhân -> RBC)
        if best["raw_label"] in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"}:
            from backend.app.services.analysis_service import check_crop_has_nucleus
            if not check_crop_has_nucleus(image_pil):
                rbc_item = next((item for item in ranked if item["raw_label"] == "RBC"), None)
                if rbc_item:
                    best = rbc_item.copy()
                    best["confidence"] = max(ranked[0]["confidence"], 0.75)

        # H2. Hạn chế nhiễu kích thước nhỏ (Bạch cầu kích thước quá bé -> PLT hoặc RBC)
        if box_w is not None and box_h is not None:
            is_ext_small = (box_w <= 45 and box_h <= 45)
            is_large_wbc_but_small_size = (box_w <= 70 and box_h <= 70) and (best["raw_label"] in {"BA", "BNE", "EO", "IG", "MMY", "MO", "MY", "MYO", "PMY", "SNE"})
            
            if (is_ext_small and best["raw_label"] in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"} or is_large_wbc_but_small_size):
                plt_item = next((item for item in ranked if item["raw_label"] == "PLT"), None)
                rbc_item = next((item for item in ranked if item["raw_label"] == "RBC"), None)
                plt_conf = plt_item["confidence"] if plt_item else 0.0
                rbc_conf = rbc_item["confidence"] if rbc_item else 0.0
                if plt_conf >= rbc_conf:
                    if plt_item:
                        best = plt_item.copy()
                        best["confidence"] = max(ranked[0]["confidence"], 0.75)
                else:
                    if rbc_item:
                        best = rbc_item.copy()
                        best["confidence"] = max(ranked[0]["confidence"], 0.75)

        # H3. Tế bào chạm biên (WBC/ERB chạm biên -> RBC để tránh méo cạnh)
        if x1 is not None and y1 is not None and x2 is not None and y2 is not None and image_width is not None and image_height is not None:
            is_real_slide = (image_width > 350 and image_height > 350)
            box_w_val = x2 - x1
            box_h_val = y2 - y1
            is_small_cell = (box_w_val <= 40 and box_h_val <= 40)
            is_border = (
                x1 <= 3 or 
                y1 <= 3 or 
                x2 >= image_width - 3 or 
                y2 >= image_height - 3
            )
            
            if is_border and is_real_slide and is_small_cell and best["raw_label"] in {"BA", "BNE", "EO", "ERB", "IG", "LY", "MMY", "MO", "MY", "MYO", "PMY", "SNE"}:
                rbc_item = next((item for item in ranked if item["raw_label"] == "RBC"), None)
                if rbc_item:
                    best = rbc_item.copy()
                    best["confidence"] = max(ranked[0]["confidence"], 0.51)

        # Cập nhật lại vector xác suất dựa trên điều chỉnh heuristic
        if best["index"] != np.argmax(probs):
            new_conf = best["confidence"]
            old_conf = probs[best["index"]]
            remaining_sum = 1.0 - new_conf
            current_other_sum = np.sum(probs) - old_conf
            if current_other_sum > 0:
                probs = probs * (remaining_sum / current_other_sum)
            else:
                probs = np.ones_like(probs) * (remaining_sum / (len(probs) - 1))
            probs[best["index"]] = new_conf

        if class_idx is None:
            class_idx = best["index"]

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

        try:
            # SVD lấy thành phần chính đầu tiên trên bản đồ kích hoạt thô (không center theo đúng thuật toán EigenCAM)
            U, S, _ = np.linalg.svd(fm_flat, full_matrices=False)
            cam = (U[:, 0] * S[0]).reshape(h, w)
            # Đảm bảo dấu của cam là dương (do tính chất ma trận không âm, nhưng SVD có thể trả về dấu âm tùy thuộc thư viện LAPACK)
            if np.mean(cam) < 0:
                cam = -cam
        except np.linalg.LinAlgError:
            cam = fm.mean(axis=-1)

        # 5. ReLU + Normalize + Upsample (Dynamic to target model dimension)
        cam = np.maximum(cam, 0)
        if cam.max() > 0:
            cam = cam / cam.max()
        cam = cv2.resize(cam, (self._input_width, self._input_height))

        # 6. Tạo Heatmap và Overlay
        heatmap = cv2.applyColorMap((cam * 255).astype(np.uint8), cv2.COLORMAP_JET)

        # Overlay lên ảnh gốc (BGR cho OpenCV)
        img_bgr = cv2.cvtColor(img_resized_uint8, cv2.COLOR_RGB2BGR)
        overlay = cv2.addWeighted(img_bgr, 0.5, heatmap, 0.5, 0)

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
