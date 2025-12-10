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
    savedConfigs,
    selecting,
    addFolder,
    removeFolder,
    setActiveFolder,
    saveCurrentConfig,
    loadConfig,
    deleteConfig,
  } = useWorkspaceStore(
    useShallow((state) => ({
      folders: state.folders,
      activeFolderId: state.activeFolderId,
      savedConfigs: state.savedConfigs,
      selecting: state.selecting,
      addFolder: state.addFolder,
      removeFolder: state.removeFolder,
      setActiveFolder: state.setActiveFolder,
      saveCurrentConfig: state.saveCurrentConfig,
      loadConfig: state.loadConfig,
      deleteConfig: state.deleteConfig,
    }))
  );

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [configName, setConfigName] = useState("");
  const [showConfigs, setShowConfigs] = useState(false);

  const handleSaveConfig = () => {
    if (configName.trim()) {
      saveCurrentConfig(configName.trim());
      setConfigName("");
      setShowSaveDialog(false);
    }
  };

  const handleLoadConfig = async (config: WorkspaceConfig) => {
    await loadConfig(config);
    setShowConfigs(false);
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
              title="保存工作区配置"
            >
              <Save size={14} />
            </button>
          )}
          {savedConfigs.length > 0 && (
            <button
              onClick={() => setShowConfigs(!showConfigs)}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
              title="加载工作区配置"
            >
              <FolderInput size={14} />
            </button>
          )}
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
              disabled={!configName.trim()}
              className="rounded bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark disabled:opacity-50"
            >
              保存
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

      {/* 已保存的配置列表 */}
      {showConfigs && savedConfigs.length > 0 && (
        <div className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="p-2">
            <p className="mb-2 text-xs text-slate-500">已保存的配置</p>
            <div className="space-y-1">
              {savedConfigs.map((config) => (
                <div
                  key={config.name}
                  className="group flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <button
                    onClick={() => handleLoadConfig(config)}
                    className="flex-1 text-left text-slate-700 dark:text-slate-300"
                  >
                    <span className="font-medium">{config.name}</span>
                    <span className="ml-2 text-slate-400">
                      ({config.folders.length} 个文件夹)
                    </span>
                  </button>
                  <button
                    onClick={() => deleteConfig(config.name)}
                    className="rounded p-1 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
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
                onSelect={() => setActiveFolder(folder.id)}
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
        onClick={onSelect}
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
