"use client";

import { useApp } from "@/app/providers";
import { studyModules, lifeModules } from "@/lib/content";

export function DualTabs({ onSelect }: { onSelect: (id: string) => void }) {
  const { tab, setTab } = useApp();
  const mods = tab === "study" ? studyModules : lifeModules;

  return (
    <div>
      <div className="sticky top-[57px] z-10 flex border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {(
          [
            ["study", "学业成长中心"],
            ["life", "校园生活广场"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === k
                ? "border-b-2 border-brand text-brand"
                : "text-neutral-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {mods.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex flex-col items-start gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-brand dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-white ${m.color}`}
            >
              {m.badge}
            </span>
            <span className="text-sm font-semibold">{m.title}</span>
            <span className="text-xs leading-snug text-neutral-500">
              {m.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
