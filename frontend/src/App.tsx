import {useState, useEffect} from "react";
import FileBrowser from "./components/FileBrowser";
import FilePreview from "./components/FilePreview";
import TagSidebar from "./components/TagSidebar";
import MenuBar from "./components/MenuBar";
import StatusBar from "./components/StatusBar";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import StartupDialog from "./components/StartupDialog";
import {useTheme} from "./hooks/useTheme";
import {useWorkspaceStore} from "./store/workspace";
import {useShallow} from "zustand/react/shallow";
import {FolderOpen, Plus, FileText} from "lucide-react";
import {disableZoom, resetZoom} from "./utils/disableZoom";
import SettingsDialog from "./components/SettingsDialog";
import {useSettingsStore} from "./store/settings";

function App() {
  const {
    workspace,
    stats,
    files,
    total,
    folders,
    activeFolderId,
    selectWorkspace,
    addFolder,
    fetchNextPage,
    loading,
    selecting,
    hasMore,
    error,
    selectedFileIds,
    loadWorkspaceFromFile,
  } = useWorkspaceStore(
    useShallow((state) => ({
      workspace: state.workspace,
      stats: state.stats,
      files: state.files,
      total: state.total,
      folders: state.folders,
      activeFolderId: state.activeFolderId,
      selectWorkspace: state.selectWorkspace,
      addFolder: state.addFolder,
      fetchNextPage: state.fetchNextPage,
      loading: state.loading,
      selecting: state.selecting,
      hasMore: state.hasMore,
      error: state.error,
      selectedFileIds: state.selectedFileIds,
      loadWorkspaceFromFile: state.loadWorkspaceFromFile,
    }))
  );

  const {preference, resolvedTheme, cyclePreference} = useTheme();
  const {loadSettings} = useSettingsStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceSidebarVisible, setWorkspaceSidebarVisible] = useState(true);
  const [showStartupDialog, setShowStartupDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // 检查是否需要显示启动对话框
  useEffect(() => {
    if (!hasInitialized && folders.length === 0 && !workspace) {
      setShowStartupDialog(true);
    }
    setHasInitialized(true);
  }, [hasInitialized, folders.length, workspace]);

  // 禁用全局缩放功能
  useEffect(() => {
    // 重置页面缩放到 100%
    resetZoom();
    
    // 禁用缩放事件
    const cleanup = disableZoom();
    
    // 返回清理函数
    return cleanup;
  }, []);

  // 应用启动时加载设置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSelectWorkspace = async () => {
    await selectWorkspace();
  };

  const handleAddFolder = async () => {
    await addFolder();
  };

  const handleLoadWorkspace = async () => {
    await loadWorkspaceFromFile();
  };

  const handleStartupComplete = () => {
    setShowStartupDialog(false);
  };

  const hasWorkspace = folders.length > 0 || workspace;

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-white">
      <MenuBar
        preference={preference}
        resolvedTheme={resolvedTheme}
        onToggleTheme={cyclePreference}
        onToggleWorkspaceSidebar={() => setWorkspaceSidebarVisible(!workspaceSidebarVisible)}
        workspaceSidebarVisible={workspaceSidebarVisible}
        onOpenSettings={() => setShowSettingsDialog(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 工作区文件夹侧边栏 */}
        {workspaceSidebarVisible && hasWorkspace && (
          <WorkspaceSidebar />
        )}

        <TagSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          {error && (
            <div className="mx-4 mt-4 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {hasWorkspace ? (
            <div className="relative flex-1 overflow-hidden">
              <FileBrowser
                onLoadMore={() => fetchNextPage()}
                hasMore={hasMore}
                loading={loading}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800">
                  <FolderOpen size={32} className="text-slate-400" />
                </div>
                <p className="text-lg font-medium text-slate-900 dark:text-white">
                  尚未选择工作区
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  点击下方按钮选择工作区目录，支持添加多个文件夹
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    onClick={handleLoadWorkspace}
                    disabled={selecting}
                    className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
                  >
                    <FileText size={16} />
                    打开工作区文件
                  </button>
                  <button
                    onClick={handleSelectWorkspace}
                    disabled={selecting}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <FolderOpen size={16} />
                    {selecting ? "扫描中..." : "选择文件夹"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <StatusBar
        workspacePath={workspace?.path}
        fileCount={stats?.fileCount ?? 0}
        directoryCount={stats?.directoryCount ?? 0}
        loadedCount={files.length}
        totalCount={total}
        loading={loading}
        selectedCount={selectedFileIds.length}
        folderCount={folders.length}
      />

      <FilePreview />

      {/* 启动对话框 */}
      {showStartupDialog && (
        <StartupDialog onComplete={handleStartupComplete} />
      )}

      {/* 设置对话框 */}
      <SettingsDialog 
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />
    </div>
  );
}

export default App;
