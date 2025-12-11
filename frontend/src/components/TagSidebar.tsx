import {FormEvent, useEffect, useState, useRef} from "react";
import {useShallow} from "zustand/react/shallow";
import {useTagStore} from "../store/tags";
import {useWorkspaceStore} from "../store/workspace";
import {
  Tags,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  File,
  Folder,
  Palette,
  Check,
  X,
  MoreHorizontal,
} from "lucide-react";
import type {TagInfo} from "../types/files";

const DEFAULT_COLOR = "#94a3b8";

// 预设颜色（包含自动识别标签的默认颜色 #94a3b8）
const PRESET_COLORS = [
  // 红橙黄
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  // 绿青
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  // 蓝紫
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  // 粉紫红
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  // 灰色系（包含默认颜色）
  "#94a3b8", "#64748b", "#475569", "#1e293b",
];

interface TagSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// 颜色选择器组件
interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

const ColorPicker = ({color, onChange, onClose, anchorRef}: ColorPickerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [customColor, setCustomColor] = useState(color);
  const [position, setPosition] = useState({top: 0, left: 0});

  useEffect(() => {
    // 计算位置，确保在视口内
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.left),
      });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
      style={{top: position.top, left: position.left}}
    >
      <div className="mb-2 grid grid-cols-5 gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              onChange(c);
              onClose();
            }}
            className={`h-6 w-6 rounded-md transition hover:scale-110 ${
              color === c ? "ring-2 ring-brand ring-offset-1" : ""
            }`}
            style={{backgroundColor: c}}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
        <input
          type="color"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700"
        />
        <button
          type="button"
          onClick={() => {
            onChange(customColor);
            onClose();
          }}
          className="rounded bg-brand p-1 text-white hover:bg-brand-dark"
        >
          <Check size={12} />
        </button>
      </div>
    </div>
  );
};

// 单个标签项组件
interface TagItemProps {
  tag: TagInfo;
  selected: boolean;
  onSelect: (tagId: number, append: boolean) => void;
  onDelete: (tagId: number) => void;
  onUpdateColor: (tagId: number, color: string) => void;
}

// 批量颜色选择按钮组件
interface BatchColorPickerButtonProps {
  show: boolean;
  onShow: () => void;
  onClose: () => void;
  onChange: (color: string) => void;
}

