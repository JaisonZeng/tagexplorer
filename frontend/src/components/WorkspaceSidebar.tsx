import {useState} from "react";
import {useShallow} from "zustand/react/shallow";
import {useWorkspaceStore, WorkspaceFolder, WorkspaceConfig} from "../store/workspace";
import {
  Folder,
  FolderOpen,
  Plus,
  X,
  Save,
  FolderInput,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const WorkspaceSidebar = () => {
  const {
    folders,
    activeFolderId,
    selecting,
    addFolder,
    removeFolder,
    setActiveFolder,
    saveWorkspaceToFile,
    loadWorkspaceFromFile,
  } = useWorkspaceStore(
    useShallow((state) => ({
      folders: state.folders,
      activeFolderId: state.activeFolderId,
      selecting: state.selecting,
      addFolder: state.addFolder,
      removeFolder: state.removeFolder,
      setActiveFolder: state.setActiveFolder,
      saveWorkspaceToFile: state.saveWorkspaceToFile,
      loadWorkspaceFromFile: state.loadWorkspaceFromFile,
    }))
  );

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [configName, setConfigName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveConfig = async () => {
    if (configName.trim() && !saving) {
      setSaving(true);
      try {
        const savedPath = await saveWorkspaceToFile(configName.trim());
        if (savedPath) {
          setConfigName("");
          setShowSaveDialog(false);
        }
      } catch (error) {
        console.error("保存工作区配置失败:", error);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleLoadConfig = async () => {
    try {
      await loadWorkspaceFromFile();
    } catch (error) {
      console.error("加载工作区配置失败:", error);
    }
  };

  return (
    <aside className="flex w-48 flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          工作区
        </span>
        <div className="flex items-center gap-1">
          {folders.length > 0 && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
              title="保存工作区配置到文件"
            >
              <Save size={14} />
            </button>
          )}
          <button
            onClick={handleLoadConfig}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
            title="从文件加载工作区配置"
          >
            <FolderInput size={14} />
          </button>
          <button
            onClick={() => addFolder()}
            disabled={selecting}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 disabled:opacity-50"
            title="添加文件夹"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* 保存配置对话框 */}
      {showSaveDialog && (
        <div className="border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-2 text-xs text-slate-500">保存当前工作区配置</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              placeholder="配置名称"
              className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700"
              onKeyDown={(e) => e.key === "Enter" && handleSaveConfig()}
              autoFocus
            />
            <button
              onClick={handleSaveConfig}
              disabled={!configName.trim() || saving}
              className="rounded bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              取消
            </button>
          </div>
        </div>
      )}



      {/* 文件夹列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Folder size={24} className="mb-2 text-slate-300" />
            <p className="text-xs text-slate-400">暂无文件夹</p>
            <button
              onClick={() => addFolder()}
              disabled={selecting}
              className="mt-2 text-xs text-brand hover:underline disabled:opacity-50"
            >
              添加文件夹
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {folders.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                isActive={folder.id === activeFolderId}
                onSelect={() => void setActiveFolder(folder.id)}
                onRemove={() => removeFolder(folder.id)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

interface FolderItemProps {
  folder: WorkspaceFolder;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

const FolderItem = ({folder, isActive, onSelect, onRemove}: FolderItemProps) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm transition cursor-pointer ${
          isActive
            ? "bg-brand/10 text-brand dark:bg-brand/20"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        }`}
        onClick={() => void onSelect()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {isActive ? (
          <FolderOpen size={14} className="flex-shrink-0" />
        ) : (
          <Folder size={14} className="flex-shrink-0" />
        )}
        <span className="flex-1 truncate text-xs font-medium" title={folder.path}>
          {folder.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded p-0.5 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
          title="移除文件夹"
        >
          <X size={12} />
        </button>
      </div>
      {expanded && (
        <div className="ml-4 border-l border-slate-200 pl-2 dark:border-slate-700">
          <p className="truncate py-1 text-xs text-slate-400" title={folder.path}>
            {folder.path}
          </p>
        </div>
      )}
    </div>
  );
};

export default WorkspaceSidebar;
