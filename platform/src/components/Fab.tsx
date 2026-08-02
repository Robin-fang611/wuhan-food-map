"use client";

import { useState } from "react";

export function Fab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="加群"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl font-light text-white shadow-lg"
      >
        +
      </button>
      {open && (
        <div className="fixed bottom-36 right-4 z-30 w-56 rounded-2xl border border-neutral-200 bg-white p-4 text-sm shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 font-semibold">扫码加群</div>
          <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">
            群二维码占位
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            师兄师姐在线答疑 · 商家合作
          </div>
        </div>
      )}
    </>
  );
}
