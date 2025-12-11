import {Folder, File, HardDrive, Loader2, FolderTree} from "lucide-react";

interface StatusBarProps {
  workspacePath?: string;
  fileCount: number;
  directoryCount: number;
  loadedCount: number;
  totalCount: number;
  loading: boolean;
  selectedCount: number;
  folderCount?: number;
}

const StatusBar = ({
  workspacePath,
  fileCount,
  directoryCount,
  loadedCount,
  totalCount,
  loading,
  selectedCount,
  folderCount = 0,
}: StatusBarProps) => {
  return (
    <footer className="flex h-6 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex items-center gap-4">
        {folderCount > 0 && (
          <span className="flex items-center gap-1 text-brand" title="工作区文件夹数">
            <FolderTree size={12} />
            {folderCount} 个工作区
          </span>
        )}
        {workspacePath ? (
          <>
            <span className="flex items-center gap-1" title="当前文件夹路径">
              <HardDrive size={12} />
              <span className="max-w-xs truncate">{workspacePath}</span>
            </span>
            <span className="flex items-center gap-1" title="已索引文件">
              <File size={12} />
              {fileCount}
            </span>
            <span className="flex items-center gap-1" title="已索引文件夹">
              <Folder size={12} />
              {directoryCount}
            </span>
          </>
        ) : (
          folderCount === 0 && <span>未选择工作区</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {selectedCount > 0 && (
          <span className="text-brand">已选择 {selectedCount} 项</span>
        )}
        {loading && (
          <span className="flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            加载中...
          </span>
        )}
        {totalCount > 0 && (
          <span>
            {loadedCount} / {totalCount}
          </span>
        )}
      </div>
    </footer>
  );
};

export default StatusBar;
