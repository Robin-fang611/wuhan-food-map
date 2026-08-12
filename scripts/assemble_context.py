#!/usr/bin/env python3
"""Assemble 启动上下文 (startup context) from a .context-store/ library.

用法:
  python3 scripts/assemble_context.py --store .context-store --task "<本次任务>" --budget 6000

把 CONTROL_TOWER.md + layers/*.md + 最新 handoff 拼接成一段"启动上下文",
每段前加 provenance 注释 (# [source: <相对路径> | <标签>]), 可溯源回源工件。
尊重 --budget (近似 token 估算): 超预算只告警、仍照常输出, 由人决定拆分/接棒。

这是 boot-prompt.md / handoffs 文档里引用、但此前缺失的脚本。纯 stdlib, 无外部依赖。
"""
import argparse
import sys
from pathlib import Path


def approx_tokens(text: str) -> int:
    """粗略 token 估算: CJK 字符约 1 token, 其余约 4 字符/token。"""
    cjk = sum(1 for c in text if ord(c) > 0x2E80)
    other = len(text) - cjk
    return cjk + other // 4


def main() -> None:
    ap = argparse.ArgumentParser(description="Assemble 启动上下文 from .context-store")
    ap.add_argument("--store", default=".context-store", help="上下文库目录")
    ap.add_argument("--task", default="(未指定任务)", help="本次任务描述")
    ap.add_argument("--budget", type=int, default=6000, help="近似 token 预算")
    ap.add_argument("--out", default=None, help="可选: 写出到文件而非 stdout")
    args = ap.parse_args()

    store = Path(args.store)
    if not store.is_dir():
        sys.exit(f"[assemble] 找不到上下文库目录: {store}")

    parts: list[str] = []
    parts.append("<!-- 启动上下文 (assemble_context.py) -->")
    parts.append(f"<!-- task: {args.task} -->")
    parts.append(f"<!-- budget: {args.budget} tokens (approx) -->")
    parts.append("")

    def emit(rel: str, label: str) -> None:
        p = store / rel
        if p.is_file():
            body = p.read_text(encoding="utf-8")
            parts.append(f"# [source: {rel} | {label}]")
            parts.append(body.rstrip())
            parts.append("")

    emit("CONTROL_TOWER.md", "控制塔")
    layers_dir = store / "layers"
    if layers_dir.is_dir():
        for f in sorted(layers_dir.glob("*.md")):
            emit(f"layers/{f.name}", f.name.replace(".md", ""))
    handoffs_dir = store / "handoffs"
    if handoffs_dir.is_dir():
        hs = sorted(handoffs_dir.glob("*.md"))
        if hs:
            latest = hs[-1]
            emit(f"handoffs/{latest.name}", "最新交接")

    text = "\n".join(parts)
    used = approx_tokens(text)
    over = used > args.budget
    verdict = "⚠️ 超预算, 建议拆分或新开对话接棒" if over else "✅ 在预算内"
    print(f"[assemble] 近似 tokens≈{used} / budget={args.budget}  {verdict}")

    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"[assemble] 已写出: {args.out}")
    else:
        print("=" * 60)
        print(text)


if __name__ == "__main__":
    main()
