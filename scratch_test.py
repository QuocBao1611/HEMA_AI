import onnxruntime as ort

def check_shape(path):
    try:
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0]
        print(f"{path}: {inp.shape}")
    except Exception as e:
        print(f"{path}: Error - {e}")

check_shape("models/classifiers/mobilenetv2_phase2_best.onnx")
check_shape("models/classifiers/best_model_v2.onnx")
check_shape("models/detectors/best9.onnx")
