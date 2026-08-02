"use client";

import { useEffect, useState } from "react";

/* ---------- 通用算法：百分制成绩 -> 绩点（5.0 制） ---------- */
function gpaOf(score: number): number {
  if (!isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(5, (score - 50) / 10));
}

type GpaCourse = { id: string; name: string; credit: number; score: number };
type ScheduleItem = {
  id: string;
  name: string;
  day: number; // 1=周一 … 5=周五
  start: string;
  end: string;
  place: string;
};

const DAYS = ["周一", "周二", "周三", "周四", "周五"];

export function ToolsPanel() {
  const [sub, setSub] = useState<"gpa" | "schedule" | "fit">("gpa");
  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(
          [
            ["gpa", "GPA 计算"],
            ["schedule", "我的课表"],
            ["fit", "体测标准"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              sub === k
                ? "bg-brand text-white"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "gpa" && <GpaCalc />}
      {sub === "schedule" && <Schedule />}
      {sub === "fit" && <FitRef />}
    </div>
  );
}

/* ================= GPA 计算器 ================= */
function GpaCalc() {
  const [courses, setCourses] = useState<GpaCourse[]>([]);

  useEffect(() => {
    try {
      const s = localStorage.getItem("jc_tools_gpa");
      if (s) setCourses(JSON.parse(s));
    } catch {}
  }, []);

  const save = (next: GpaCourse[]) => {
    setCourses(next);
    try {
      localStorage.setItem("jc_tools_gpa", JSON.stringify(next));
    } catch {}
  };

  const update = (id: string, patch: Partial<GpaCourse>) =>
    save(courses.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const add = () =>
    save([
      ...courses,
      { id: crypto.randomUUID(), name: "", credit: 3, score: 85 },
    ]);

  const remove = (id: string) => save(courses.filter((c) => c.id !== id));

  const totalCredit = courses.reduce((a, c) => a + (Number(c.credit) || 0), 0);
  const totalPoint = courses.reduce(
    (a, c) => a + gpaOf(Number(c.score) || 0) * (Number(c.credit) || 0),
    0
  );
  const gpa = totalCredit > 0 ? totalPoint / totalCredit : 0;

  return (
    <div>
      <div className="space-y-2">
        {courses.length === 0 && (
          <p className="rounded-xl bg-neutral-100 p-3 text-xs text-neutral-500 dark:bg-neutral-800">
            还没有课程，点下方「+ 添加课程」开始计算加权绩点。
          </p>
        )}
        {courses.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 p-2 dark:border-neutral-800"
          >
            <input
              value={c.name}
              onChange={(e) => update(c.id, { name: e.target.value })}
              placeholder="课程名"
              className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
            />
            <input
              type="number"
              value={c.credit}
              onChange={(e) => update(c.id, { credit: Number(e.target.value) })}
              placeholder="学分"
              className="w-14 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
            />
            <input
              type="number"
              value={c.score}
              onChange={(e) => update(c.id, { score: Number(e.target.value) })}
              placeholder="成绩"
              className="w-14 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
            />
            <span className="w-10 text-center text-xs font-semibold text-brand">
              {gpaOf(Number(c.score) || 0).toFixed(1)}
            </span>
            <button
              onClick={() => remove(c.id)}
              className="text-neutral-400 hover:text-brand"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="mt-3 w-full rounded-xl border border-dashed border-neutral-300 py-2 text-xs text-neutral-500 dark:border-neutral-700"
      >
        + 添加课程
      </button>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3 dark:bg-neutral-800">
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          总学分 <b>{totalCredit || 0}</b> ｜ 加权绩点
        </div>
        <div className="text-2xl font-bold text-brand">{gpa.toFixed(2)}</div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-neutral-400">
        算法：绩点 = (成绩 − 50) / 10（5.0 制，60 分 = 1.0，90 分 = 4.0，100 分 =
        5.0）。各院校算法不同，结果仅供参考。
      </p>
    </div>
  );
}

/* ================= 我的课表 ================= */
function Schedule() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [form, setForm] = useState<Omit<ScheduleItem, "id">>({
    name: "",
    day: 1,
    start: "",
    end: "",
    place: "",
  });

  useEffect(() => {
    try {
      const s = localStorage.getItem("jc_tools_schedule");
      if (s) setItems(JSON.parse(s));
    } catch {}
  }, []);

  const save = (next: ScheduleItem[]) => {
    setItems(next);
    try {
      localStorage.setItem("jc_tools_schedule", JSON.stringify(next));
    } catch {}
  };

  const add = () => {
    if (!form.name.trim()) return;
    save([...items, { ...form, id: crypto.randomUUID() }]);
    setForm({ name: "", day: 1, start: "", end: "", place: "" });
  };

  const remove = (id: string) => save(items.filter((i) => i.id !== id));

  const byDay = (d: number) =>
    items
      .filter((i) => i.day === d)
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-5 gap-2">
          {DAYS.map((d, idx) => (
            <div key={d} className="space-y-2">
              <div className="text-center text-xs font-semibold text-neutral-500">
                {d}
              </div>
              {byDay(idx + 1).map((it) => (
                <div
                  key={it.id}
                  className="group relative rounded-lg bg-brand-soft px-2 py-1.5 text-xs dark:bg-neutral-800"
                >
                  <div className="font-medium text-brand">{it.name}</div>
                  <div className="text-[11px] text-neutral-500">
                    {it.start}
                    {it.end ? "–" + it.end : ""}
                    {it.place ? " ｜ " + it.place : ""}
                  </div>
                  <button
                    onClick={() => remove(it.id)}
                    className="absolute right-1 top-1 hidden text-neutral-400 hover:text-brand group-hover:block"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          + 添加课程
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="课程名"
            className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
          />
          <select
            value={form.day}
            onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}
            className="rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
          <input
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            placeholder="开始"
            className="w-16 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
          />
          <input
            value={form.end}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
            placeholder="结束"
            className="w-16 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
          />
          <input
            value={form.place}
            onChange={(e) => setForm({ ...form, place: e.target.value })}
            placeholder="地点"
            className="w-20 rounded-lg bg-neutral-100 px-2 py-1 text-xs outline-none dark:bg-neutral-800"
          />
        </div>
        <button
          onClick={add}
          className="w-full rounded-lg bg-brand py-1.5 text-xs font-medium text-white"
        >
          添加
        </button>
      </div>
    </div>
  );
}

/* ================= 体测标准（大一大二参考） ================= */
function FitRef() {
  const rows: {
    item: string;
    male: string;
    female: string;
  }[] = [
    { item: "50 米跑（秒，越小越好）", male: "≤6.7 优秀 / ≤7.1 及格", female: "≤7.5 优秀 / ≤8.3 及格" },
    { item: "立定跳远（cm）", male: "≥255 优秀 / ≥208 及格", female: "≥196 优秀 / ≥151 及格" },
    { item: "坐位体前屈（cm）", male: "≥17 优秀 / ≥3.7 及格", female: "≥21 优秀 / ≥6 及格" },
    { item: "1000 米（男）/ 800 米（女）", male: "≤3′27″ 优秀 / ≤4′32″ 及格", female: "≤3′24″ 优秀 / ≤4′34″ 及格" },
    { item: "引体向上（男）/ 仰卧起坐（女，次）", male: "≥17 优秀 / ≥10 及格", female: "≥52 优秀 / ≥26 及格" },
    { item: "肺活量（ml）", male: "≥4740 优秀 / ≥3100 及格", female: "≥3300 优秀 / ≥2000 及格" },
    { item: "BMI（kg/m²）", male: "17.9–23.9 正常", female: "17.2–23.9 正常" },
  ];
  return (
    <div className="space-y-2">
      <p className="rounded-xl bg-neutral-100 p-3 text-xs text-neutral-500 dark:bg-neutral-800">
        《国家学生体质健康标准》大一大二参考线，实际评分以学校当年通知为准。
      </p>
      {rows.map((r) => (
        <div
          key={r.item}
          className="rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800"
        >
          <div className="mb-1 font-medium text-neutral-700 dark:text-neutral-200">
            {r.item}
          </div>
          <div className="grid grid-cols-2 gap-2 text-neutral-500">
            <span>男：{r.male}</span>
            <span>女：{r.female}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
