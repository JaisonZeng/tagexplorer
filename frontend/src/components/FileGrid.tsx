import {
  FixedSizeGrid as Grid,
  GridChildComponentProps,
  GridOnItemsRenderedProps,
} from "react-window";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {MouseEvent as ReactMouseEvent} from "react";
import type {FileEntry, TagInfo} from "../types/files";
import {useShallow} from "zustand/react/shallow";
import {useTagStore} from "../store/tags";
import {thumbnailKey, usePreviewStore} from "../store/preview";

interface FileGridProps {
  files: FileEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  selectedFileIds: number[];
  onSelect: (fileID: number, index: number, options: SelectionOptions) => void;
}

interface GridItemData {
  files: FileEntry[];
  columnCount: number;
  selectedFileIds: number[];
  onSelect: (fileID: number, index: number, options: SelectionOptions) => void;
  fileMap: Map<number, FileEntry>;
  thumbnails: Record<string, string>;
  loadThumbnail: (file: FileEntry) => Promise<string | undefined>;
  openPreview: (file: FileEntry) => void;
}

const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 150;

type SelectionOptions = {append: boolean; range: boolean};

const FileGrid = ({files, loading, hasMore, onLoadMore, selectedFileIds, onSelect}: FileGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({width: 960, height: 640});
  const {thumbnails, loadThumbnail, openPreview} = usePreviewStore(
    useShallow((state) => ({
      thumbnails: state.thumbnails,
      loadThumbnail: state.loadThumbnail,
      openPreview: state.openPreview,
    })),
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      setDimensions({
        width: element.clientWidth,
        height: element.clientHeight,
      });
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columnCount = Math.max(1, Math.floor(dimensions.width / COLUMN_WIDTH));
  const rowCount = Math.max(1, Math.ceil(files.length / columnCount || 1));
  const fileMap = useMemo(() => {
    const map = new Map<number, FileEntry>();
    files.forEach((file) => map.set(file.id, file));
    return map;
  }, [files]);

  const itemData = useMemo<GridItemData>(
    () => ({
      files,
      columnCount,
      selectedFileIds,
      onSelect,
      fileMap,
      thumbnails,
      loadThumbnail,
      openPreview,
    }),
    [files, columnCount, selectedFileIds, onSelect, fileMap, thumbnails, loadThumbnail, openPreview],
  );

  const handleItemsRendered = useCallback(
    ({visibleRowStopIndex}: GridOnItemsRenderedProps) => {
      const itemsVisible = (visibleRowStopIndex + 1) * columnCount;
      if (!loading && hasMore && itemsVisible >= files.length - columnCount) {
        onLoadMore();
      }
    },
    [columnCount, files.length, hasMore, loading, onLoadMore],
  );

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
    >
      <Grid
        columnCount={columnCount}
        columnWidth={COLUMN_WIDTH}
        height={Math.max(240, dimensions.height)}
        rowCount={rowCount}
        rowHeight={ROW_HEIGHT}
        width={Math.max(COLUMN_WIDTH, dimensions.width)}
        itemData={itemData}
        onItemsRendered={handleItemsRendered}
      >
        {Cell}
      </Grid>
    </div>
  );
};

const Cell = memo(
  ({columnIndex, rowIndex, style, data}: GridChildComponentProps<GridItemData>) => {
    const index = rowIndex * data.columnCount + columnIndex;
    const file = data.files[index];
    const isSelected = file ? data.selectedFileIds.includes(file.id) : false;

    return (
      <div style={style} className="p-3">
        {file ? (
          <FileCard
            file={file}
            index={index}
            isSelected={isSelected}
            onSelect={data.onSelect}
            selectedFileIds={data.selectedFileIds}
            fileMap={data.fileMap}
            thumbnails={data.thumbnails}
            loadThumbnail={data.loadThumbnail}
            onPreview={data.openPreview}
          />
        ) : (
          <div className="h-full rounded-xl border border-dashed border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40"/>
        )}
      </div>
    );
  },
);

Cell.displayName = "Cell";

interface FileCardProps {
  file: FileEntry;
  index: number;
  isSelected: boolean;
  onSelect: (fileID: number, index: number, options: SelectionOptions) => void;
  selectedFileIds: number[];
  fileMap: Map<number, FileEntry>;
  thumbnails: Record<string, string>;
  loadThumbnail: (file: FileEntry) => Promise<string | undefined>;
  onPreview: (file: FileEntry) => void;
}

