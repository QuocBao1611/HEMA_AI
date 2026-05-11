"""
analysis_onnx_service.py
────────────────────────
Drop-in replacement cho best9 trong analysis_service.py
Sau khi export ONNX thành công, import module này để thay thế 503.

Tích hợp:
    from analysis_onnx_service import Best9ONNXService
    best9 = Best9ONNXService("models/detectors/best9.onnx")
    result = best9.analyze(image_bytes)
"""

import io
import time
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import cv2
import onnxruntime as ort

logger = logging.getLogger(__name__)


# ── Cấu hình mặc định ─────────────────────────────────────────────────────────
DEFAULT_IMGSZ      = 640
DEFAULT_CONF       = 0.25
DEFAULT_IOU        = 0.45

# Cập nhật theo số class và tên class model của bạn
CELL_CLASS_NAMES = [
    "BA", "BNE", "EO", "ERB", "LY",
    "MMY", "MO", "MY", "PLT", "PMY",
    "RBC", "SNE", "IG", "MYO",
]


class Best9ONNXService:
    """
    Service wrapper cho best9.onnx.
    Thread-safe, lazy-load, tự detect GPU/CPU.
    """

    _instance: Optional["Best9ONNXService"] = None   # singleton

    def __init__(
        self,
        model_path: str = "models/detectors/best9.onnx",
        imgsz: int = DEFAULT_IMGSZ,
        conf_thres: float = DEFAULT_CONF,
        iou_thres: float  = DEFAULT_IOU,
        class_names: list = None,
    ):
        self.model_path  = Path(model_path)
        self.imgsz       = imgsz
        self.conf_thres  = conf_thres
        self.iou_thres   = iou_thres
        self.class_names = class_names or CELL_CLASS_NAMES
        self._session: Optional[ort.InferenceSession] = None

    # ── Singleton helper ───────────────────────────────────────────────────────
    @classmethod
    def get_instance(cls, **kwargs) -> "Best9ONNXService":
        if cls._instance is None:
            cls._instance = cls(**kwargs)
        return cls._instance

    # ── Load model (lazy) ──────────────────────────────────────────────────────
    def _ensure_loaded(self):
        if self._session is not None:
            return

        if not self.model_path.exists() or self.model_path.stat().st_size == 0:
            raise FileNotFoundError(
                f"ONNX model không tìm thấy hoặc file rỗng: {self.model_path}\n"
                f"Đảm bảo file best9.onnx đã được COPY vào Docker image (models/detectors/)."
            )

        providers = []
        available = ort.get_available_providers()
        if "CUDAExecutionProvider" in available:
            providers.append(("CUDAExecutionProvider", {"device_id": 0}))
        providers.append("CPUExecutionProvider")

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = 4

        self._session = ort.InferenceSession(
            str(self.model_path), sess_options=opts, providers=providers
        )
        logger.info(
            f"best9 ONNX loaded | "
            f"provider={self._session.get_providers()[0]} | "
            f"imgsz={self.imgsz}"
        )

    # ── Public API ─────────────────────────────────────────────────────────────
    def analyze(self, image_input) -> dict:
        """
        Nhận ảnh dưới nhiều dạng và trả kết quả detection.

        Args:
            image_input: bytes | np.ndarray | str (file path)

        Returns:
            {
                "success": bool,
                "latency_ms": float,
                "cell_count": int,
                "detections": [...],
                "summary": {...},
                "model_id": "best9",
                "error": str | None,
            }
        """
        t0 = time.perf_counter()

        try:
            self._ensure_loaded()
            image = self._load_image(image_input)
            tensor, meta = self._preprocess(image)
            raw_outputs   = self._run_session(tensor)
            detections    = self._postprocess(raw_outputs, meta)
            summary       = self._summarize(detections)

            latency = (time.perf_counter() - t0) * 1000
            logger.debug(f"best9 inference {latency:.1f}ms | {len(detections)} cells")

            return {
                "success"    : True,
                "latency_ms" : round(latency, 2),
                "cell_count" : len(detections),
                "detections" : detections,
                "summary"    : summary,
                "model_id"   : "best9",
                "error"      : None,
            }

        except FileNotFoundError as e:
            logger.error(str(e))
            return self._error_response("model_not_exported", str(e), t0)
        except Exception as e:
            logger.exception("best9 inference error")
            return self._error_response("inference_error", str(e), t0)

    def is_ready(self) -> bool:
        """Kiểm tra model đã export và sẵn sàng chưa."""
        return self.model_path.exists()

    def health(self) -> dict:
        return {
            "model_id"   : "best9",
            "onnx_exists": self.model_path.exists(),
            "onnx_path"  : str(self.model_path),
            "loaded"     : self._session is not None,
            "providers"  : self._session.get_providers()
                           if self._session else [],
        }

    # ── Internal helpers ───────────────────────────────────────────────────────
    def _load_image(self, image_input) -> np.ndarray:
        if isinstance(image_input, np.ndarray):
            return image_input
        if isinstance(image_input, (str, Path)):
            img = cv2.imread(str(image_input))
            if img is None:
                raise ValueError(f"Không đọc được file: {image_input}")
            return img
        if isinstance(image_input, (bytes, bytearray)):
            arr = np.frombuffer(image_input, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("Không decode được image bytes")
            return img
        raise TypeError(f"image_input không hỗ trợ type: {type(image_input)}")

    def _preprocess(self, image: np.ndarray):
        h0, w0 = image.shape[:2]
        scale  = self.imgsz / max(h0, w0)
        nh, nw = int(h0 * scale), int(w0 * scale)

        resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
        canvas  = np.full((self.imgsz, self.imgsz, 3), 114, dtype=np.uint8)
        pt = (self.imgsz - nh) // 2
        pl = (self.imgsz - nw) // 2
        canvas[pt:pt+nh, pl:pl+nw] = resized

        # canvas is already RGB because it's built from PIL RGB image
        tensor = canvas.astype(np.float32) / 255.0
        tensor = np.transpose(tensor, (2, 0, 1))[np.newaxis]  # NCHW

        meta = {"scale": scale, "pad_top": pt, "pad_left": pl,
                "orig_h": h0, "orig_w": w0}
        return tensor, meta

    def _run_session(self, tensor: np.ndarray) -> list:
        input_name = self._session.get_inputs()[0].name
        return self._session.run(None, {input_name: tensor})

    def _postprocess(self, outputs: list, meta: dict) -> list:
        pred = outputs[0]
        if pred.ndim == 3 and pred.shape[1] < pred.shape[2]:
            pred = np.transpose(pred, (0, 2, 1))
        pred = pred[0]

        scale = meta["scale"]
        pl, pt = meta["pad_left"], meta["pad_top"]
        ow, oh = meta["orig_w"], meta["orig_h"]

        num_classes = len(self.class_names)
        raw_boxes, raw_scores, raw_cls, raw_probs = [], [], [], []

        for det in pred:
            if det.shape[0] == 4 + num_classes:
                cx, cy, w, h = det[:4]
                cls_s = det[4:]
                conf  = cls_s.max()
                cid   = cls_s.argmax()
            else:
                cx, cy, w, h = det[:4]
                obj  = det[4]
                cls_s = det[5:]
                conf  = obj * cls_s.max()
                cid   = cls_s.argmax()

            if conf < self.conf_thres:
                continue

            x1 = np.clip((cx - w/2 - pl) / scale, 0, ow)
            y1 = np.clip((cy - h/2 - pt) / scale, 0, oh)
            x2 = np.clip((cx + w/2 - pl) / scale, 0, ow)
            y2 = np.clip((cy + h/2 - pt) / scale, 0, oh)

            raw_boxes.append([x1, y1, x2 - x1, y2 - y1])
            raw_scores.append(float(conf))
            raw_cls.append(int(cid))
            raw_probs.append(cls_s.tolist())

        if not raw_boxes:
            return []

        indices = cv2.dnn.NMSBoxes(
            raw_boxes, raw_scores, self.conf_thres, self.iou_thres
        )

        detections = []
        for i in (indices.flatten() if len(indices) else []):
            x, y, w, h = raw_boxes[i]
            detections.append({
                "bbox"      : [round(x, 1), round(y, 1),
                               round(x+w, 1), round(y+h, 1)],
                "score"     : round(raw_scores[i], 4),
                "class_id"  : raw_cls[i],
                "class_name": self.class_names[raw_cls[i]]
                              if raw_cls[i] < num_classes
                              else f"class_{raw_cls[i]}",
                "probs": raw_probs[i]
            })
        return detections

    def _summarize(self, detections: list) -> dict:
        from collections import Counter
        counts = Counter(d["class_name"] for d in detections)
        avg_conf = (np.mean([d["score"] for d in detections])
                    if detections else 0.0)
        return {
            "total"     : len(detections),
            "by_class"  : dict(counts),
            "avg_conf"  : round(float(avg_conf), 4),
        }

    @staticmethod
    def _error_response(code: str, message: str, t0: float) -> dict:
        return {
            "success"    : False,
            "latency_ms" : round((time.perf_counter() - t0) * 1000, 2),
            "cell_count" : 0,
            "detections" : [],
            "summary"    : {},
            "model_id"   : "best9",
            "error"      : {"code": code, "message": message},
        }


# ── Patch cho api/routes/analysis.py ──────────────────────────────────────────
"""
Thay thế đoạn 503 trong analysis.py bằng:

    from analysis_onnx_service import Best9ONNXService

    @router.post("/analyze")
    async def analyze(model_id: str, file: UploadFile):
        if model_id == "best9":
            svc = Best9ONNXService.get_instance()
            if not svc.is_ready():
                return JSONResponse(status_code=503, content={
                    "error": "best9 chưa được export sang ONNX",
                    "hint": "Chạy export_best9_onnx.sh"
                })
            img_bytes = await file.read()
            result = svc.analyze(img_bytes)
            if not result["success"]:
                return JSONResponse(status_code=500, content=result)
            return result
        # ... xử lý các model khác
"""
