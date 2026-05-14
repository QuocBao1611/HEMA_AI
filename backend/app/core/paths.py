from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = PROJECT_ROOT / "backend"
DATABASE_DIR = PROJECT_ROOT / "database"
MODELS_DIR = PROJECT_ROOT / "models"
CLASSIFIER_MODELS_DIR = MODELS_DIR / "classifiers"
DETECTOR_MODELS_DIR = MODELS_DIR / "detectors"
CONFIG_DIR = PROJECT_ROOT / "config"
DATA_DIR = PROJECT_ROOT / "data"
LOGS_DIR = PROJECT_ROOT / "logs"
NOTEBOOKS_DIR = PROJECT_ROOT / "notebooks"
SAMPLES_DIR = PROJECT_ROOT / "samples"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

DATASET_CLASSES_DIR_CANDIDATES = [
    DATA_DIR / "balanced_train_2000",
    DATA_DIR / "balanced_train",
    PROJECT_ROOT / "balanced_train_2000",
    PROJECT_ROOT / "balanced_train",
    PROJECT_ROOT,
]

CLASS_NAMES_PATH = CONFIG_DIR / "class_names.json"
MODEL_MANIFEST_PATH = CONFIG_DIR / "model_manifest.json"
YOLO_MODEL_PATH = DETECTOR_MODELS_DIR / "blood_cell_best.onnx"
START_SERVER_BAT_PATH = SCRIPTS_DIR / "start_server.bat"

IGNORED_ROOT_DIRS = {
    "__pycache__",
    ".venv",
    "balanced_train",
    "balanced_train_2000",
    "backend",
    "database",
    "config",
    "data",
    "logs",
    "models",
    "notebooks",
    "samples",
    "scripts",
}
