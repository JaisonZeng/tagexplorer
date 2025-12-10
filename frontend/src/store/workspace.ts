import {create} from "zustand";
import {persist} from "zustand/middleware";
import {
  GetFiles,
  SelectWorkspace,
  AddWorkspaceFolder,
  RemoveWorkspaceFolder,
  GetWorkspaceFolders,
  ScanWorkspaceFolder,
} from "../../wailsjs/go/main/App";
import type {FileEntry, TagInfo, WorkspaceInfo, WorkspaceStats} from "../types/files";

// 工作区文件夹
export interface WorkspaceFolder {
  id: number;
  path: string;
  name: string;
  createdAt: string;
}

// 工作区配置（可保存）
export interface WorkspaceConfig {
  name: string;
  folders: string[];
  createdAt: string;
}

interface WorkspaceState {
  // 当前活动的工作区文件夹列表
  folders: WorkspaceFolder[];
  // 当前选中的文件夹ID（用于显示文件）
  activeFolderId: number | null;
  // 兼容旧的单工作区
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
  // 保存的工作区配置
  savedConfigs: WorkspaceConfig[];
  
  // Actions
  selectWorkspace: () => Promise<void>;
  addFolder: () => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  setActiveFolder: (folderId: number | null) => void;
  fetchNextPage: (reset?: boolean) => Promise<void>;
  selectFile: (fileID: number, index: number, options: {append: boolean; range: boolean}) => void;
  clearSelection: () => void;
  addTagToFilesLocal: (fileIds: number[], tag: TagInfo) => void;
  removeTagFromFilesLocal: (fileIds: number[], tagID: number) => void;
  updateTagColorLocal: (tagId: number, color: string) => void;
  // 工作区配置管理
  saveCurrentConfig: (name: string) => void;
  loadConfig: (config: WorkspaceConfig) => Promise<void>;
  deleteConfig: (name: string) => void;
  refreshFolders: () => Promise<void>;
}

const normalizeWorkspace = (payload: any): WorkspaceInfo => ({
  id: Number(payload?.id ?? 0),
  name: payload?.name ?? "未命名工作区",
  path: payload?.path ?? "",
  createdAt: payload?.created_at ?? "",
});

