/**
 * 基于 Chonky 的文件浏览器组件
 */
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  ChonkyActions,
  FileBrowser as ChonkyFileBrowser,
  FileContextMenu,
  FileList,
  FileToolbar,
  defineFileAction,
  FileData,
  ChonkyIconName,
} from "chonky";
import {ChonkyIconFA} from "chonky-icon-fontawesome";
import {useShallow} from "zustand/react/shallow";
import {useWorkspaceStore} from "../store/workspace";
import {usePreviewStore} from "../store/preview";
import {useTagStore} from "../store/tags";
import {fileEntriesToChonky, getOriginalEntry, ExtendedFileData} from "../utils/chonkyAdapter";
import {applyChonkyI18n} from "../utils/chonkyI18n";
import type {FileEntry, TagInfo} from "../types/files";
import {ChevronRight, Folder, Home, X, Filter, SearchX, Pencil} from "lucide-react";
import {RenameFile} from "../../wailsjs/go/main/App";

// 应用中文本地化
applyChonkyI18n();

// 自定义 Action: 打标签
const TagFileAction = defineFileAction({
  id: "tag_file",
  button: {
    name: "管理标签",
    toolbar: true,
    contextMenu: true,
    icon: ChonkyIconName.config,
  },
});

// 自定义 Action: 预览文件
const PreviewFileAction = defineFileAction({
  id: "preview_file",
  button: {
    name: "预览",
    toolbar: true,
    contextMenu: true,
    icon: ChonkyIconName.search,
  },
  hotkeys: ["space"],
});

// 自定义 Action: 重命名文件
const RenameFileAction = defineFileAction({
  id: "rename_file",
  requiresSelection: true,
  button: {
    name: "重命名",
    toolbar: false,
    contextMenu: true,
    icon: ChonkyIconName.terminal,
  },
  hotkeys: ["F2"],
});

