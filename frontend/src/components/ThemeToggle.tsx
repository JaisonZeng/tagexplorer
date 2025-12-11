import {Sun, Moon, Monitor} from "lucide-react";
import type {ThemePreference, ThemeValue} from "../hooks/useTheme";

interface ThemeToggleProps {
  preference: ThemePreference;
  resolvedTheme: ThemeValue;
  onToggle: () => void;
}

const icons: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const labels: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};

export const ThemeToggle = ({preference, onToggle}: ThemeToggleProps) => {
  const Icon = icons[preference];
  
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      title={labels[preference]}
    >
      <Icon size={16} />
    </button>
  );
};
