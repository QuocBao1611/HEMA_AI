CREATE DATABASE IF NOT EXISTS testmodel_web
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE testmodel_web;

CREATE TABLE IF NOT EXISTS model_catalog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  model_id VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  source_path VARCHAR(255) NOT NULL,
  loaded_path VARCHAR(255) NOT NULL,
  preprocessing VARCHAR(120) NOT NULL,
  num_classes INT NOT NULL,
  input_shape JSON NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS label_configurations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  model_id VARCHAR(120) NOT NULL UNIQUE,
  class_names JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mode VARCHAR(50) NOT NULL,
  analysis_mode VARCHAR(50) NULL,
  filename VARCHAR(255) NULL,
  model_id VARCHAR(120) NULL,
  model_name VARCHAR(255) NULL,
  image_width INT NULL,
  image_height INT NULL,
  detected_cell_count INT NULL,
  classified_cell_count INT NULL,
  average_confidence DOUBLE NULL,
  dominant_label VARCHAR(120) NULL,
  request_payload JSON NOT NULL,
  result_payload JSON NOT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analysis_records_created_at (created_at),
  INDEX idx_analysis_records_mode (mode),
  INDEX idx_analysis_records_analysis_mode (analysis_mode),
  INDEX idx_analysis_records_model_id (model_id)
);