interface FileBrowserProps {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

// 标签弹出菜单组件
interface TagPopupMenuProps {
  position: {x: number; y: number};
  targets: FileEntry[];
  tags: TagInfo[];
  onClose: () => void;
  onAddTag: (tagId: number, fileIds: number[]) => Promise<void>;
  onRemoveTag: (tagId: number, fileIds: number[]) => Promise<void>;
}

const TagPopupMenu = ({
  position,
  targets,
  tags,
  onClose,
  onAddTag,
  onRemoveTag,
}: TagPopupMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const targetIds = useMemo(() => targets.map((t) => t.id), [targets]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const getTagState = useCallback(
    (tagId: number) => {
      const everyHas = targets.every((entry) => entry.tags?.some((tag) => tag.id === tagId));
      const someHas = targets.some((entry) => entry.tags?.some((tag) => tag.id === tagId));
      return {everyHas, someHas};
    },
    [targets]
  );

  const handleToggle = async (tag: TagInfo) => {
    const {everyHas} = getTagState(tag.id);
    if (everyHas) {
      await onRemoveTag(tag.id, targetIds);
    } else {
      await onAddTag(tag.id, targetIds);
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      style={{left: position.x, top: position.y}}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-900 dark:text-white">管理标签</span>
        <span className="text-xs text-slate-500">{targets.length} 个文件</span>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto">
        {tags.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">暂无标签</p>
        ) : (
          tags.map((tag) => {
            const {everyHas, someHas} = getTagState(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  everyHas ? "text-brand" : "text-slate-600 dark:text-slate-300"
                }`}
                onClick={() => handleToggle(tag)}
              >
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{backgroundColor: tag.color}} />
                  {tag.name}
                </span>
                {everyHas && (
                  <svg className="h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {!everyHas && someHas && (
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
      <button
        onClick={onClose}
        className="mt-2 w-full rounded-md bg-slate-100 py-1.5 text-xs text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        关闭
      </button>
    </div>
  );
};

// 重命名对话框组件
interface RenameDialogProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onConfirm: (newName: string) => void;
}

const RenameDialog = ({isOpen, fileName, onClose, onConfirm}: RenameDialogProps) => {
  const [newName, setNewName] = useState(fileName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(fileName);
      // 聚焦并选中文件名（不包括扩展名）
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const dotIndex = fileName.lastIndexOf(".");
          if (dotIndex > 0) {
            inputRef.current.setSelectionRange(0, dotIndex);
          } else {
            inputRef.current.select();
          }
        }
      }, 50);
    }
  }, [isOpen, fileName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newName.trim()) {
      onConfirm(newName.trim());
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-white">重命名</h3>
        <input
          ref={inputRef}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={() => newName.trim() && onConfirm(newName.trim())}
            disabled={!newName.trim() || newName === fileName}
            className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

const FileBrowser = ({onLoadMore, hasMore, loading}: FileBrowserProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagMenuTargetIds, setTagMenuTargetIds] = useState<number[]>([]);
  const [menuPosition, setMenuPosition] = useState({x: 0, y: 0});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  // 标签筛选状态
  const [filterTagIds, setFilterTagIds] = useState<number[]>([]);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [showTagFilter, setShowTagFilter] = useState(false);
  // 重命名状态
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);

  const {files, workspace, isTagSearchMode, searchByTags, clearTagSearch, updateFileNameLocal} = useWorkspaceStore(
    useShallow((state) => ({
      files: state.files,
      workspace: state.workspace,
      isTagSearchMode: state.isTagSearchMode,
      searchByTags: state.searchByTags,
      clearTagSearch: state.clearTagSearch,
      updateFileNameLocal: state.updateFileNameLocal,
    }))
  );

  // 构建文件树结构
  const {currentFiles, breadcrumbs} = useMemo(() => {
    // 在标签搜索模式下，直接显示所有搜索结果
    if (isTagSearchMode) {
      return {currentFiles: files, breadcrumbs: []};
    }

    const normalizedCurrentPath = currentPath.replace(/\\/g, "/");
    
    // 过滤出当前路径下的直接子项
    const filtered = files.filter((file) => {
      const filePath = file.path.replace(/\\/g, "/");
      
      if (!normalizedCurrentPath) {
        // 根目录：只显示第一层
        const parts = filePath.split("/").filter(Boolean);
        return parts.length === 1;
      } else {
        // 子目录：显示该目录下的直接子项
        if (!filePath.startsWith(normalizedCurrentPath + "/")) {
          return false;
        }
        const relativePath = filePath.slice(normalizedCurrentPath.length + 1);
        const parts = relativePath.split("/").filter(Boolean);
        return parts.length === 1;
      }
    });

    // 构建面包屑
    const pathParts = normalizedCurrentPath.split("/").filter(Boolean);
    const crumbs = pathParts.map((part, index) => ({
      name: part,
      path: pathParts.slice(0, index + 1).join("/"),
    }));

    return {currentFiles: filtered, breadcrumbs: crumbs};
  }, [files, currentPath, isTagSearchMode]);

  // 获取选中文件的标签信息
  const selectedFilesWithTags = useMemo(() => {
    const numericIds = selectedIds.map((id) => parseInt(id, 10));
    return files.filter((f) => numericIds.includes(f.id));
  }, [files, selectedIds]);

  const {thumbnails, loadThumbnail, openPreview} = usePreviewStore(
    useShallow((state) => ({
      thumbnails: state.thumbnails,
      loadThumbnail: state.loadThumbnail,
      openPreview: state.openPreview,
    }))
  );

  const {tags, addTagToFiles, removeTagFromFiles} = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      addTagToFiles: state.addTagToFiles,
      removeTagFromFiles: state.removeTagFromFiles,
    }))
  );

  // 从 files 中获取最新的目标文件数据
  const tagMenuTargets = useMemo(() => {
    return files.filter((f) => tagMenuTargetIds.includes(f.id));
  }, [files, tagMenuTargetIds]);

  // 预加载可见文件的缩略图
  useEffect(() => {
    currentFiles.forEach((file) => {
      if (file.type !== "dir") {
        void loadThumbnail(file);
      }
    });
  }, [currentFiles, loadThumbnail]);

  // 转换为 Chonky 格式
  const chonkyFiles = useMemo<ExtendedFileData[]>(() => {
    return fileEntriesToChonky(currentFiles, thumbnails);
  }, [currentFiles, thumbnails]);

  // 文件 Action 列表
  const fileActions = useMemo(
    () => [
      ChonkyActions.SelectAllFiles,
      ChonkyActions.ClearSelection,
      TagFileAction,
      PreviewFileAction,
      RenameFileAction,
    ],
    []
  );

  // 处理文件操作
  const handleFileAction = useCallback(
    (data: any) => {
      const {id, payload, state} = data;

      // 跟踪选中状态
      if (id === ChonkyActions.ChangeSelection.id) {
        const selection = state?.selectedFiles || [];
        setSelectedIds(selection.map((f: FileData) => f.id));
      }

      if (id === ChonkyActions.OpenFiles.id) {
        const targetFile = payload?.targetFile;
        if (targetFile) {
          const entry = getOriginalEntry(targetFile);
          if (entry) {
            if (entry.type === "dir") {
              // 进入文件夹
              setCurrentPath(entry.path.replace(/\\/g, "/"));
            } else {
              openPreview(entry);
            }
          }
        }
      } else if (id === "preview_file") {
        const selectedFiles = state?.selectedFilesForAction;
        if (selectedFiles && selectedFiles.length > 0) {
          const entry = getOriginalEntry(selectedFiles[0]);
          if (entry && entry.type !== "dir") {
            openPreview(entry);
          }
        }
      } else if (id === "tag_file") {
        const selectedFiles = state?.selectedFilesForAction;
        if (selectedFiles && selectedFiles.length > 0) {
          const ids = selectedFiles
            .map((f: FileData) => getOriginalEntry(f)?.id)
            .filter((fid: number | undefined): fid is number => fid !== undefined);
          if (ids.length > 0) {
            setTagMenuTargetIds(ids);
            const rect = containerRef.current?.getBoundingClientRect();
            setMenuPosition({
              x: rect ? rect.left + rect.width / 2 - 112 : 200,
              y: rect ? rect.top + 100 : 200,
            });
            setTagMenuOpen(true);
          }
        }
      } else if (id === "rename_file") {
        const selectedFiles = state?.selectedFilesForAction;
        if (selectedFiles && selectedFiles.length === 1) {
          const entry = getOriginalEntry(selectedFiles[0]);
          if (entry) {
            setRenameTarget(entry);
            setRenameDialogOpen(true);
          }
        }
      }
    },
    [openPreview]
  );

  // 无限滚动检测
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const {scrollTop, scrollHeight, clientHeight} = container;
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loading) {
        onLoadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, loading, onLoadMore]);

  // 重置路径当工作区改变
  useEffect(() => {
    setCurrentPath("");
    setFilterTagIds([]);
    if (isTagSearchMode) {
      clearTagSearch();
    }
  }, [workspace?.id]);

  // 处理标签筛选
  const handleTagFilterToggle = useCallback((tagId: number) => {
    setFilterTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      return [...prev, tagId];
    });
  }, []);

  // 执行标签搜索
  const handleApplyTagFilter = useCallback(() => {
    if (filterTagIds.length === 0) {
      clearTagSearch();
      return;
    }
    searchByTags({
      tagIds: filterTagIds,
      folderPath: currentPath,
      includeSubfolders,
    });
  }, [filterTagIds, currentPath, includeSubfolders, searchByTags, clearTagSearch]);

  // 清除标签筛选
  const handleClearTagFilter = useCallback(() => {
    setFilterTagIds([]);
    clearTagSearch();
  }, [clearTagSearch]);

  // 处理重命名确认
  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!renameTarget) return;
    try {
      await RenameFile(renameTarget.id, newName);
      updateFileNameLocal(renameTarget.id, newName);
      setRenameDialogOpen(false);
      setRenameTarget(null);
    } catch (error) {
      console.error("重命名失败:", error);
      alert("重命名失败: " + (error instanceof Error ? error.message : String(error)));
    }
  }, [renameTarget, updateFileNameLocal]);

  const FileBrowserComponent = ChonkyFileBrowser as any;

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col overflow-hidden">
      {/* 面包屑导航和标签筛选 */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPath("")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                !currentPath ? "text-brand font-medium" : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <Home size={14} />
              <span>{workspace?.name || "根目录"}</span>
            </button>
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center">
                <ChevronRight size={14} className="text-slate-400" />
                <button
                  onClick={() => setCurrentPath(crumb.path)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    index === breadcrumbs.length - 1
                      ? "text-brand font-medium"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <Folder size={14} />
                  <span>{crumb.name}</span>
                </button>
              </div>
            ))}
          </div>
          {/* 标签筛选按钮 */}
          <button
            onClick={() => setShowTagFilter(!showTagFilter)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition ${
              showTagFilter || isTagSearchMode
                ? "bg-brand text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            <Filter size={14} />
            <span>标签筛选</span>
            {filterTagIds.length > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs">
                {filterTagIds.length}
              </span>
            )}
          </button>
        </div>

        {/* 标签筛选面板 */}
        {showTagFilter && (
          <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                选择标签进行筛选（文件需包含所有选中的标签）
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={includeSubfolders}
                  onChange={(e) => setIncludeSubfolders(e.target.checked)}
                  className="rounded border-slate-300 text-brand focus:ring-brand"
                />
                包含子文件夹
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <span className="text-xs text-slate-400">暂无标签</span>
              ) : (
                tags.map((tag) => {
                  const isSelected = filterTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagFilterToggle(tag.id)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        isSelected
                          ? "text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                      style={isSelected ? {backgroundColor: tag.color} : undefined}
                    >
                      {!isSelected && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{backgroundColor: tag.color}}
                        />
                      )}
                      {tag.name}
                      {isSelected && <X size={12} />}
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleApplyTagFilter}
                disabled={filterTagIds.length === 0}
                className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                应用筛选
              </button>
              {isTagSearchMode && (
                <button
                  onClick={handleClearTagFilter}
                  className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  清除筛选
                </button>
              )}
              {isTagSearchMode && (
                <span className="text-xs text-slate-500">
                  当前显示 {files.length} 个匹配文件
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-auto chonky-container">
        {/* 标签搜索无结果提示 */}
        {isTagSearchMode && currentFiles.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <SearchX size={48} className="text-slate-300" />
            <p className="text-sm">没有找到匹配所选标签的文件</p>
            <button
              onClick={handleClearTagFilter}
              className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand/90"
            >
              清除筛选
            </button>
          </div>
        )}
        {/* Chonky 文件浏览器 - 始终渲染 */}
        {!(isTagSearchMode && currentFiles.length === 0 && !loading) && (
          <FileBrowserComponent
            files={chonkyFiles}
            fileActions={fileActions}
            onFileAction={handleFileAction}
            iconComponent={ChonkyIconFA}
            disableDragAndDrop={true}
            disableDefaultFileActions={[
              ChonkyActions.OpenParentFolder.id,
              ChonkyActions.ToggleHiddenFiles.id,
            ]}
            defaultFileViewActionId={ChonkyActions.EnableGridView.id}
          >
            <FileToolbar />
            <FileList />
            <FileContextMenu />
          </FileBrowserComponent>
        )}
      </div>

      {/* 标签管理弹出菜单 */}
      {tagMenuOpen && tagMenuTargets.length > 0 && (
        <TagPopupMenu
          position={menuPosition}
          targets={tagMenuTargets}
          tags={tags}
          onClose={() => setTagMenuOpen(false)}
          onAddTag={addTagToFiles}
          onRemoveTag={removeTagFromFiles}
        />
      )}

      {/* 重命名对话框 */}
      <RenameDialog
        isOpen={renameDialogOpen}
        fileName={renameTarget?.name || ""}
        onClose={() => {
          setRenameDialogOpen(false);
          setRenameTarget(null);
        }}
        onConfirm={handleRenameConfirm}
      />

      {/* 选中文件的标签信息面板 - 固定高度 */}
      {selectedFilesWithTags.length > 0 && (
        <div className="h-9 min-h-9 border-t border-slate-200 bg-white/95 px-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex h-full items-center gap-3">
            <span className="shrink-0 text-xs text-slate-500">
              已选 {selectedFilesWithTags.length} 个文件的标签:
            </span>
            <div className="flex items-center gap-1 overflow-hidden">
              {(() => {
                const allTags = new Map<number, TagInfo>();
                selectedFilesWithTags.forEach((file) => {
                  file.tags?.forEach((tag) => {
                    if (!allTags.has(tag.id)) {
                      allTags.set(tag.id, tag);
                    }
                  });
                });
                const tagList = Array.from(allTags.values());
                if (tagList.length === 0) {
                  return <span className="text-xs text-slate-400">无标签</span>;
                }
                return tagList.map((tag) => (
                  <span
                    key={tag.id}
                    className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-white"
                    style={{backgroundColor: tag.color || "#475569"}}
                  >
                    {tag.name}
                  </span>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 加载指示器 */}
      {loading && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-full bg-brand px-4 py-2 text-sm text-white shadow-lg">
          加载中...
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
