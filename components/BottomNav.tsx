"use client";

export type Tab = "scanner" | "deck" | "map";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "deck", label: "deck", icon: "🎒" },
  { id: "scanner", label: "scan", icon: "📷" },
  { id: "map", label: "radar", icon: "📡" },
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
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-black/5 bg-white/95 px-2 py-2 backdrop-blur">
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex flex-1 flex-col items-center rounded-2xl py-1.5 transition-colors ${
              active ? "text-anymon-lime" : "text-anymon-ink/50"
            }`}
          >
            <span
              className={`text-2xl transition-transform ${
                active ? "-translate-y-0.5 scale-110" : ""
              }`}
            >
              {t.icon}
            </span>
            <span className="font-retro text-[10px] tracking-wider">
              {t.label}
            </span>
            {t.id === "map" && nearbyCount > 0 && (
              <span className="absolute right-3 top-0 rounded-full bg-anymon-ocean px-1.5 text-[10px] font-bold text-white">
                {nearbyCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
