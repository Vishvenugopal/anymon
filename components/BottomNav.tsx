"use client";

import Image from "next/image";

export type Tab = "scanner" | "deck";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "scanner", label: "scan", icon: "📷" },
  { id: "deck", label: "deck", icon: "🎒" },
];

export default function BottomNav({
  tab,
  setTab,
  nearbyCount,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  nearbyCount: number;
}) {
  const scan = TABS[0];
  const deck = TABS[1];

  const TabButton = ({ t }: { t: (typeof TABS)[number] }) => {
    const active = tab === t.id;
    return (
      <button
        onClick={() => setTab(t.id)}
        className={`relative flex w-20 flex-col items-center rounded-gummy py-1.5 transition-colors ${
          active ? "text-anymon-lime" : "text-anymon-ink/50"
        }`}
      >
        <span
          className={`text-3xl transition-transform ${
            active ? "-translate-y-0.5 scale-110 -rotate-12" : ""
          }`}
        >
          {t.icon}
        </span>
        {t.id === "scanner" && nearbyCount > 0 && (
          <span className="absolute right-1 top-0 rounded-full bg-anymon-ocean px-1.5 text-[10px] text-white">
            {nearbyCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-anymon-edgecloud bg-white/95 px-6 py-2 backdrop-blur">
      <TabButton t={scan} />

      {/* Game logo always pinned in the center, between the two tabs. */}
      <Image
        src="/logos/anymon.png"
        alt="anymon"
        width={220}
        height={110}
        priority
        className="h-9 w-auto shrink-0 object-contain"
      />

      <TabButton t={deck} />
    </div>
  );
}
