"use client";

import { useEffect, useState } from "react";
import { allModules } from "@/lib/content";
import { useApp } from "@/app/providers";
import { ToolsPanel } from "@/components/ToolsPanel";

export function ModuleDetail({
  moduleId,
  onClose,
}: {
  moduleId: string;
  onClose: () => void;
}) {
  const mod = allModules.find((m) => m.id === moduleId);
  const { campus } = useApp();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!mod?.checklist) return;
    try {
      const saved = localStorage.getItem("jc_checklist_" + moduleId);
      if (saved) setChecked(JSON.parse(saved));
    } catch {}
  }, [moduleId, mod]);

  if (!mod) return null;

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try {
      localStorage.setItem("jc_checklist_" + moduleId, JSON.stringify(next));
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{mod.title}</h2>
          <button onClick={onClose} className="text-neutral-400">
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-500">{mod.desc}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {mod.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800"
            >
              {t}
            </span>
          ))}
        </div>

        {mod.checklist && (
          <div>
            <div className="mb-2 text-sm font-medium">清单（勾选自动保存）</div>
            {mod.checklist.map((it) => (
              <label
                key={it.id}
                className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 py-2 text-sm dark:border-neutral-800"
              >
                <input
                  type="checkbox"
                  checked={!!checked[it.id]}
                  onChange={() => toggle(it.id)}
                  className="h-4 w-4 accent-brand"
                />
                <span className={it.must ? "font-medium" : "text-neutral-500"}>
                  {it.must && <span className="mr-1 text-brand">●</span>}
                  {it.label}
                </span>
              </label>
            ))}
          </div>
        )}

        {moduleId === "tools" && <ToolsPanel />}

        <div
          className={`mt-4 rounded-xl bg-neutral-100 p-3 text-xs text-neutral-500 dark:bg-neutral-800 ${
            moduleId === "tools" ? "hidden" : ""
          }`}
        >
          当前校区：{campus === "nanhu" ? "南湖" : "首义"} ｜ 该模块内容建设中，后续接入
          Supabase 实时数据。
        </div>
      </div>
    </div>
  );
}
