"use client";

import { CampusSwitcher } from "./CampusSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            江
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">江城</div>
            <div className="text-[10px] text-neutral-500">全校日常平台</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CampusSwitcher />
          <ThemeToggle />
          <button
            aria-label="个人中心"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-sm dark:border-neutral-700"
          >
            我
          </button>
        </div>
      </div>
    </header>
  );
}
