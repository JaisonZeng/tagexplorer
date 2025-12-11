import {create} from "zustand";
import {
  GetFiles,
  SelectWorkspace,
  AddWorkspaceFolder,
  RemoveWorkspaceFolder,
  GetWorkspaceFolders,
  ScanWorkspaceFolder,
  SetActiveWorkspace,
  SaveWorkspaceConfig,
  LoadWorkspaceConfig,
  ShowStartupDialog,
  SearchFilesByTags,
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
  created_at: string;
  version: string;
}

// 标签搜索参数
export interface TagSearchParams {
  tagIds: number[];
  folderPath: string;
  includeSubfolders: boolean;
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
  // 标签搜索状态
  tagSearchParams: TagSearchParams | null;
  isTagSearchMode: boolean;
  
  // Actions
  selectWorkspace: () => Promise<void>;
  addFolder: () => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  setActiveFolder: (folderId: number | null) => Promise<void>;
  fetchNextPage: (reset?: boolean) => Promise<void>;
  selectFile: (fileID: number, index: number, options: {append: boolean; range: boolean}) => void;
  clearSelection: () => void;
  addTagToFilesLocal: (fileIds: number[], tag: TagInfo) => void;
  removeTagFromFilesLocal: (fileIds: number[], tagID: number) => void;
  updateTagColorLocal: (tagId: number, color: string) => void;
  // 工作区配置管理
  saveWorkspaceToFile: (name: string) => Promise<string | null>;
  loadWorkspaceFromFile: () => Promise<void>;
  showStartupDialog: () => Promise<string>;
  refreshFolders: () => Promise<void>;
  // 标签搜索
  searchByTags: (params: TagSearchParams) => Promise<void>;
  clearTagSearch: () => void;
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

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
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
      tagSearchParams: null,
      isTagSearchMode: false,

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

          const currentState = get();
          const exists = currentState.folders.some((f) => f.path === folder.path);
          
          if (exists) {
            // 如果文件夹已存在，不做任何操作
            return;
          }
          
          // 如果是第一个文件夹，自动激活它
          const isFirstFolder = currentState.folders.length === 0;
          
          if (isFirstFolder) {
            const stats: WorkspaceStats = {
              fileCount: Number(result.file_count ?? 0),
              directoryCount: Number(result.directory_count ?? 0),
            };
            
            set({
              folders: [folder],
              activeFolderId: folder.id,
              workspace: normalizeWorkspace(result.workspace),
              stats,
              files: [],
              total: 0,
              offset: 0,
              hasMore: true,
              selectedFileIds: [],
              lastSelectedIndex: null,
            });
            
            // 通知后端设置活动工作区，然后获取文件
            await SetActiveWorkspace(folder.id);
            await get().fetchNextPage(true);
          } else {
            // 如果已有文件夹，只添加到列表，不切换活动文件夹
            set((state) => ({
              folders: [...state.folders, folder],
            }));
          }
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
      setActiveFolder: async (folderId: number | null) => {
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
          try {
            // 通知后端切换活动工作区
            await SetActiveWorkspace(folderId);
            // 获取新工作区的文件
            await get().fetchNextPage(true);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            set({error: message});
          }
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

      // 保存工作区配置到文件
      saveWorkspaceToFile: async (name: string) => {
        const {folders} = get();
        if (folders.length === 0) {
          throw new Error("没有文件夹可以保存");
        }

        try {
          const folderPaths = folders.map((f) => f.path);
          const savedPath = await SaveWorkspaceConfig(name, folderPaths);
          return savedPath;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
          throw error;
        }
      },

      // 从文件加载工作区配置
      loadWorkspaceFromFile: async () => {
        try {
          // 先获取配置，不清空当前状态
          const config = await LoadWorkspaceConfig();
          if (!config) {
            // 用户取消了选择，保持当前状态不变
            return;
          }

          // 用户确认选择后，才清空旧状态并开始加载
          set({
            folders: [],
            activeFolderId: null,
            workspace: undefined,
            stats: undefined,
            files: [],
            loading: true,
            error: undefined,
          });

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
            // 先设置 loading 为 false，否则 setActiveFolder 内部的 fetchNextPage 会因为 loading 为 true 而跳过
            set({loading: false});
            await get().setActiveFolder(folders[0].id);
          } else {
            set({loading: false});
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message, loading: false});
        }
      },

      // 显示启动选择对话框
      showStartupDialog: async () => {
        try {
          const choice = await ShowStartupDialog();
          return choice;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
          throw error;
        }
      },

      // 按标签搜索文件
      searchByTags: async (params: TagSearchParams) => {
        const state = get();
        if (!state.workspace && !state.activeFolderId) {
          return;
        }
        if (state.loading) {
          return;
        }
        if (params.tagIds.length === 0) {
          // 如果没有选择标签，清除搜索模式
          get().clearTagSearch();
          return;
        }

        set({
          loading: true,
          error: undefined,
          tagSearchParams: params,
          isTagSearchMode: true,
        });

        try {
          const response = await SearchFilesByTags({
            tag_ids: params.tagIds,
            folder_path: params.folderPath,
            include_subfolders: params.includeSubfolders,
            limit: state.pageSize,
            offset: 0,
          });
          const total = Number(response?.total ?? 0);
          const normalized = Array.isArray(response?.records)
            ? response.records.map(normalizeFileRecord)
            : [];
          set({
            files: normalized,
            total,
            offset: normalized.length,
            hasMore: normalized.length < total,
            selectedFileIds: [],
            lastSelectedIndex: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({error: message});
        } finally {
          set({loading: false});
        }
      },

      // 清除标签搜索
      clearTagSearch: () => {
        set({
          tagSearchParams: null,
          isTagSearchMode: false,
          files: [],
          total: 0,
          offset: 0,
          hasMore: true,
          selectedFileIds: [],
          lastSelectedIndex: null,
        });
        // 重新加载普通文件列表
        get().fetchNextPage(true);
      },
    }));
