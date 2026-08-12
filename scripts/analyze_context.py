#!/usr/bin/env python3
"""Analyze active context size; recommend handoff when over budget.

用法:
  python3 scripts/analyze_context.py --store .context-store --budget 8000

估算活跃上下文(控制塔 + layers + 最新 handoff)的近似 token, 与预算比较:
- 在预算内 → 当前对话可继续
- 超预算   → 建议运行 assemble 产出启动上下文, 新开对话接棒

这是 boot-prompt.md / handoffs 文档里引用、但此前缺失的脚本。纯 stdlib。
"""
import argparse
import sys
from pathlib import Path


def approx_tokens(text: str) -> int:
    cjk = sum(1 for c in text if ord(c) > 0x2E80)
    return cjk + (len(text) - cjk) // 4


def main() -> None:
    ap = argparse.ArgumentParser(description="Analyze context size / handoff decision")
    ap.add_argument("--store", default=".context-store", help="上下文库目录")
    ap.add_argument("--budget", type=int, default=8000, help="近似 token 预算")
    args = ap.parse_args()

    store = Path(args.store)
    if not store.is_dir():
        sys.exit(f"[analyze] 找不到上下文库: {store}")

    total = 0
    files: list[tuple[str, int]] = []
    candidates = [store / "CONTROL_TOWER.md"]
    layers_dir = store / "layers"
    if layers_dir.is_dir():
        candidates += sorted(layers_dir.glob("*.md"))
    for p in candidates:
        if p.is_file():
            t = approx_tokens(p.read_text(encoding="utf-8"))
            total += t
            files.append((p.name, t))

    open_count = 0
    ot = store / "layers" / "open-threads.md"
    if ot.is_file():
        open_count = sum(
            1 for line in ot.read_text(encoding="utf-8").splitlines()
            if line.strip().startswith("- [ ]")
        )

    print(f"[analyze] 活跃上下文近似 tokens≈{total} / budget={args.budget}")
    for name, t in files:
        print(f"  - {name}: ~{t}")
    print(f"[analyze] 未结线程数: {open_count}")

    if total > args.budget:
        print("[analyze] 判定: ⚠️ 超预算 → 建议运行 assemble + 新开对话接棒 (handoff)。")
    else:
        print("[analyze] 判定: ✅ 在预算内 → 可继续当前对话。")


if __name__ == "__main__":
    main()