const normalizeFolder = (payload: any): WorkspaceFolder => ({
  id: Number(payload?.id ?? 0),
  path: payload?.path ?? "",
  name: payload?.name ?? "",
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

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      folders: [],
      activeFolderId: null,
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
      savedConfigs: [],

      // 兼容旧的选择工作区方法（选择单个文件夹）
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

          // 添加到文件夹列表
          const folder: WorkspaceFolder = {
            id: workspace.id,
            path: workspace.path,
            name: workspace.name,
            createdAt: workspace.createdAt,
          };

          set((state) => {
            const exists = state.folders.some((f) => f.path === folder.path);
            return {
              workspace,
              stats,
              folders: exists ? state.folders : [...state.folders, folder],
              activeFolderId: folder.id,
              files: [],
              total: 0,
              offset: 0,
              hasMore: true,
              selectedFileIds: [],
              lastSelectedIndex: null,
            };
          });

          await get().fetchNextPage(true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
        } finally {
          set({selecting: false});
        }
      },

      // 添加文件夹到工作区
      addFolder: async () => {
        set({selecting: true, error: undefined});
        try {
          const result = await AddWorkspaceFolder();
          if (!result) {
            return;
          }

          const folder = normalizeFolder(result.workspace);
          const stats: WorkspaceStats = {
            fileCount: Number(result.file_count ?? 0),
            directoryCount: Number(result.directory_count ?? 0),
          };

          set((state) => {
            const exists = state.folders.some((f) => f.path === folder.path);
            if (exists) {
              return {
                activeFolderId: folder.id,
                workspace: normalizeWorkspace(result.workspace),
                stats,
              };
            }
            return {
              folders: [...state.folders, folder],
              activeFolderId: folder.id,
              workspace: normalizeWorkspace(result.workspace),
              stats,
              files: [],
              total: 0,
              offset: 0,
              hasMore: true,
              selectedFileIds: [],
              lastSelectedIndex: null,
            };
          });

          await get().fetchNextPage(true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
        } finally {
          set({selecting: false});
        }
      },

      // 从工作区移除文件夹
      removeFolder: async (folderId: number) => {
        try {
          await RemoveWorkspaceFolder(folderId);
          set((state) => {
            const newFolders = state.folders.filter((f) => f.id !== folderId);
            const newActiveFolderId =
              state.activeFolderId === folderId
                ? newFolders.length > 0
                  ? newFolders[0].id
                  : null
                : state.activeFolderId;

            return {
              folders: newFolders,
              activeFolderId: newActiveFolderId,
              workspace: newActiveFolderId
                ? state.workspace
                : undefined,
              stats: newActiveFolderId ? state.stats : undefined,
              files: newActiveFolderId === state.activeFolderId ? state.files : [],
            };
          });

          // 如果还有活动文件夹，刷新文件列表
          const {activeFolderId} = get();
          if (activeFolderId) {
            await get().fetchNextPage(true);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
        }
      },

      // 设置活动文件夹
      setActiveFolder: (folderId: number | null) => {
        const {folders} = get();
        const folder = folders.find((f) => f.id === folderId);
        
        set({
          activeFolderId: folderId,
          workspace: folder
            ? {id: folder.id, name: folder.name, path: folder.path, createdAt: folder.createdAt}
            : undefined,
          files: [],
          total: 0,
          offset: 0,
          hasMore: true,
          selectedFileIds: [],
          lastSelectedIndex: null,
        });

        if (folderId) {
          void get().fetchNextPage(true);
        }
      },

      // 刷新文件夹列表
      refreshFolders: async () => {
        try {
          const response = await GetWorkspaceFolders();
          if (Array.isArray(response)) {
            const folders = response.map(normalizeFolder);
            set({folders});
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
        }
      },

      fetchNextPage: async (reset = false) => {
        const state = get();
        if (!state.workspace && !state.activeFolderId) {
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

      updateTagColorLocal: (tagId, color) =>
        set((state) => {
          const files = state.files.map((file) => ({
            ...file,
            tags: file.tags.map((tag) =>
              tag.id === tagId ? {...tag, color} : tag
            ),
          }));
          return {...state, files};
        }),

      // 保存当前工作区配置
      saveCurrentConfig: (name: string) => {
        const {folders, savedConfigs} = get();
        const config: WorkspaceConfig = {
          name,
          folders: folders.map((f) => f.path),
          createdAt: new Date().toISOString(),
        };
        
        // 如果同名配置已存在，替换它
        const existingIndex = savedConfigs.findIndex((c) => c.name === name);
        if (existingIndex >= 0) {
          const newConfigs = [...savedConfigs];
          newConfigs[existingIndex] = config;
          set({savedConfigs: newConfigs});
        } else {
          set({savedConfigs: [...savedConfigs, config]});
        }
      },

      // 加载工作区配置
      loadConfig: async (config: WorkspaceConfig) => {
        set({
          folders: [],
          activeFolderId: null,
          workspace: undefined,
          stats: undefined,
          files: [],
          loading: true,
        });

        try {
          for (const folderPath of config.folders) {
            const result = await ScanWorkspaceFolder(folderPath);
            if (result) {
              const folder = normalizeFolder(result.workspace);
              set((state) => ({
                folders: [...state.folders, folder],
              }));
            }
          }

          const {folders} = get();
          if (folders.length > 0) {
            get().setActiveFolder(folders[0].id);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
        } finally {
          set({loading: false});
        }
      },

      // 删除工作区配置
      deleteConfig: (name: string) => {
        set((state) => ({
          savedConfigs: state.savedConfigs.filter((c) => c.name !== name),
        }));
      },
    }),
    {
      name: "tagexplorer-workspace",
      partialize: (state) => ({
        savedConfigs: state.savedConfigs,
      }),
    }
  )
);
