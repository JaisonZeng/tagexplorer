import type {ThemePreference, ThemeValue} from "../hooks/useTheme";

interface ThemeToggleProps {
  preference: ThemePreference;
  resolvedTheme: ThemeValue;
  onToggle: () => void;
}

const preferenceLabel: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};

const icons: Record<ThemeValue, string> = {
  light: "☀️",
  dark: "🌙",
};

export const ThemeToggle = ({preference, resolvedTheme, onToggle}: ThemeToggleProps) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
    >
      <span className="text-base">{icons[resolvedTheme]}</span>
      <span>{preferenceLabel[preference]}</span>
    </button>
  );
};
