"use client";

import { useApp } from "@/app/providers";

export function ThemeToggle() {
  const { theme, toggleTheme } = useApp();
  return (
    <button
      onClick={toggleTheme}
      aria-label="切换主题"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-sm dark:border-neutral-700"
    >
      {theme === "dark" ? "日" : "夜"}
    </button>
  );
}
