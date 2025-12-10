import {useCallback, useEffect, useMemo, useState} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ThemeValue = "light" | "dark";

const STORAGE_KEY = "tagexplorer-theme";

const getSystemTheme = (): ThemeValue => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const isValidPreference = (value: unknown): value is ThemePreference => {
  return value === "system" || value === "light" || value === "dark";
};

export const useTheme = () => {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isValidPreference(saved) ? saved : "system";
  });
  const [systemTheme, setSystemTheme] = useState<ThemeValue>(() => getSystemTheme());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? "dark" : "light");

    setSystemTheme(media.matches ? "dark" : "light");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
    } else {
      media.addListener(listener);
    }

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", listener);
      } else {
        media.removeListener(listener);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (preference === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
  }, [preference]);

  const resolvedTheme = useMemo<ThemeValue>(() => {
    return preference === "system" ? systemTheme : preference;
  }, [preference, systemTheme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const cyclePreference = useCallback(() => {
    setPreference((current) => {
      if (current === "system") {
        return "light";
      }
      if (current === "light") {
        return "dark";
      }
      return "system";
    });
  }, []);

  return {
    preference,
    resolvedTheme,
    setPreference,
    cyclePreference,
  };
};
