import {create} from "zustand";
import {GetFiles, SelectWorkspace} from "../../wailsjs/go/main/App";
import type {FileEntry, TagInfo, WorkspaceInfo, WorkspaceStats} from "../types/files";

interface WorkspaceState {
  workspace?: WorkspaceInfo;
  stats?: WorkspaceStats;
  files: FileEntry[];
  total: number;
  offset: number;
  pageSize: number;
  loading: boolean;
  selecting: boolean;
  hasMore: boolean;
  error?: string;
  selectedFileIds: number[];
  lastSelectedIndex: number | null;
  selectWorkspace: () => Promise<void>;
  fetchNextPage: (reset?: boolean) => Promise<void>;
  selectFile: (fileID: number, index: number, options: {append: boolean; range: boolean}) => void;
  clearSelection: () => void;
  addTagToFilesLocal: (fileIds: number[], tag: TagInfo) => void;
  removeTagFromFilesLocal: (fileIds: number[], tagID: number) => void;
}

const normalizeWorkspace = (payload: any): WorkspaceInfo => ({
  id: Number(payload?.id ?? 0),
  name: payload?.name ?? "未命名工作区",
  path: payload?.path ?? "",
  createdAt: payload?.created_at ?? "",
});

const normalizeTag = (payload: any): TagInfo => ({
  id: Number(payload?.id ?? 0),
  name: payload?.name ?? "",
  color: payload?.color ?? "#94a3b8",
  parentId: payload?.parent_id ?? null,
});

const normalizeFileRecord = (payload: any): FileEntry => ({
  id: Number(payload?.id ?? 0),
  workspaceId: Number(payload?.workspace_id ?? 0),
  path: payload?.path ?? "",
  name: payload?.name ?? "",
  size: Number(payload?.size ?? 0),
  type: payload?.type === "dir" ? "dir" : "file",
  modTime: payload?.mod_time ?? "",
  createdAt: payload?.created_at ?? "",
  hash: payload?.hash ?? "",
  tags: Array.isArray(payload?.tags) ? payload.tags.map(normalizeTag) : [],
});

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  files: [],
  total: 0,
  offset: 0,
  pageSize: 200,
  loading: false,
  selecting: false,
  hasMore: false,
  error: undefined,
  selectedFileIds: [],
  lastSelectedIndex: null,

  selectWorkspace: async () => {
    set({selecting: true, error: undefined});
    try {
      const result = await SelectWorkspace();
      if (!result || !result.workspace) {
        set({
          workspace: undefined,
          stats: undefined,
          files: [],
          total: 0,
          offset: 0,
          hasMore: false,
          selectedFileIds: [],
          lastSelectedIndex: null,
        });
        return;
      }

      const workspace = normalizeWorkspace(result.workspace);
      const stats: WorkspaceStats = {
        fileCount: Number(result.file_count ?? 0),
        directoryCount: Number(result.directory_count ?? 0),
      };

      set({
        workspace,
        stats,
        files: [],
        total: 0,
        offset: 0,
        hasMore: true,
        selectedFileIds: [],
        lastSelectedIndex: null,
      });

      await get().fetchNextPage(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    } finally {
      set({selecting: false});
    }
  },

  fetchNextPage: async (reset = false) => {
    const state = get();
    if (!state.workspace) {
      return;
    }
    if (state.loading) {
      return;
    }
    if (!reset && !state.hasMore) {
      return;
    }

    const offset = reset ? 0 : state.offset;
    set({loading: true, error: undefined});

    try {
      const response = await GetFiles(state.pageSize, offset);
      const total = Number(response?.total ?? 0);
      const normalized = Array.isArray(response?.records)
        ? response.records.map(normalizeFileRecord)
        : [];
      set((current) => {
        const baseFiles = reset ? [] : current.files;
        const existingIds = reset
          ? new Set<number>()
          : new Set(baseFiles.map((file) => file.id));
        const merged = reset
          ? normalized
          : normalized.filter((file) => !existingIds.has(file.id));
        const files = reset ? merged : [...baseFiles, ...merged];
        const baseOffset = reset ? 0 : current.offset;
        const gained = merged.length;
        const nextOffset = baseOffset + gained;
        return {
          ...current,
          files,
          total,
          offset: nextOffset,
          hasMore: gained > 0 && nextOffset < total,
          selectedFileIds: reset ? [] : current.selectedFileIds.filter((id) =>
            files.some((file) => file.id === id),
          ),
          lastSelectedIndex: reset ? null : current.lastSelectedIndex,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    } finally {
      set({loading: false});
    }
  },

  selectFile: (fileID, index, options) =>
    set((state) => {
      const {append, range} = options;
      const files = state.files;
      let selected = state.selectedFileIds;
      let anchor = state.lastSelectedIndex;

      const toggleSelection = () => {
        const exists = selected.includes(fileID);
        if (exists) {
          selected = selected.filter((id) => id !== fileID);
        } else {
          selected = [...selected, fileID];
        }
      };

      if (range && anchor !== null && anchor >= 0 && anchor < files.length) {
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        const rangeSelection = files.slice(start, end+1).map((file) => file.id);
        selected = rangeSelection;
      } else if (append) {
        toggleSelection();
        anchor = index;
      } else {
        if (selected.length === 1 && selected[0] === fileID) {
          selected = selected;
        } else {
          selected = [fileID];
        }
        anchor = index;
      }

      if (selected.length === 0) {
        anchor = null;
      }

      return {
        ...state,
        selectedFileIds: selected,
        lastSelectedIndex: anchor,
      };
    }),

  clearSelection: () => set({selectedFileIds: [], lastSelectedIndex: null}),

  addTagToFilesLocal: (fileIds, tag) =>
    set((state) => {
      const idSet = new Set(fileIds);
      const files = state.files.map((file) => {
        if (!idSet.has(file.id)) {
          return file;
        }
        if (file.tags.some((item) => item.id === tag.id)) {
          return file;
        }
        return {
          ...file,
          tags: [...file.tags, tag],
        };
      });
      return {...state, files};
    }),

  removeTagFromFilesLocal: (fileIds, tagID) =>
    set((state) => {
      const idSet = new Set(fileIds);
      const files = state.files.map((file) => {
        if (!idSet.has(file.id)) {
          return file;
        }
        const filtered = file.tags.filter((tag) => tag.id !== tagID);
        if (filtered.length === file.tags.length) {
          return file;
        }
        return {
          ...file,
          tags: filtered,
        };
      });
      return {...state, files};
    }),
}));
