/**
 * 文件预览组件
 * - 图片: react-photo-view
 * - 视频: react-player
 * - PDF: react-pdf
 * - 其他: 大图标 + 打开按钮
 */
import {useEffect, useMemo, useState} from "react";
import {useShallow} from "zustand/react/shallow";
import {PhotoProvider, PhotoView} from "react-photo-view";
import {Document, Page, pdfjs} from "react-pdf";
import {usePreviewStore, thumbnailKey} from "../store/preview";
import {useWorkspaceStore} from "../store/workspace";
import {useTagStore} from "../store/tags";
import {
  isImageFile,
  isVideoFile,
  isPdfFile,
  toFileURL,
} from "../utils/chonkyAdapter";
import type {FileEntry, TagInfo} from "../types/files";
import {X, ChevronLeft, ChevronRight, FileQuestion, Check, ExternalLink} from "lucide-react";

import "react-photo-view/dist/react-photo-view.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// 配置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const FilePreview = () => {
  const {visible, target, closePreview, thumbnails, loadThumbnail} = usePreviewStore(
    useShallow((state) => ({
      visible: state.visible,
      target: state.target,
      closePreview: state.closePreview,
      thumbnails: state.thumbnails,
      loadThumbnail: state.loadThumbnail,
    }))
  );

  const workspacePath = useWorkspaceStore((state) => state.workspace?.path);
  const targetId = target?.id ?? -1;
  const liveFile = useWorkspaceStore(
    useShallow((state) => state.files.find((file) => file.id === targetId))
  );
  const file = liveFile ?? target;

  const {tags, addTagToFiles, removeTagFromFiles} = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      addTagToFiles: state.addTagToFiles,
      removeTagFromFiles: state.removeTagFromFiles,
    }))
  );

  // PDF 状态
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);

  const fileURL = useMemo(() => {
    if (!workspacePath || !file?.path) return "";
    return toFileURL(workspacePath, file.path);
  }, [workspacePath, file?.path]);

  const thumbnail = file ? thumbnails[thumbnailKey(file)] : undefined;

  useEffect(() => {
    if (visible && file) {
      void loadThumbnail(file);
    }
    if (visible) {
      setPageNumber(1);
      setNumPages(0);
    }
  }, [visible, file, loadThumbnail]);

  // ESC 关闭
  useEffect(() => {
    if (!visible) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, closePreview]);

  if (!visible || !file) return null;

  const filename = file.path || file.name;
  const isImage = isImageFile(filename);
  const isVideo = isVideoFile(filename);
  const isPdf = isPdfFile(filename);

  const handleTagToggle = async (tag: TagInfo) => {
    const hasTag = file.tags?.some((item) => item.id === tag.id);
    if (hasTag) {
      await removeTagFromFiles(tag.id, [file.id]);
    } else {
      await addTagToFiles(tag.id, [file.id]);
    }
  };

  const onPdfLoadSuccess = ({numPages}: {numPages: number}) => {
    setNumPages(numPages);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">{file.name}</h2>
            <p className="truncate text-xs text-slate-400">{file.path}</p>
          </div>
          <button
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            onClick={closePreview}
            title="关闭 (Esc)"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* 预览区域 */}
          <div className="flex-1 overflow-auto bg-slate-950/60 p-4">
            {isImage && thumbnail ? (
              <ImagePreview src={thumbnail} alt={file.name} />
            ) : isVideo && fileURL ? (
              <VideoPreview url={fileURL} />
            ) : isPdf && fileURL ? (
              <PdfPreview
                url={fileURL}
                pageNumber={pageNumber}
                numPages={numPages}
                onLoadSuccess={onPdfLoadSuccess}
                onPageChange={setPageNumber}
              />
            ) : (
              <FallbackPreview file={file} fileURL={fileURL} />
            )}
          </div>

          {/* 标签侧边栏 */}
          <aside className="w-64 border-l border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-1 text-sm font-medium">标签管理</h3>
            <p className="mb-3 text-xs text-slate-500">点击切换标签</p>
            <div className="space-y-1 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">暂无标签</p>
              ) : (
                tags.map((tag) => {
                  const checked = file.tags?.some((item) => item.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagToggle(tag)}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                        checked
                          ? "border-brand/50 bg-brand/10 text-brand"
                          : "border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{backgroundColor: tag.color}}
                        />
                        {tag.name}
                      </span>
                      {checked && <Check size={14} />}
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


// 图片预览组件 - 使用 react-photo-view
const ImagePreview = ({src, alt}: {src: string; alt: string}) => {
  return (
    <div className="flex h-full items-center justify-center">
      <PhotoProvider>
        <PhotoView src={src}>
          <img
            src={src}
            alt={alt}
            className="max-h-[70vh] max-w-full cursor-zoom-in rounded-lg object-contain"
          />
        </PhotoView>
      </PhotoProvider>
    </div>
  );
};

// 视频预览组件 - 使用原生 video 标签（react-player v3 对 file:// 支持有限）
const VideoPreview = ({url}: {url: string}) => {
  return (
    <div className="flex h-full items-center justify-center">
      <video
        src={url}
        controls
        className="max-h-[70vh] max-w-full rounded-lg"
      />
    </div>
  );
};

// PDF 预览组件 - 使用 react-pdf
interface PdfPreviewProps {
  url: string;
  pageNumber: number;
  numPages: number;
  onLoadSuccess: (data: {numPages: number}) => void;
  onPageChange: (page: number) => void;
}

const PdfPreview = ({
  url,
  pageNumber,
  numPages,
  onLoadSuccess,
  onPageChange,
}: PdfPreviewProps) => {
  return (
    <div className="flex h-full flex-col items-center">
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
          disabled={pageNumber <= 1}
          className="rounded-md bg-slate-800 p-2 text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm text-slate-300">
          第 {pageNumber} 页 / 共 {numPages} 页
        </span>
        <button
          onClick={() => onPageChange(Math.min(numPages, pageNumber + 1))}
          disabled={pageNumber >= numPages}
          className="rounded-md bg-slate-800 p-2 text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-auto rounded-lg bg-white">
        <Document file={url} onLoadSuccess={onLoadSuccess} loading={<PdfLoading />}>
          <Page pageNumber={pageNumber} renderTextLayer={true} renderAnnotationLayer={true} />
        </Document>
      </div>
    </div>
  );
};

const PdfLoading = () => (
  <div className="flex h-64 w-96 items-center justify-center text-slate-500">
    加载 PDF 中...
  </div>
);

// 其他文件类型的回退预览
const FallbackPreview = ({file, fileURL}: {file: FileEntry; fileURL: string}) => {
  const handleOpenExternal = () => {
    if (fileURL) {
      window.open(fileURL, "_blank");
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center text-slate-500">
      <FileQuestion size={64} className="mb-4" />
      <p className="mb-2 text-lg font-medium text-slate-300">{file.name}</p>
      <p className="mb-6 text-sm">暂不支持该文件类型的预览</p>
      <button
        onClick={handleOpenExternal}
        className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
      >
        <ExternalLink size={16} />
        使用默认程序打开
      </button>
    </div>
  );
};

export default FilePreview;
