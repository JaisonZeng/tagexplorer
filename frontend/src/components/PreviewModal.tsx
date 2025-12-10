import {useEffect, useMemo, useState} from "react";
import ReactPlayer from "react-player";
import {useShallow} from "zustand/react/shallow";
import {thumbnailKey, usePreviewStore} from "../store/preview";
import {useWorkspaceStore} from "../store/workspace";
import {useTagStore} from "../store/tags";
import type {FileEntry, TagInfo} from "../types/files";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm"];

const hasExtension = (entry: FileEntry | undefined, exts: string[]) => {
  if (!entry) {
    return false;
  }
  const source = entry.path || entry.name;
  const ext = source?.split(".").pop();
  if (!ext) {
    return false;
  }
  const normalized = `.${ext}`.toLowerCase();
  return exts.includes(normalized);
};

const toFileURL = (rootPath: string | undefined, relativePath: string) => {
  if (!rootPath) {
    return "";
  }
  const base = rootPath.replace(/\\/g, "/");
  const rel = relativePath.replace(/\\/g, "/");
  const combined = `${base.endsWith("/") ? base.slice(0, -1) : base}/${rel}`;
  return `file:///${combined.replace(/^\/+/, "").replace(/ /g, "%20")}`;
};

const PreviewModal = () => {
  const {visible, target, closePreview, thumbnails, loadThumbnail} = usePreviewStore(
    useShallow((state) => ({
      visible: state.visible,
      target: state.target,
      closePreview: state.closePreview,
      thumbnails: state.thumbnails,
      loadThumbnail: state.loadThumbnail,
    })),
  );
  const workspacePath = useWorkspaceStore((state) => state.workspace?.path);
  const targetId = target?.id ?? -1;
  const liveFile = useWorkspaceStore(
    useShallow((state) => state.files.find((file) => file.id === targetId)),
  );
  const file = liveFile ?? target;

  const {tags, addTagToFiles, removeTagFromFiles} = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      addTagToFiles: state.addTagToFiles,
      removeTagFromFiles: state.removeTagFromFiles,
    })),
  );

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (visible && file) {
      void loadThumbnail(file);
    }
    if (visible) {
      setZoom(1);
      setRotation(0);
    }
  }, [visible, file, loadThumbnail]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreview();
      } else if (event.key === "=" || event.key === "+") {
        setZoom((value) => Math.min(value + 0.1, 3));
      } else if (event.key === "-") {
        setZoom((value) => Math.max(value - 0.1, 0.3));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, closePreview]);

  if (!visible || !file) {
    return null;
  }

  const thumbnail = thumbnails[thumbnailKey(file)];
  const isImage = hasExtension(file, IMAGE_EXTENSIONS);
  const isVideo = hasExtension(file, VIDEO_EXTENSIONS);
  const fileURL = useMemo(() => toFileURL(workspacePath, file.path), [workspacePath, file.path]);

  const handleTagToggle = async (tag: TagInfo) => {
    const hasTag = file.tags?.some((item) => item.id === tag.id);
    if (hasTag) {
      await removeTagFromFiles(tag.id, [file.id]);
    } else {
      await addTagToFiles(tag.id, [file.id]);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur">
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">预览</p>
            <h2 className="text-xl font-semibold">{file.name}</h2>
            <p className="text-xs text-slate-400">{file.path}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-brand hover:text-brand"
              onClick={() => setZoom((value) => Math.max(value - 0.1, 0.3))}
            >
              缩小
            </button>
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-brand hover:text-brand"
              onClick={() => setZoom((value) => Math.min(value + 0.1, 3))}
            >
              放大
            </button>
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-brand hover:text-brand"
              onClick={() => setRotation((value) => (value + 90) % 360)}
            >
              旋转
            </button>
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-brand hover:text-brand"
              onClick={closePreview}
            >
              关闭
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto bg-slate-950/40 p-6">
            {isImage && thumbnail ? (
              <div className="flex h-full items-center justify-center">
                <img
                  src={thumbnail}
                  alt={file.name}
                  className="transition-transform"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    maxHeight: "80vh",
                    maxWidth: "100%",
                  }}
                />
              </div>
            ) : isVideo && fileURL ? (
              <div className="flex h-full items-center justify-center">
                <ReactPlayer
                  src={fileURL}
                  controls
                  width="100%"
                  height="100%"
                  style={{maxHeight: "80vh"}}
                />
              </div>
            ) : thumbnail ? (
              <div className="flex h-full items-center justify-center">
                <img src={thumbnail} alt={file.name} className="max-h-[70vh] max-w-full" />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">
                暂不支持该文件类型的预览
              </div>
            )}
          </div>

          <aside className="w-80 border-l border-slate-800 bg-slate-950/60 p-5">
            <h3 className="text-sm font-semibold text-slate-100">标签管理</h3>
            <p className="mb-3 text-xs text-slate-500">点击切换标签，立即同步到当前文件。</p>
            <div className="space-y-2 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="text-xs text-slate-500">暂无标签，请先创建。</p>
              ) : (
                tags.map((tag) => {
                  const checked = file.tags?.some((item) => item.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagToggle(tag)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition
                        ${
                          checked
                            ? "border-brand/70 bg-brand/20 text-brand"
                            : "border-slate-800 text-slate-300 hover:border-brand/40"
                        }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-white/50"
                          style={{backgroundColor: tag.color}}
                        />
                        {tag.name}
                      </span>
                      <span>{checked ? "✓" : ""}</span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
