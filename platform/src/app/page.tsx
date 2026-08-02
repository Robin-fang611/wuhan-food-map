"use client";

import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DualTabs } from "@/components/DualTabs";
import { BottomNav } from "@/components/BottomNav";
import { Fab } from "@/components/Fab";
import { ModuleDetail } from "@/components/ModuleDetail";

export default function Home() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <main className="min-h-screen pb-24">
      <TopBar />
      <div className="mx-auto max-w-3xl px-4 py-4">
        <GlobalSearch onSelectModule={setOpenId} />
      </div>
      <DualTabs onSelect={setOpenId} />
      <BottomNav />
      <Fab />
      {openId && (
        <ModuleDetail moduleId={openId} onClose={() => setOpenId(null)} />
      )}
    </main>
  );
}
