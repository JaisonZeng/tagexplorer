/**
 * Chonky 适配器 - 将后端 FileEntry 转换为 Chonky FileData 格式
 */
import type {FileData} from "chonky";
import type {FileEntry} from "../types/files";

// 扩展 Chonky FileData，添加自定义属性
export interface ExtendedFileData extends FileData {
  // 原始 FileEntry 数据
  originalEntry: FileEntry;
  // 缩略图 URL
  thumbnailUrl?: string;
}

/**
 * 将后端 FileEntry 转换为 Chonky FileData
 */
export const fileEntryToChonky = (
  entry: FileEntry,
  thumbnailUrl?: string
): ExtendedFileData => {
  const isDir = entry.type === "dir";
  
  // 直接使用文件名（现在文件名本身就包含标签信息）
  const displayName = entry.name || (isDir ? "未命名文件夹" : "未命名文件");
  
  return {
    id: String(entry.id),
    name: displayName,
    isDir,
    size: isDir ? undefined : entry.size,
    modDate: entry.modTime ? new Date(entry.modTime) : undefined,
    thumbnailUrl: thumbnailUrl,
    // 自定义扩展
    originalEntry: entry,
  };
};

/**
 * 生成缩略图缓存 key
 */
export const thumbnailKey = (file: FileEntry) =>
  `${file.id}-${file.hash ?? "na"}-${file.modTime}`;

/**
 * 批量转换 FileEntry 数组
 */
export const fileEntriesToChonky = (
  entries: FileEntry[],
  thumbnails: Record<string, string>
): ExtendedFileData[] => {
  return entries.map((entry) => {
    const key = thumbnailKey(entry);
    return fileEntryToChonky(entry, thumbnails[key]);
  });
};

/**
 * 从 Chonky FileData 获取原始 FileEntry
 */
export const getOriginalEntry = (file: FileData): FileEntry | undefined => {
  return (file as ExtendedFileData).originalEntry;
};

/**
 * 判断文件类型的辅助函数
 */
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".flv"];
const PDF_EXTENSIONS = [".pdf"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];

export const getFileExtension = (filename: string): string => {
  const ext = filename.split(".").pop();
  return ext ? `.${ext}`.toLowerCase() : "";
};

export const isImageFile = (filename: string): boolean => {
  return IMAGE_EXTENSIONS.includes(getFileExtension(filename));
};

export const isVideoFile = (filename: string): boolean => {
  return VIDEO_EXTENSIONS.includes(getFileExtension(filename));
};

export const isPdfFile = (filename: string): boolean => {
  return PDF_EXTENSIONS.includes(getFileExtension(filename));
};

export const isAudioFile = (filename: string): boolean => {
  return AUDIO_EXTENSIONS.includes(getFileExtension(filename));
};

export const isPreviewable = (filename: string): boolean => {
  return isImageFile(filename) || isVideoFile(filename) || isPdfFile(filename);
};

/**
 * 构建文件的本地 URL (用于预览)
 */
export const toFileURL = (rootPath: string | undefined, relativePath: string): string => {
  if (!rootPath) return "";
  const base = rootPath.replace(/\\/g, "/");
  const rel = relativePath.replace(/\\/g, "/");
  const combined = `${base.endsWith("/") ? base.slice(0, -1) : base}/${rel}`;
  return `file:///${combined.replace(/^\/+/, "").replace(/ /g, "%20")}`;
};
