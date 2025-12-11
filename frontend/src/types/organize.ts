export type OrganizeStatus = "move" | "conflict" | "skip_missing_tags" | "already_in_place";

export interface OrganizeLevelPayload {
  tag_ids: number[];
}

export interface OrganizeRequestPayload {
  levels: OrganizeLevelPayload[];
}

export interface OrganizePreviewItem {
  file_id: number;
  original_path: string;
  target_path: string;
  status: OrganizeStatus;
  missing_tags?: string[];
  tags?: string[];
  message?: string;
}

export interface OrganizeSummary {
  total: number;
  move_count: number;
  conflict_count: number;
  skip_count: number;
  already_in_place: number;
}

export interface OrganizePreview {
  items: OrganizePreviewItem[];
  summary: OrganizeSummary;
  base_path: string;
}

export interface OrganizeResult {
  preview: OrganizePreview;
  operation_id?: number;
}

export interface OrganizeUndoResult {
  restored: number;
  failed: number;
  message?: string;
}
