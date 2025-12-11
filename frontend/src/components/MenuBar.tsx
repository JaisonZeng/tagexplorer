import {
  RefreshCw,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  Monitor,
  PanelLeft,
  Sparkles,
} from "lucide-react";
import type {ThemePreference, ThemeValue} from "../hooks/useTheme";

interface MenuBarProps {
  onRefresh?: () => void;
  preference: ThemePreference;
  resolvedTheme: ThemeValue;
  onToggleTheme: () => void;
  onToggleWorkspaceSidebar?: () => void;
  workspaceSidebarVisible?: boolean;
  onOpenSettings?: () => void;
  onOpenOrganize?: () => void;
}

const themeIcons: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const MenuBar = ({
  onRefresh,
  preference,
  resolvedTheme,
  onToggleTheme,
  onToggleWorkspaceSidebar,
  workspaceSidebarVisible,
  onOpenSettings,
  onOpenOrganize,
}: MenuBarProps) => {
  const ThemeIcon = themeIcons[preference];

  return (
    <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-1">
        <span className="mr-3 text-sm font-semibold text-brand">Tag Explorer</span>
        
        {onToggleWorkspaceSidebar && (
          <button
            onClick={onToggleWorkspaceSidebar}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
              workspaceSidebarVisible
                ? "text-brand"
                : "text-slate-600 dark:text-slate-300"
            }`}
            title={workspaceSidebarVisible ? "隐藏工作区面板" : "显示工作区面板"}
          >
            <PanelLeft size={16} />
          </button>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            title="刷新"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {onOpenOrganize && (
          <button
            onClick={onOpenOrganize}
            className="flex items-center gap-2 rounded-md bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand/20"
            title="一键整理"
          >
            <Sparkles size={16} />
            整理
          </button>
        )}

        <button
          onClick={onToggleTheme}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title={preference === "system" ? "跟随系统" : preference === "light" ? "浅色模式" : "深色模式"}
        >
          <ThemeIcon size={16} />
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title="设置"
        >
          <Settings size={16} />
        </button>

        <button
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title="帮助"
        >
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
};

export default MenuBar;
