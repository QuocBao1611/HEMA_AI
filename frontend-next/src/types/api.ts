export type DatabaseHealth = {
  enabled: boolean;
  ready: boolean;
  last_error: string | null;
};

export type ModelSummary = {
  model_id: string;
  display_name: string;
  model_path: string;
  loaded_model_path: string;
  input_shape: number[];
  num_classes: number;
  preprocessing: string;
  unified?: boolean;
};

export type HealthResponse = {
  status: string;
  default_model_id: string;
  default_model_name: string;
  model_path: string;
  loaded_model_path: string;
  input_shape: number[];
  num_classes: number;
  analysis_mode: string;
  available_analysis_modes: string[];
  preprocessing: string;
  available_models: ModelSummary[];
  database: DatabaseHealth;
};

export type ModelBenchmarkMetrics = {
  accuracy: number;
  tuned_accuracy?: number;
  val_accuracy?: number;
  macro_precision?: number;
  macro_recall?: number;
  macro_f1?: number;
  weighted_precision?: number;
  weighted_recall?: number;
  weighted_f1?: number;
  inference_speed_score?: number;
  stability_score?: number;
};

export type ModelBenchmark = {
  display_name: string;
  source: string;
  note?: string;
  metrics: ModelBenchmarkMetrics;
  per_class?: Record<string, { precision: number; recall: number; f1: number }>;
};

export type SystemInfoResponse = {
  default_model_id: string;
  default_model_name: string;
  input_shape: number[];
  num_classes: number;
  class_names: string[];
  labels_configured: boolean;
  supports_estimated_counts: boolean;
  supports_slide_count: boolean;
  supports_grid_estimation: boolean;
  supports_model_comparison: boolean;
  analysis_note: string;
  diagnostic_group_map: Record<string, string>;
  clinical_flag_rules: ClinicalFlagRule[];
  available_models: ModelSummary[];
  model_benchmarks?: Record<string, ModelBenchmark>;
  database: DatabaseHealth;
};

export type ClinicalFlagRule = {
  key: string;
  enabled: boolean;
  label: string;
  source: "estimated_counts" | "grouped_counts" | "wbc_differential" | string;
  field: "count" | "ratio" | string;
  threshold: number;
  severity: "critical" | "warning" | "info" | string;
  title: string;
  action: string;
  // Accuracy guards (optional, used by frontend evaluation logic)
  min_sample?: number;          // Minimum total cells in source for ratio rules
  min_avg_confidence?: number;  // Minimum avg confidence of triggering cells
  warn_threshold?: number;      // If set, value between this and threshold = "info" level
};

export type ClinicalFlagSettingsResponse = {
  rules: ClinicalFlagRule[];
  database?: DatabaseHealth;
};

export type LabelInfoResponse = {
  model_id: string;
  display_name: string;
  num_classes: number;
  class_names: string[];
  labels_configured: boolean;
};

export type HistoryItem = {
  id: number;
  mode: string;
  analysis_mode: string | null;
  filename: string | null;
  model_id: string | null;
  model_name: string | null;
  image_width: number | null;
  image_height: number | null;
  detected_cell_count: number | null;
  classified_cell_count: number | null;
  average_confidence: number | null;
  dominant_label: string | null;
  created_at: string;
};

export type HistoryResponse = {
  items: HistoryItem[];
  database: DatabaseHealth;
};

export type HistoryDetailResponse = HistoryItem & {
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  notes: string | null;
  database: DatabaseHealth;
};

export type PredictionItem = {
  index: number;
  label: string;
  raw_label: string;
  confidence: number;
};

export type CountRow = {
  label: string;
  count: number;
  ratio: number;
  average_confidence?: number;
  max_confidence?: number;
  class_index?: number;
  member_labels?: string[];
};

export type DominantCellType = {
  label: string;
  count: number;
  ratio: number;
  average_confidence: number;
  max_confidence: number;
  class_index: number;
};

export type PredictResponse = {
  mode: "predict";
  filename: string;
  selected_model_id: string;
  selected_model_name: string;
  input_shape: number[];
  preprocessing: string;
  label: string;
  class_index: number;
  confidence: number;
  predictions: PredictionItem[];
};

export type RegionPrediction = {
  region_id: number;
  box: { x: number; y: number; width: number; height: number };
  label: string;
  class_index: number;
  confidence: number;
};

export type AnalyzeResponse = {
  mode: "analyze";
  analysis_mode: string;
  selected_model_id: string;
  selected_model_name: string;
  input_shape: number[];
  preprocessing: string;
  filename: string;
  image_size: { width: number; height: number };
  confidence_threshold: number;
  padding_ratio: number;
  min_component_area: number;
  max_detections: number;
  analysis_method: string;
  count_unit: string;
  note: string;
  analyzed_region_count: number;
  detected_region_count: number;
  detected_cell_count: number;
  classified_cell_count: number;
  estimated_total_cells: number;
  average_confidence: number;
  average_region_confidence: number;
  dominant_cell_type: DominantCellType | null;
  estimated_counts: CountRow[];
  grouped_counts: CountRow[];
  wbc_differential: CountRow[];
  region_predictions?: RegionPrediction[];
};

export type CompareRow = {
  model_id: string;
  display_name: string;
  input_shape: number[];
  preprocessing: string;
  detected_cell_count: number;
  classified_cell_count: number;
  estimated_total_cells: number;
  average_confidence: number;
  average_region_confidence: number;
  dominant_label: string;
  top_group_label: string | null;
  top_group_count: number;
  fallback_used: boolean;
  execution_time_ms?: number;
};

export type SharedDetectionSummary = {
  box_count: number;
  fallback_used: boolean;
  boxes?: { x1: number; y1: number; x2: number; y2: number }[];
};

export type CompareModelsResponse = {
  mode: "compare_models";
  analysis_mode: string;
  filename: string;
  image_size: { width: number; height: number };
  shared_detection?: SharedDetectionSummary;
  comparison_rows: CompareRow[];
  best_by_average_confidence: CompareRow | null;
  best_by_detected_cells: CompareRow | null;
  models?: AnalyzeResponse[];
  note: string;
};

export type LabelsUpdateResponse = LabelInfoResponse & {
  message: string;
  database_saved: boolean;
  database_error: string | null;
};

export type AdminModelsResponse = {
  models: ModelSummary[];
  default_model_id: string;
};

export type AdminOverviewResponse = {
  default_model_id: string;
  models: ModelSummary[];
  default_labels: LabelInfoResponse;
  clinical_flag_rules: ClinicalFlagRule[];
};

export type DefaultModelUpdateResponse = {
  message: string;
  default_model_id: string;
  database_saved: boolean;
  database_error: string | null;
};