const FileCard = ({
  file,
  index,
  isSelected,
  onSelect,
  selectedFileIds,
  fileMap,
  thumbnails,
  loadThumbnail,
  onPreview,
}: FileCardProps) => {
  const isDir = file.type === "dir";
  const icon = isDir ? "📁" : "📄";
  const key = thumbnailKey(file);
  const thumbnail = thumbnails[key];

  useEffect(() => {
    if (!isDir) {
      void loadThumbnail(file);
    }
  }, [file.id, file.hash, file.modTime, isDir, loadThumbnail, file]);

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    onSelect(file.id, index, {append: event.ctrlKey || event.metaKey, range: event.shiftKey});
  };

  return (
    <div
      onClick={handleClick}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onPreview(file);
      }}
      className={`flex h-full cursor-pointer flex-col gap-3 rounded-2xl border p-4 shadow-inner transition
        ${isSelected
        ? "border-brand shadow-glow"
        : "border-slate-200 shadow-slate-200 dark:border-slate-800 dark:shadow-slate-950"}
        bg-white dark:bg-slate-900/70`}
    >
      <div className="relative h-32 w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
        {thumbnail && !isDir ? (
          <img src={thumbnail} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-slate-500">
            <span className="text-3xl">{icon}</span>
            <span className="text-xs">{isDir ? "文件夹" : "加载缩略图..."}</span>
          </div>
        )}
        <button
          type="button"
          className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-3 py-1 text-xs text-white shadow hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isDir}
          onClick={(event) => {
            event.stopPropagation();
            if (!isDir) {
              onPreview(file);
            }
          }}
        >
          预览
        </button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl text-slate-700 dark:bg-slate-800 dark:text-white">
            {icon}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {file.name || (isDir ? "未命名文件夹" : "未命名文件")}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{file.path || "/"}</p>
          </div>
        </div>
        <TagMenu file={file} selectedFileIds={selectedFileIds} fileMap={fileMap}/>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{formatSize(file.size)}</span>
        <span>{formatDate(file.modTime)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {file.tags.length === 0 ? (
          <span className="rounded-full border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-400 dark:border-slate-700">
            未打标签
          </span>
        ) : (
          file.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{backgroundColor: tag.color || "#475569"}}
            >
              {tag.name}
            </span>
          ))
        )}
      </div>
    </div>
  );
};

const TagMenu = ({
  file,
  selectedFileIds,
  fileMap,
}: {
  file: FileEntry;
  selectedFileIds: number[];
  fileMap: Map<number, FileEntry>;
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {tags, addTagToFiles, removeTagFromFiles} = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      addTagToFiles: state.addTagToFiles,
      removeTagFromFiles: state.removeTagFromFiles,
    })),
  );

  const targetIds =
    selectedFileIds.length > 0 && selectedFileIds.includes(file.id) ? selectedFileIds : [file.id];

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const hasTagState = (tagId: number) => {
    const everyHas = targetIds.every((id) => {
      const entry = fileMap.get(id);
      return entry?.tags?.some((tag) => tag.id === tagId);
    });
    const someHas = targetIds.some((id) => {
      const entry = fileMap.get(id);
      return entry?.tags?.some((tag) => tag.id === tagId);
    });
    return {everyHas, someHas};
  };

  const handleToggle = async (tag: TagInfo, shouldAdd: boolean) => {
    if (shouldAdd) {
      await addTagToFiles(tag.id, targetIds);
    } else {
      await removeTagFromFiles(tag.id, targetIds);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-500 transition hover:border-brand hover:text-brand dark:border-slate-700 dark:text-slate-300"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        标签
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-10 z-20 w-56 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="mb-2 text-xs text-slate-400">
            应用到 {targetIds.length} 个文件
          </p>
          <div className="max-h-60 space-y-1 overflow-auto">
            {tags.length === 0 ? (
              <p className="text-xs text-slate-400">暂无标签，请先在侧边栏创建。</p>
            ) : (
              tags.map((tag) => {
                const {everyHas, someHas} = hasTagState(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      everyHas ? "text-brand" : "text-slate-600 dark:text-slate-300"
                    }`}
                    onClick={() => handleToggle(tag, !everyHas)}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/50"
                        style={{backgroundColor: tag.color}}
                      />
                      {tag.name}
                    </span>
                    <span className="text-xs">
                      {everyHas ? "✓" : someHas ? "−" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const formatSize = (size: number) => {
  if (!size) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const formatDate = (value: string) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
};

export default FileGrid;
