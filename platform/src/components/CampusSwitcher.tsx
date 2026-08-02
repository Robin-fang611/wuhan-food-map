"use client";

import { useApp } from "@/app/providers";

const MAP = { nanhu: "南湖", shouyi: "首义" } as const;

export function CampusSwitcher() {
  const { campus, setCampus } = useApp();
  return (
    <button
      onClick={() => setCampus(campus === "nanhu" ? "shouyi" : "nanhu")}
      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
    >
      {MAP[campus]}校区 ▾
    </button>
  );
}
