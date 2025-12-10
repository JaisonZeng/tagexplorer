import {useCallback} from "react";
import FileGrid from "./components/FileGrid";
import PreviewModal from "./components/PreviewModal";
import TagSidebar from "./components/TagSidebar";
import {ThemeToggle} from "./components/ThemeToggle";
import {useTheme} from "./hooks/useTheme";
import {useWorkspaceStore} from "./store/workspace";
import {useShallow} from "zustand/react/shallow";

function App() {
  const {
    workspace,
    stats,
    files,
    total,
    selectWorkspace,
    fetchNextPage,
    loading,
    selecting,
    hasMore,
    error,
    selectedFileIds,
    selectFile,
  } = useWorkspaceStore(
    useShallow((state) => ({
      workspace: state.workspace,
      stats: state.stats,
      files: state.files,
      total: state.total,
      selectWorkspace: state.selectWorkspace,
      fetchNextPage: state.fetchNextPage,
      loading: state.loading,
      selecting: state.selecting,
      hasMore: state.hasMore,
      error: state.error,
      selectedFileIds: state.selectedFileIds,
      selectFile: state.selectFile,
    })),
  );

  const {preference, resolvedTheme, cyclePreference} = useTheme();

  const handleSelectWorkspace = async () => {
    await selectWorkspace();
  };

  const createdAtLabel = workspace?.createdAt
    ? new Date(workspace.createdAt).toLocaleDateString()
    : "-";

  const handleSelectFile = useCallback(
    (fileId: number, index: number, options: {append: boolean; range: boolean}) => {
      selectFile(fileId, index, options);
    },
    [selectFile],
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-white">
      <header className="border-b border-slate-200 bg-white/80 px-6 py-5 shadow-lg shadow-slate-200/60 backdrop-blur dark:border-slate-900 dark:bg-slate-950/80 dark:shadow-slate-950/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-dark dark:text-brand">Tag Explorer</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">智能标签工作区</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">扫描本地目录、索引文件并以标签方式管理</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <ThemeToggle
              preference={preference}
              resolvedTheme={resolvedTheme}
              onToggle={cyclePreference}
            />
            {workspace && (
              <span className="max-w-xl truncate text-xs text-slate-500 dark:text-slate-400">{workspace.path}</span>
            )}
            <button
              onClick={handleSelectWorkspace}
              disabled={selecting}
              className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {selecting ? "扫描中..." : "选择工作区"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center overflow-hidden px-6 py-6">
        <div className="flex h-full w-full max-w-7xl gap-6">
          <TagSidebar/>
          <div className="flex flex-1 flex-col gap-5">
          {error && (
            <div className="rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {workspace ? (
            <>
              <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="col-span-2 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">当前工作区</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{workspace.name}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800/80 dark:text-slate-300">
                      {createdAtLabel}
                    </span>
                  </div>
                  <p className="mt-4 truncate text-xs text-slate-500">{workspace.path}</p>
                  <div className="mt-6 grid grid-cols-2 gap-4 text-center md:text-left">
                    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800/80 dark:bg-slate-900/40">
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.fileCount ?? 0}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">已索引文件</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-800/80 dark:bg-slate-900/40">
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.directoryCount ?? 0}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">已索引文件夹</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/50">
                  <p className="text-sm text-slate-500 dark:text-slate-400">文件加载进度</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{files.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">已加载 / {total}</p>
                  <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{
                        width: total > 0 ? `${Math.min(100, (files.length / total) * 100)}%` : "0%",
                      }}
                    />
                  </div>
                  {loading && (
                    <p className="mt-2 text-xs text-slate-400">正在加载更多文件...</p>
                  )}
                </div>
              </section>

              <section className="flex-1 min-h-0">
                {files.length === 0 && !loading ? (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-800">
                    当前工作区没有文件，请尝试选择其他目录。
                  </div>
                ) : (
                  <FileGrid
                    files={files}
                    loading={loading}
                    hasMore={hasMore}
                    onLoadMore={() => fetchNextPage()}
                    selectedFileIds={selectedFileIds}
                    onSelect={handleSelectFile}
                  />
                )}
              </section>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-center dark:border-slate-800 dark:bg-slate-900/30">
              <div>
                <p className="text-xl font-semibold text-slate-900 dark:text-white">尚未选择工作区</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  点击右上角按钮，选择任意本地目录完成初始化。
                </p>
              </div>
            </div>
          )}
          </div>
        </div>
      </main>
      <PreviewModal/>
    </div>
  );
}

export default App;
