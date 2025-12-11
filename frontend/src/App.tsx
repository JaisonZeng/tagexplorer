import {useState} from "react";
import FileBrowser from "./components/FileBrowser";
import FilePreview from "./components/FilePreview";
import TagSidebar from "./components/TagSidebar";
import MenuBar from "./components/MenuBar";
import StatusBar from "./components/StatusBar";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import {useTheme} from "./hooks/useTheme";
import {useWorkspaceStore} from "./store/workspace";
import {useShallow} from "zustand/react/shallow";
import {FolderOpen, Plus} from "lucide-react";

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
    }))
  );

  const {preference, resolvedTheme, cyclePreference} = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceSidebarVisible, setWorkspaceSidebarVisible] = useState(true);

  const handleSelectWorkspace = async () => {
    await selectWorkspace();
  };

  const handleAddFolder = async () => {
    await addFolder();
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
              {files.length === 0 && !loading ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 m-4">
                  <p>当前文件夹没有文件</p>
                  <button
                    onClick={handleAddFolder}
                    disabled={selecting}
                    className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
                  >
                    <Plus size={16} />
                    添加文件夹
                  </button>
                </div>
              ) : (
                <FileBrowser
                  onLoadMore={() => fetchNextPage()}
                  hasMore={hasMore}
                  loading={loading}
                />
              )}
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
                    onClick={handleSelectWorkspace}
                    disabled={selecting}
                    className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
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
    </div>
  );
}

export default App;
