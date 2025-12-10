import {create} from "zustand";
import {GetThumbnail} from "../../wailsjs/go/main/App";
import type {FileEntry} from "../types/files";

interface PreviewState {
  thumbnails: Record<string, string>;
  loadingMap: Record<string, boolean>;
  error?: string;
  visible: boolean;
  target?: FileEntry;
  openPreview: (file: FileEntry) => void;
  closePreview: () => void;
  loadThumbnail: (file: FileEntry) => Promise<string | undefined>;
}

export const thumbnailKey = (file: FileEntry) =>
  `${file.id}-${file.hash ?? "na"}-${file.modTime}`;

export const usePreviewStore = create<PreviewState>((set, get) => ({
  thumbnails: {},
  loadingMap: {},
  visible: false,
  target: undefined,
  error: undefined,

  loadThumbnail: async (file) => {
    const key = thumbnailKey(file);
    const {thumbnails, loadingMap} = get();
    if (thumbnails[key]) {
      return thumbnails[key];
    }
    if (loadingMap[key]) {
      return undefined;
    }
    set((state) => ({
      loadingMap: {...state.loadingMap, [key]: true},
      error: undefined,
    }));
    try {
      const dataUrl = await GetThumbnail(file.path);
      if (dataUrl) {
        set((state) => ({
          thumbnails: {...state.thumbnails, [key]: dataUrl},
        }));
      }
      return dataUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
      return undefined;
    } finally {
      set((state) => {
        const next = {...state.loadingMap};
        delete next[key];
        return {loadingMap: next};
      });
    }
  },

  openPreview: (file) => {
    set({target: file, visible: true});
    void get().loadThumbnail(file);
  },

  closePreview: () => {
    set({visible: false, target: undefined});
  },
}));
