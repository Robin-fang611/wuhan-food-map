"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Campus = "nanhu" | "shouyi";
export type Theme = "light" | "dark";
export type TabKey = "study" | "life";

interface AppState {
  campus: Campus;
  theme: Theme;
  tab: TabKey;
  setCampus: (c: Campus) => void;
  toggleTheme: () => void;
  setTab: (t: TabKey) => void;
}

const AppCtx = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

const CAMPUS_KEY = "jc_campus";
const THEME_KEY = "jc_theme";
const TAB_KEY = "jc_tab";

export function AppProvider({ children }: { children: ReactNode }) {
  const [campus, setCampusState] = useState<Campus>("nanhu");
  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTabState] = useState<TabKey>("study");

  useEffect(() => {
    try {
      const c = localStorage.getItem(CAMPUS_KEY) as Campus | null;
      const t = localStorage.getItem(THEME_KEY) as Theme | null;
      const tb = localStorage.getItem(TAB_KEY) as TabKey | null;
      if (c) setCampusState(c);
      if (t) setTheme(t);
      if (tb) setTabState(tb);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  const setCampus = (c: Campus) => {
    setCampusState(c);
    try {
      localStorage.setItem(CAMPUS_KEY, c);
    } catch {}
  };
  const toggleTheme = () => {
    const n: Theme = theme === "dark" ? "light" : "dark";
    setTheme(n);
    try {
      localStorage.setItem(THEME_KEY, n);
    } catch {}
  };
  const setTab = (t: TabKey) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  };

  return (
    <AppCtx.Provider
      value={{ campus, theme, tab, setCampus, toggleTheme, setTab }}
    >
      {children}
    </AppCtx.Provider>
  );
}
