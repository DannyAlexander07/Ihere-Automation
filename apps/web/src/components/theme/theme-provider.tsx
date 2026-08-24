"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppTheme = "professional" | "aurora" | "blush";

export const appThemes: Array<{
  value: AppTheme;
  name: string;
  description: string;
  colors: [string, string, string];
}> = [
  {
    value: "professional",
    name: "Professional",
    description: "Azul claro y neutros corporativos.",
    colors: ["#168eea", "#e8f6ff", "#fff3dc"],
  },
  {
    value: "aurora",
    name: "Aurora",
    description: "Menta, coral y una sensación fresca.",
    colors: ["#13a08c", "#e3f8f4", "#fff0e8"],
  },
  {
    value: "blush",
    name: "Rosa pastel",
    description: "Rosa suave, lavanda y fondos luminosos.",
    colors: ["#cc5f8f", "#fde7f1", "#eee8ff"],
  },
];

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "i-here-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("professional");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const initialTheme = appThemes.some((option) => option.value === stored)
        ? (stored as AppTheme)
        : "professional";
      setThemeState(initialTheme);
      document.documentElement.dataset.theme = initialTheme;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setTheme = (nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => {
        const currentIndex = appThemes.findIndex(
          (option) => option.value === theme,
        );
        setTheme(appThemes[(currentIndex + 1) % appThemes.length].value);
      },
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context)
    throw new Error("useAppTheme debe utilizarse dentro de ThemeProvider");
  return context;
}
