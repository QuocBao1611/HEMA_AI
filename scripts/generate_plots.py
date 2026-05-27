import os
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix

def plot_training_history(history, save_dir):
    """
    Vẽ biểu đồ Accuracy và Loss từ history huấn luyện.
    """
    save_dir = os.path.abspath(save_dir)
    os.makedirs(save_dir, exist_ok=True)

    # 1. Biểu đồ Accuracy
    plt.figure(figsize=(10, 7))
    plt.plot(history.history['accuracy'], label='Training Accuracy', color='#1f77b4', linewidth=2)
    plt.plot(history.history['val_accuracy'], label='Validation Accuracy', color='#ff7f0e', linewidth=2)
    plt.title('Figure 3.4.1.1. Accuracy Chart (Training vs Validation Accuracy)', fontsize=12, pad=15)
    plt.xlabel('Epochs', fontsize=10)
    plt.ylabel('Accuracy', fontsize=10)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend(fontsize=10)
    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'accuracy_curve.png'), dpi=300)
    plt.close()
    print("Saved accuracy_curve.png")

    # 2. Biểu đồ Loss
    plt.figure(figsize=(10, 7))
    plt.plot(history.history['loss'], label='Training Loss', color='#1f77b4', linewidth=2)
    plt.plot(history.history['val_loss'], label='Validation Loss', color='#ff7f0e', linewidth=2)
    plt.title('Figure 3.4.1.2. Loss Chart (Training vs Validation Loss)', fontsize=12, pad=15)
    plt.xlabel('Epochs', fontsize=10)
    plt.ylabel('Loss', fontsize=10)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend(fontsize=10)
    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'loss_curve.png'), dpi=300)
    plt.close()
    print("Saved loss_curve.png")


def plot_confusion_matrix(y_true, y_pred_classes, class_names, save_dir):
    """
    Vẽ Confusion Matrix đã chuẩn hóa (Normalized Confusion Matrix).
    """
    cm = confusion_matrix(y_true, y_pred_classes)
    cm_normalized = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis]

    plt.figure(figsize=(12, 10))
    sns.heatmap(cm_normalized, annot=True, fmt='.2f', cmap='Blues',
                xticklabels=class_names, yticklabels=class_names, cbar=True,
                annot_kws={"size": 9})
    plt.title('Figure 3.4.1.3. Normalized Confusion Matrix', fontsize=12, pad=20)
    plt.xlabel('Predicted Label', fontsize=10, labelpad=10)
    plt.ylabel('True Label', fontsize=10, labelpad=10)
    plt.xticks(rotation=45, ha='right')
    plt.yticks(rotation=0)
    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'confusion_matrix.png'), dpi=300)
    plt.close()
    print("Saved confusion_matrix.png")


def plot_yolo_curves(y_true, y_probs, class_names, save_dir):
    """
    Vẽ F1-Confidence, Precision-Confidence, và Recall-Confidence Curves kiểu YOLO.
    """
    thresholds = np.linspace(0.0, 0.99, 100)
    num_classes = len(class_names)
    
    # Lấy class dự đoán và xác suất lớn nhất cho mỗi sample
    y_pred_classes = np.argmax(y_probs, axis=1)
    y_pred_probs = np.max(y_probs, axis=1)

    precisions_all = []  # shape (100, num_classes)
    recalls_all = []
    f1s_all = []

    for th in thresholds:
        prec_th = []
        rec_th = []
        f1_th = []
        
        for c in range(num_classes):
            # True Positive: Thật sự là c, dự đoán là c, và conf >= th
            tp = np.sum((y_true == c) & (y_pred_classes == c) & (y_pred_probs >= th))
            # False Positive: Thực chất không phải c, dự đoán là c, và conf >= th
            fp = np.sum((y_true != c) & (y_pred_classes == c) & (y_pred_probs >= th))
            # False Negative: Thực chất là c, nhưng dự đoán lệch c HOẶC conf < th
            fn = np.sum((y_true == c) & ((y_pred_classes != c) | (y_pred_probs < th)))

            precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            
            prec_th.append(precision)
            rec_th.append(recall)
            f1_th.append(f1)
            
        precisions_all.append(prec_th)
        recalls_all.append(rec_th)
        f1s_all.append(f1_th)

    precisions_all = np.array(precisions_all)
    recalls_all = np.array(recalls_all)
    f1s_all = np.array(f1s_all)

    # 1. F1-Confidence Curve
    plt.figure(figsize=(10, 7))
    for c in range(num_classes):
        plt.plot(thresholds, f1s_all[:, c], alpha=0.4, label=f'{class_names[c]}' if num_classes <= 14 else None)
    # Đường trung bình (bold)
    mean_f1 = np.mean(f1s_all, axis=1)
    best_idx = np.argmax(mean_f1)
    best_th = thresholds[best_idx]
    best_f1 = mean_f1[best_idx]
    plt.plot(thresholds, mean_f1, color='blue', linewidth=3, label=f'all classes {best_f1:.2f} at {best_th:.2f}')
    
    plt.title('Figure 3.4.1.4. F1-Confidence Curve', fontsize=12, pad=15)
    plt.xlabel('Confidence', fontsize=10)
    plt.ylabel('F1', fontsize=10)
    plt.xlim(0.0, 1.0)
    plt.ylim(0.0, 1.0)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend(loc='lower left', fontsize=8)
    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'F1_curve.png'), dpi=300)
    plt.close()
    print("Saved F1_curve.png")

    # 2. Precision-Confidence Curve
    plt.figure(figsize=(10, 7))
    for c in range(num_classes):
        plt.plot(thresholds, precisions_all[:, c], alpha=0.4, label=f'{class_names[c]}' if num_classes <= 14 else None)
    mean_prec = np.mean(precisions_all, axis=1)
    plt.plot(thresholds, mean_prec, color='blue', linewidth=3, label=f'all classes {mean_prec[0]:.2f} at 0.00')
    
    plt.title('Figure 3.4.1.5. Precision-Confidence Curve', fontsize=12, pad=15)
    plt.xlabel('Confidence', fontsize=10)
    plt.ylabel('Precision', fontsize=10)
    plt.xlim(0.0, 1.0)
    plt.ylim(0.0, 1.0)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend(loc='upper left', fontsize=8)
    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'precision_curve.png'), dpi=300)
    plt.close()
    print("Saved precision_curve.png")

    # 3. Recall-Confidence Curve
    plt.figure(figsize=(10, 7))
    for c in range(num_classes):
        plt.plot(thresholds, recalls_all[:, c], alpha=0.4, label=f'{class_names[c]}' if num_classes <= 14 else None)
    mean_rec = np.mean(recalls_all, axis=1)
    plt.plot(thresholds, mean_rec, color='blue', linewidth=3, label=f'all classes {mean_rec[0]:.2f} at 0.00')
    
    plt.title('Figure 3.4.1.6. Recall-Confidence Curve', fontsize=12, pad=15)
    plt.xlabel('Confidence', fontsize=10)
    plt.ylabel('Recall', fontsize=10)
    plt.xlim(0.0, 1.0)
    plt.ylim(0.0, 1.0)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend(loc='lower left', fontsize=8)
    plt.tight_layout()
    plt.savefig(os.path.join(save_dir, 'recall_curve.png'), dpi=300)
    plt.close()
    print("Saved recall_curve.png")
