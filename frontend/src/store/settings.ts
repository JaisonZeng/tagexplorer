import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, TagRuleConfig } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { GetSettings, UpdateSettings } from '../../wailsjs/go/main/App';
import { useWorkspaceStore } from './workspace';
import { api } from '../../wailsjs/go/models';

interface SettingsState {
  // 设置数据
  settings: AppSettings;
  loading: boolean;
  error?: string;
  
  // Actions
  loadSettings: () => Promise<void>;
  updateTagRule: (tagRule: Partial<TagRuleConfig>) => Promise<void>;
  resetSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      loading: false,
      error: undefined,

      loadSettings: async () => {
        set({ loading: true, error: undefined });
        try {
          const backendSettings = await GetSettings();
          if (backendSettings) {
            // 转换后端类型到前端类型
            const frontendSettings: AppSettings = {
              tagRule: {
                format: backendSettings.tagRule.format as any,
                customFormat: backendSettings.tagRule.customFormat ? {
                  prefix: backendSettings.tagRule.customFormat.prefix,
                  suffix: backendSettings.tagRule.customFormat.suffix,
                  separator: backendSettings.tagRule.customFormat.separator,
                } : undefined,
                position: backendSettings.tagRule.position as any,
                addSpaces: backendSettings.tagRule.addSpaces,
                grouping: backendSettings.tagRule.grouping as any,
              },
            };
            set({ settings: frontendSettings });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
        } finally {
          set({ loading: false });
        }
      },

      updateTagRule: async (tagRule: Partial<TagRuleConfig>) => {
        const currentSettings = get().settings;
        const newSettings = {
          ...currentSettings,
          tagRule: {
            ...currentSettings.tagRule,
            ...tagRule,
          },
        };
        
        set({ loading: true, error: undefined });
        try {
          // 转换前端类型到后端类型
          const backendSettings = new api.AppSettings({
            tagRule: {
              format: newSettings.tagRule.format,
              customFormat: newSettings.tagRule.customFormat ? {
                prefix: newSettings.tagRule.customFormat.prefix,
                suffix: newSettings.tagRule.customFormat.suffix,
                separator: newSettings.tagRule.customFormat.separator,
              } : undefined,
              position: newSettings.tagRule.position,
              addSpaces: newSettings.tagRule.addSpaces,
              grouping: newSettings.tagRule.grouping,
            },
          });
          
          await UpdateSettings(backendSettings);
          set({ settings: newSettings });
          
          // 设置更新后，刷新文件列表以显示新的文件名格式
          const workspaceStore = useWorkspaceStore.getState();
          if (workspaceStore.workspace || workspaceStore.activeFolderId) {
            // 延迟一下让后端有时间处理文件重命名
            setTimeout(() => {
              workspaceStore.fetchNextPage(true);
            }, 1000);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: async (newSettings: Partial<AppSettings>) => {
        const currentSettings = get().settings;
        const updatedSettings = {
          ...currentSettings,
          ...newSettings,
        };
        
        set({ loading: true, error: undefined });
        try {
          // 转换前端类型到后端类型
          const backendSettings = new api.AppSettings({
            tagRule: {
              format: updatedSettings.tagRule.format,
              customFormat: updatedSettings.tagRule.customFormat ? {
                prefix: updatedSettings.tagRule.customFormat.prefix,
                suffix: updatedSettings.tagRule.customFormat.suffix,
                separator: updatedSettings.tagRule.customFormat.separator,
              } : undefined,
              position: updatedSettings.tagRule.position,
              addSpaces: updatedSettings.tagRule.addSpaces,
              grouping: updatedSettings.tagRule.grouping,
            },
          });
          
          await UpdateSettings(backendSettings);
          set({ settings: updatedSettings });
          
          // 设置更新后，刷新文件列表以显示新的文件名格式
          const workspaceStore = useWorkspaceStore.getState();
          if (workspaceStore.workspace || workspaceStore.activeFolderId) {
            // 延迟一下让后端有时间处理文件重命名
            setTimeout(() => {
              workspaceStore.fetchNextPage(true);
            }, 1000);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      resetSettings: async () => {
        set({ loading: true, error: undefined });
        try {
          // 转换前端类型到后端类型
          const backendSettings = new api.AppSettings({
            tagRule: {
              format: DEFAULT_SETTINGS.tagRule.format,
              customFormat: DEFAULT_SETTINGS.tagRule.customFormat ? {
                prefix: DEFAULT_SETTINGS.tagRule.customFormat.prefix,
                suffix: DEFAULT_SETTINGS.tagRule.customFormat.suffix,
                separator: DEFAULT_SETTINGS.tagRule.customFormat.separator,
              } : undefined,
              position: DEFAULT_SETTINGS.tagRule.position,
              addSpaces: DEFAULT_SETTINGS.tagRule.addSpaces,
              grouping: DEFAULT_SETTINGS.tagRule.grouping,
            },
          });
          
          await UpdateSettings(backendSettings);
          set({ settings: DEFAULT_SETTINGS });
          
          // 设置重置后，刷新文件列表以显示新的文件名格式
          const workspaceStore = useWorkspaceStore.getState();
          if (workspaceStore.workspace || workspaceStore.activeFolderId) {
            // 延迟一下让后端有时间处理文件重命名
            setTimeout(() => {
              workspaceStore.fetchNextPage(true);
            }, 1000);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          throw error;
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: 'tag-explorer-settings', // localStorage key
      version: 1,
    }
  )
);