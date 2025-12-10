export type FileKind = "file" | "dir";

export interface WorkspaceInfo {
  id: number;
  name: string;
  path: string;
  createdAt: string;
}

export interface WorkspaceStats {
  fileCount: number;
  directoryCount: number;
}

export interface TagInfo {
  id: number;
  name: string;
  color: string;
  parentId?: number | null;
}

export interface FileEntry {
  id: number;
  workspaceId: number;
  path: string;
  name: string;
  size: number;
  type: FileKind;
  modTime: string;
  createdAt: string;
  hash?: string;
  tags: TagInfo[];
}

export interface FilePage {
  total: number;
  records: FileEntry[];
}
