import {useState, useEffect} from "react";
import {useShallow} from "zustand/react/shallow";
import {useWorkspaceStore} from "../store/workspace";
import {Folder, FileText, Clock, X} from "lucide-react";
import {GetRecentItems, RemoveRecentItem} from "../../wailsjs/go/main/App";
import type {main} from "../../wailsjs/go/models";

interface StartupDialogProps {
  onComplete: () => void;
}

const StartupDialog = ({onComplete}: StartupDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState<main.RecentItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const {
    loadWorkspaceFromFile,
    selectWorkspace,
    openRecentItem,
  } = useWorkspaceStore(
    useShallow((state) => ({
      loadWorkspaceFromFile: state.loadWorkspaceFromFile,
      selectWorkspace: state.selectWorkspace,
      openRecentItem: state.openRecentItem,
    }))
  );

  // 加载最近打开的项目
  useEffect(() => {
    const loadRecentItems = async () => {
      try {
        const items = await GetRecentItems();
        setRecentItems(items || []);
      } catch (err) {
        console.error("加载最近项目失败:", err);
      } finally {
        setLoadingRecent(false);
      }
    };
    loadRecentItems();
  }, []);

  const handleChoice = async (choice: "workspace" | "folder") => {
    setLoading(true);
    setError(null);

    try {
      if (choice === "workspace") {
        await loadWorkspaceFromFile();
      } else {
        await selectWorkspace();
      }
      onComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecent = async (item: main.RecentItem) => {
    setLoading(true);
    setError(null);

    try {
      await openRecentItem(item.path, item.type);
      onComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await RemoveRecentItem(path);
      setRecentItems((prev) => prev.filter((item) => item.path !== path));
    } catch (err) {
      console.error("移除最近项目失败:", err);
    }
  };

  const handleCancel = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] max-h-[80vh] rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800 overflow-hidden flex flex-col">
        <div className="mb-4 text-center flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            TagExplorer
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            选择您要如何开始使用
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 dark:bg-red-900/20 flex-shrink-0">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* 最近打开的项目 */}
        {!loadingRecent && recentItems.length > 0 && (
          <div className="mb-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                最近打开
              </span>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {recentItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleOpenRecent(item)}
                  disabled={loading}
                  className="group flex w-full items-center gap-3 rounded-md border border-slate-100 p-2.5 text-left transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded ${
                    item.type === "workspace" 
                      ? "bg-brand/10 text-brand" 
                      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  }`}>
                    {item.type === "workspace" ? <FileText size={16} /> : <Folder size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {item.name}
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {item.path}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleRemoveRecent(e, item.path)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-opacity"
                    title="从列表中移除"
                  >
                    <X size={14} className="text-slate-400" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 分隔线 */}
        {!loadingRecent && recentItems.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 my-3 flex-shrink-0" />
        )}

        <div className="space-y-3 flex-shrink-0">
          <button
            onClick={() => handleChoice("workspace")}
            disabled={loading}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-4 text-left transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <FileText size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-900 dark:text-white">
                打开工作区文件
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                加载已保存的 .teworkplace 配置文件
              </p>
            </div>
          </button>

          <button
            onClick={() => handleChoice("folder")}
            disabled={loading}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-4 text-left transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              <Folder size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-900 dark:text-white">
                打开文件夹
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                选择一个文件夹开始浏览
              </p>
            </div>
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            取消
          </button>
        </div>

        {loading && (
          <div className="mt-4 text-center flex-shrink-0">
            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand"></div>
              处理中...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StartupDialog;
