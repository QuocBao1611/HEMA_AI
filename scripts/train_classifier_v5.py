import os
import sys
import io
import json
from pathlib import Path

# Ensure UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import tensorflow as tf
from tensorflow.keras import layers, models, applications, optimizers
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau

def train_v5_classifier():
    PROJECT_ROOT = Path(__file__).resolve().parents[1]
    DATA_DIR = PROJECT_ROOT / "data" / "balanced_train_2000"
    MODEL_SAVE_DIR = PROJECT_ROOT / "models" / "classifiers"
    MODEL_SAVE_DIR.mkdir(parents=True, exist_ok=True)
    
    H5_MODEL_PATH = MODEL_SAVE_DIR / "blood_cell_model_v5.h5"

    print("=" * 60)
    print("HEMA_AI CLASSIFIER MODEL V5 TRAINING PIPELINE")
    print("=" * 60)
    print(f"Dataset path: {DATA_DIR}")
    print(f"Checkpoint path: {H5_MODEL_PATH}")

    # Check GPU availability
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        print(f"GPU detected: {gpus}. Using GPU for training!")
    else:
        print("No GPU detected. Training on CPU (this will be slower).")

    # 1. DATA PIPELINE
    print("\n[1/4] Preparing Data Generators...")
    IMG_SIZE = (224, 224)
    BATCH_SIZE = 32

    # Train Data Generator with Data Augmentation
    train_datagen = ImageDataGenerator(
        validation_split=0.2,
        rotation_range=30,
        width_shift_range=0.1,
        height_shift_range=0.1,
        zoom_range=0.2,
        horizontal_flip=True,
        fill_mode='nearest',
        preprocessing_function=applications.mobilenet_v2.preprocess_input
    )

    # Validation Data Generator WITHOUT Data Augmentation (for true evaluation)
    val_datagen = ImageDataGenerator(
        validation_split=0.2,
        preprocessing_function=applications.mobilenet_v2.preprocess_input
    )

    # Load datasets
    train_ds = train_datagen.flow_from_directory(
        str(DATA_DIR),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='training',
        seed=42
    )

    val_ds = val_datagen.flow_from_directory(
        str(DATA_DIR),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='validation',
        seed=42
    )

    classes = sorted(list(train_ds.class_indices.keys()))
    print(f"Detected {len(classes)} classes: {classes}")

    # 2. MODEL BUILDING
    print("\n[2/4] Initializing MobileNetV2 architecture...")
    base_model = applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights='imagenet'
    )
    
    # Freeze base model for Phase 1
    base_model.trainable = False

    # Classification Head
    model = models.Sequential([
        layers.Input(shape=(224, 224, 3)),
        base_model,
        layers.GlobalAveragePooling2D(),
        layers.Dropout(0.5),
        layers.Dense(len(classes), activation='softmax')
    ])

    print("\nModel Architecture Summary:")
    model.summary()

    # 3. PHASE 1: TRANSFER LEARNING (FROZEN BASE)
    print("\n[3/4] Starting Phase 1: Training Classification Head...")
    model.compile(
        optimizer=optimizers.Adam(learning_rate=0.001),
        loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
        metrics=['accuracy']
    )

    callbacks_phase1 = [
        ModelCheckpoint(filepath=str(H5_MODEL_PATH), monitor='val_accuracy', save_best_only=True, verbose=1),
        EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True, verbose=1)
    ]

    history_phase1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=10,
        callbacks=callbacks_phase1
    )
    print("Phase 1 training complete!")

    # Load best weights from Phase 1 checkpoint
    if H5_MODEL_PATH.exists():
        print(f"Restoring best weights from Phase 1 checkpoint: {H5_MODEL_PATH}")
        model = models.load_model(str(H5_MODEL_PATH))

    # 4. PHASE 2: FINE-TUNING (UNFROZEN BASE)
    print("\n[4/4] Starting Phase 2: Fine-tuning entire network...")
    # Unfreeze entire network
    base_model.trainable = True
    
    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-5),
        loss=tf.keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
        metrics=['accuracy']
    )

    callbacks_phase2 = [
        ModelCheckpoint(filepath=str(H5_MODEL_PATH), monitor='val_accuracy', save_best_only=True, verbose=1),
        EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=3, min_lr=1e-7, verbose=1)
    ]

    history_phase2 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=20,
        callbacks=callbacks_phase2
    )
    print("Phase 2 training complete!")
    print(f"Final best model saved to: {H5_MODEL_PATH}")

if __name__ == "__main__":
    train_v5_classifier()
