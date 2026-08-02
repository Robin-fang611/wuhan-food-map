"use client";

import { useState } from "react";
import { searchIndex } from "@/lib/content";

export function GlobalSearch({
  onSelectModule,
}: {
  onSelectModule: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const results = q.trim()
    ? searchIndex
        .filter((e) =>
          (e.title + e.excerpt + e.kind).toLowerCase().includes(q.trim().toLowerCase())
        )
        .slice(0, 10)
    : [];

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="搜索攻略 / 美食 / 二手 / 问答…"
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900"
      />
      {open && q.trim() && results.length > 0 && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {results.map((r, i) => (
            <button
              key={i}
              onMouseDown={() => {
                if (r.moduleId) onSelectModule(r.moduleId);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                {r.kind}
              </span>
              <span className="flex-1 truncate text-sm">{r.title}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && results.length === 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          暂无结果，试试其他关键词
        </div>
      )}
    </div>
  );
}