const BatchColorPickerButton = ({show, onShow, onClose, onChange}: BatchColorPickerButtonProps) => {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={onShow}
        className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700"
        title="批量修改颜色"
      >
        <Palette size={14} />
      </button>
      {show && (
        <ColorPicker
          color={DEFAULT_COLOR}
          onChange={onChange}
          onClose={onClose}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
};

const TagItem = ({tag, selected, onSelect, onDelete, onUpdateColor}: TagItemProps) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className={`group relative flex items-center justify-between rounded-md px-3 py-2 text-sm transition cursor-pointer ${
        selected
          ? "bg-brand/10 text-brand dark:bg-brand/20"
          : "hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
      onClick={(e) => {
        onSelect(tag.id, e.ctrlKey || e.metaKey);
      }}
    >
      <div className="flex items-center gap-2">
        <button
          ref={colorBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowColorPicker(true);
          }}
          className="relative h-3 w-3 rounded-full transition hover:ring-2 hover:ring-brand hover:ring-offset-1"
          style={{backgroundColor: tag.color}}
          title="修改颜色"
        />
        <span className={selected ? "font-medium" : "text-slate-700 dark:text-slate-200"}>
          {tag.name}
        </span>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-700"
        >
          <MoreHorizontal size={14} />
        </button>

        {showMenu && (
          <div className="fixed z-[9999] mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            style={{
              top: menuRef.current?.getBoundingClientRect().bottom ?? 0,
              left: (menuRef.current?.getBoundingClientRect().right ?? 0) - 128,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowColorPicker(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Palette size={12} />
              修改颜色
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onDelete(tag.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={12} />
              删除标签
            </button>
          </div>
        )}
      </div>

      {showColorPicker && (
        <ColorPicker
          color={tag.color}
          onChange={(color) => onUpdateColor(tag.id, color)}
          onClose={() => setShowColorPicker(false)}
          anchorRef={colorBtnRef}
        />
      )}
    </div>
  );
};

const TagSidebar = ({collapsed, onToggle}: TagSidebarProps) => {
  const {
    tags,
    loading,
    error,
    initialized,
    fetchTags,
    createTag,
    deleteTag,
    updateTagColor,
    deleteTags,
  } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      loading: state.loading,
      error: state.error,
      initialized: state.initialized,
      fetchTags: state.fetchTags,
      createTag: state.createTag,
      deleteTag: state.deleteTag,
      updateTagColor: state.updateTagColor,
      deleteTags: state.deleteTags,
    })),
  );

  const {workspace, stats} = useWorkspaceStore(
    useShallow((state) => ({
      workspace: state.workspace,
      stats: state.stats,
    })),
  );

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showBatchColorPicker, setShowBatchColorPicker] = useState(false);

  useEffect(() => {
    if (!initialized) {
      void fetchTags();
    }
  }, [initialized, fetchTags]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await createTag(name, color);
    setName("");
  };

  const handleSelectTag = (tagId: number, append: boolean) => {
    if (append) {
      setSelectedTagIds((prev) =>
        prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
      );
    } else {
      setSelectedTagIds((prev) =>
        prev.length === 1 && prev[0] === tagId ? [] : [tagId]
      );
    }
  };

  const handleBatchDelete = async () => {
    if (selectedTagIds.length === 0) return;
    if (confirm(`确定要删除选中的 ${selectedTagIds.length} 个标签吗？`)) {
      await deleteTags(selectedTagIds);
      setSelectedTagIds([]);
    }
  };

  const handleBatchColorChange = async (newColor: string) => {
    for (const tagId of selectedTagIds) {
      await updateTagColor(tagId, newColor);
    }
    setShowBatchColorPicker(false);
  };

  const handleSelectAll = () => {
    if (selectedTagIds.length === tags.length) {
      setSelectedTagIds([]);
    } else {
      setSelectedTagIds(tags.map((t) => t.id));
    }
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 flex-shrink-0 flex-col items-center border-r border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={onToggle}
          className="mb-4 rounded-md p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          title="展开侧边栏"
        >
          <ChevronRight size={18} />
        </button>
        <div className="flex flex-col gap-2">
          <button className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800" title="标签库">
            <Tags size={18} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Tags size={18} className="text-brand" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">标签库</span>
        </div>
        <div className="flex items-center gap-1">
          {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          <button
            onClick={onToggle}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            title="收起侧边栏"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {workspace && (
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <FolderOpen size={14} />
            <span className="truncate">{workspace.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-100 p-2 text-center dark:bg-slate-800">
              <div className="flex items-center justify-center gap-1 text-lg font-bold text-slate-900 dark:text-white">
                <File size={14} className="text-slate-400" />
                {stats?.fileCount ?? 0}
              </div>
              <p className="text-xs text-slate-500">文件</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-2 text-center dark:bg-slate-800">
              <div className="flex items-center justify-center gap-1 text-lg font-bold text-slate-900 dark:text-white">
                <Folder size={14} className="text-slate-400" />
                {stats?.directoryCount ?? 0}
              </div>
              <p className="text-xs text-slate-500">文件夹</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {/* 新建标签表单 */}
        <form onSubmit={handleSubmit} className="mb-3">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) {
                  event.preventDefault();
                  handleSubmit(event);
                }
              }}
              placeholder="新标签名称"
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                const colorInput = document.getElementById("tag-color-input") as HTMLInputElement;
                colorInput?.click();
              }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-slate-300 transition hover:border-slate-400 dark:border-slate-600"
              style={{backgroundColor: color}}
              title="选择颜色"
            >
              <input
                id="tag-color-input"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="invisible absolute h-0 w-0"
              />
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-brand text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              title="添加标签 (Enter)"
            >
              <Plus size={16} />
            </button>
          </div>
        </form>

        {/* 批量操作工具栏 */}
        {tags.length > 0 && (
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-slate-500 hover:text-brand"
            >
              {selectedTagIds.length === tags.length ? "取消全选" : "全选"}
            </button>
            {selectedTagIds.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="mr-2 text-xs text-slate-500">
                  已选 {selectedTagIds.length} 个
                </span>
                <BatchColorPickerButton
                  show={showBatchColorPicker}
                  onShow={() => setShowBatchColorPicker(true)}
                  onClose={() => setShowBatchColorPicker(false)}
                  onChange={handleBatchColorChange}
                />
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="rounded p-1.5 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="批量删除"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="清除选择"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}

        {/* 标签列表 */}
        <div className="space-y-1">
          {tags.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">暂无标签</p>
          ) : (
            tags.map((tag) => (
              <TagItem
                key={tag.id}
                tag={tag}
                selected={selectedTagIds.includes(tag.id)}
                onSelect={handleSelectTag}
                onDelete={deleteTag}
                onUpdateColor={updateTagColor}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
};

export default TagSidebar;
