"use client";

const items: [string, string][] = [
  ["首页", "首"],
  ["工具", "工"],
  ["发布", "发"],
  ["消息", "消"],
  ["我的", "我"],
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-around py-2">
        {items.map(([label, icon]) => (
          <button
            key={label}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] text-neutral-500"
          >
            <span className="text-base font-medium">{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
