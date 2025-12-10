import {create} from "zustand";
import {
  AddTagToFile,
  CreateTag,
  DeleteTag,
  ListTags,
  RemoveTagFromFile,
} from "../../wailsjs/go/main/App";
import type {TagInfo} from "../types/files";
import {useWorkspaceStore} from "./workspace";

interface TagState {
  tags: TagInfo[];
  loading: boolean;
  initialized: boolean;
  error?: string;
  fetchTags: () => Promise<void>;
  createTag: (name: string, color: string, parentId?: number | null) => Promise<void>;
  deleteTag: (tagId: number) => Promise<void>;
  addTagToFiles: (tagId: number, fileIds: number[]) => Promise<void>;
  removeTagFromFiles: (tagId: number, fileIds: number[]) => Promise<void>;
}

const normalizeTag = (payload: any): TagInfo => ({
  id: Number(payload?.id ?? 0),
  name: payload?.name ?? "",
  color: payload?.color ?? "#94a3b8",
  parentId: payload?.parent_id ?? null,
});

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  loading: false,
  initialized: false,
  error: undefined,

  fetchTags: async () => {
    if (get().loading) {
      return;
    }
    set({loading: true, error: undefined});
    try {
      const response = await ListTags();
      const tags = Array.isArray(response) ? response.map(normalizeTag) : [];
      set({tags, initialized: true});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    } finally {
      set({loading: false});
    }
  },

  createTag: async (name, color, parentId = null) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    try {
      const result = await CreateTag(trimmed, color, parentId);
      const tag = normalizeTag(result);
      set((state) => ({
        tags: [...state.tags, tag].sort((a, b) => a.name.localeCompare(b.name)),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    }
  },

  deleteTag: async (tagId) => {
    try {
      await DeleteTag(tagId);
      set((state) => ({
        tags: state.tags.filter((tag) => tag.id !== tagId),
      }));
      const fileIds = useWorkspaceStore.getState().files.map((file) => file.id);
      useWorkspaceStore.getState().removeTagFromFilesLocal(fileIds, tagId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    }
  },

  addTagToFiles: async (tagId, fileIds) => {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return;
    }
    try {
      const uniqueIds = Array.from(new Set(fileIds));
      await Promise.all(uniqueIds.map((fileID) => AddTagToFile(fileID, tagId)));
      const tag = get().tags.find((item) => item.id === tagId);
      if (tag) {
        useWorkspaceStore.getState().addTagToFilesLocal(uniqueIds, tag);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    }
  },

  removeTagFromFiles: async (tagId, fileIds) => {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return;
    }
    try {
      const uniqueIds = Array.from(new Set(fileIds));
      await Promise.all(uniqueIds.map((fileID) => RemoveTagFromFile(fileID, tagId)));
      useWorkspaceStore.getState().removeTagFromFilesLocal(uniqueIds, tagId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({error: message});
    }
  },
}));
