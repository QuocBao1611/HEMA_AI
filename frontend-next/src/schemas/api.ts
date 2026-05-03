import { z } from "zod";

export const databaseHealthSchema = z.object({
  enabled: z.boolean(),
  ready: z.boolean(),
  last_error: z.string().nullable(),
});

export const modelSummarySchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  model_path: z.string(),
  loaded_model_path: z.string(),
  input_shape: z.array(z.number()),
  num_classes: z.number(),
  preprocessing: z.string(),
});

export const clinicalFlagRuleSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  label: z.string(),
  source: z.string(),
  field: z.string(),
  threshold: z.number(),
  severity: z.string(),
  title: z.string(),
  action: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.string(),
  default_model_id: z.string(),
  default_model_name: z.string(),
  model_path: z.string(),
  loaded_model_path: z.string(),
  input_shape: z.array(z.number()),
  num_classes: z.number(),
  analysis_mode: z.string(),
  available_analysis_modes: z.array(z.string()),
  preprocessing: z.string(),
  available_models: z.array(modelSummarySchema),
  database: databaseHealthSchema,
});

export const systemInfoSchema = z.object({
  default_model_id: z.string(),
  default_model_name: z.string(),
  input_shape: z.array(z.number()),
  num_classes: z.number(),
  class_names: z.array(z.string()),
  labels_configured: z.boolean(),
  supports_estimated_counts: z.boolean(),
  supports_slide_count: z.boolean(),
  supports_grid_estimation: z.boolean(),
  supports_model_comparison: z.boolean(),
  analysis_note: z.string(),
  diagnostic_group_map: z.record(z.string(), z.string()),
  clinical_flag_rules: z.array(clinicalFlagRuleSchema),
  available_models: z.array(modelSummarySchema),
  model_benchmarks: z.record(z.string(), z.any()).optional(),
  database: databaseHealthSchema,
});

export const clinicalFlagSettingsSchema = z.object({
  rules: z.array(clinicalFlagRuleSchema),
  database: databaseHealthSchema.optional(),
});

export const historyItemSchema = z.object({
  id: z.number(),
  mode: z.string(),
  analysis_mode: z.string().nullable(),
  filename: z.string().nullable(),
  model_id: z.string().nullable(),
  model_name: z.string().nullable(),
  image_width: z.number().nullable(),
  image_height: z.number().nullable(),
  detected_cell_count: z.number().nullable(),
  classified_cell_count: z.number().nullable(),
  average_confidence: z.number().nullable(),
  dominant_label: z.string().nullable(),
  created_at: z.string(),
});

export const historyResponseSchema = z.object({
  items: z.array(historyItemSchema),
  database: databaseHealthSchema,
});

export const labelInfoSchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  num_classes: z.number(),
  class_names: z.array(z.string()),
  labels_configured: z.boolean(),
});

export const historyDetailSchema = historyItemSchema.extend({
  request_payload: z.record(z.string(), z.unknown()),
  result_payload: z.record(z.string(), z.unknown()),
  notes: z.string().nullable(),
  database: databaseHealthSchema,
});

export const predictionItemSchema = z.object({
  index: z.number(),
  label: z.string(),
  raw_label: z.string(),
  confidence: z.number(),
});

export const predictResponseSchema = z.object({
  mode: z.literal("predict"),
  filename: z.string(),
  selected_model_id: z.string(),
  selected_model_name: z.string(),
  input_shape: z.array(z.number()),
  preprocessing: z.string(),
  label: z.string(),
  class_index: z.number(),
  confidence: z.number(),
  predictions: z.array(predictionItemSchema),
});

export const countRowSchema = z.object({
  label: z.string(),
  count: z.number(),
  ratio: z.number(),
  average_confidence: z.number().optional(),
  max_confidence: z.number().optional(),
  class_index: z.number().optional(),
  member_labels: z.array(z.string()).optional(),
});

export const dominantCellTypeSchema = z.object({
  label: z.string(),
  count: z.number(),
  ratio: z.number(),
  average_confidence: z.number(),
  max_confidence: z.number(),
  class_index: z.number(),
});

export const regionPredictionSchema = z.object({
  region_id: z.number(),
  box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  label: z.string(),
  class_index: z.number(),
  confidence: z.number(),
});

export const analyzeResponseSchema = z.object({
  mode: z.literal("analyze"),
  analysis_mode: z.string(),
  selected_model_id: z.string(),
  selected_model_name: z.string(),
  input_shape: z.array(z.number()),
  preprocessing: z.string(),
  filename: z.string(),
  image_size: z.object({
    width: z.number(),
    height: z.number(),
  }),
  confidence_threshold: z.number(),
  padding_ratio: z.number(),
  min_component_area: z.number(),
  max_detections: z.number(),
  analysis_method: z.string(),
  count_unit: z.string(),
  note: z.string(),
  analyzed_region_count: z.number(),
  detected_region_count: z.number(),
  detected_cell_count: z.number(),
  classified_cell_count: z.number(),
  estimated_total_cells: z.number(),
  average_confidence: z.number(),
  average_region_confidence: z.number(),
  dominant_cell_type: dominantCellTypeSchema.nullable(),
  estimated_counts: z.array(countRowSchema),
  grouped_counts: z.array(countRowSchema),
  wbc_differential: z.array(countRowSchema),
  region_predictions: z.array(regionPredictionSchema).optional(),
});

export const compareRowSchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  input_shape: z.array(z.number()),
  preprocessing: z.string(),
  detected_cell_count: z.number(),
  classified_cell_count: z.number(),
  estimated_total_cells: z.number(),
  average_confidence: z.number(),
  average_region_confidence: z.number(),
  dominant_label: z.string(),
  top_group_label: z.string(),
  top_group_count: z.number(),
  fallback_used: z.boolean(),
});

export const sharedDetectionSummarySchema = z.object({
  box_count: z.number(),
  fallback_used: z.boolean(),
});

export const compareModelsResponseSchema = z.object({
  mode: z.literal("compare_models"),
  analysis_mode: z.string(),
  filename: z.string(),
  image_size: z.object({
    width: z.number(),
    height: z.number(),
  }),
  shared_detection: sharedDetectionSummarySchema.optional(),
  comparison_rows: z.array(compareRowSchema),
  best_by_average_confidence: compareRowSchema.nullable(),
  best_by_detected_cells: compareRowSchema.nullable(),
  note: z.string(),
});

export const labelsUpdateResponseSchema = z.object({
  message: z.string(),
  model_id: z.string(),
  display_name: z.string(),
  num_classes: z.number(),
  class_names: z.array(z.string()),
  labels_configured: z.boolean(),
  database_saved: z.boolean(),
  database_error: z.string().nullable(),
});

export const adminModelsResponseSchema = z.object({
  models: z.array(modelSummarySchema),
  default_model_id: z.string(),
});

export const adminOverviewResponseSchema = z.object({
  default_model_id: z.string(),
  models: z.array(modelSummarySchema),
  default_labels: labelInfoSchema,
  clinical_flag_rules: z.array(clinicalFlagRuleSchema),
});

export const defaultModelUpdateResponseSchema = z.object({
  message: z.string(),
  default_model_id: z.string(),
  database_saved: z.boolean(),
  database_error: z.string().nullable(),
});
