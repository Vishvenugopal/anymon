"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";
import AnymonCanvas from "./AnymonCanvas";
import {
  apiRelease,
  type Anymon,
  type Player,
  type Position,
} from "@/lib/client";
import { MAX_DECK, MAX_WILD } from "@/lib/types";

function AnymonCard({
  a,
  pos,
  onChanged,
}: {
  a: Anymon;
  pos: Position | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const release = async () => {
    if (!pos) {
      setErr("need your location");
      return;
    }
    setBusy(true);
    const res = await apiRelease(a.id, pos);
    setBusy(false);
    if (!res.ok) setErr(res.error || "failed");
    else onChanged();
  };

  return (
    <motion.div layout className="card-gummy overflow-hidden">
      <div className="h-36 w-full bg-anymon-cloud">
        <AnymonCanvas
          glbUrl={a.status === "ready" ? a.glbUrl : null}
          spriteFallback={a.spriteDataUri}
          className="h-full w-full"
        />
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="font-bold">{a.name}</div>
          <div className="font-retro text-xs text-yellow-600">{a.coins}¢</div>
        </div>
        <div className="text-[11px] text-anymon-ink/60">
          {a.city}, {a.country}
        </div>
        {a.status !== "ready" && (
          <div className="mt-1 text-[11px] text-anymon-ocean">incubating…</div>
        )}
        {a.state === "deck" ? (
          <button
            onClick={release}
            disabled={busy}
            className="gummy-btn mt-2 w-full bg-anymon-lime py-2 text-sm shadow-gummy-lime disabled:opacity-60"
          >
            {busy ? "releasing…" : "release to wild"}
          </button>
        ) : (
          <div className="mt-2 w-full rounded-full bg-anymon-ocean/15 py-2 text-center text-sm font-semibold text-anymon-ocean">
            farming in the wild
          </div>
        )}
        {err && <div className="mt-1 text-[11px] text-red-500">{err}</div>}
      </div>
    </motion.div>
  );
}

export default function DeckView({
  anymons,
  pos,
  player,
  onChanged,
}: {
  anymons: Anymon[];
  pos: Position | null;
  player: Player;
  onChanged: () => void;
}) {
  const deck = anymons.filter((a) => a.state === "deck");
  const wild = anymons.filter((a) => a.state === "wild");
  const totalCoins = anymons.reduce((s, a) => s + a.coins, 0);

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-anymon-cloud p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-retro text-xs tracking-widest text-anymon-ocean">
            your collection
          </div>
          <div className="text-2xl font-bold">@{player.name}</div>
          <button
            onClick={() => signOut()}
            className="text-xs text-anymon-ink/40 underline-offset-2 hover:underline"
          >
            sign out
          </button>
        </div>
        <div className="rounded-gummy bg-white px-4 py-2 text-right shadow-gummy">
          <div className="font-retro text-lg text-yellow-600">{totalCoins}¢</div>
          <div className="text-[10px] text-anymon-ink/50">coins</div>
        </div>
      </div>

      <SectionHeader title="deck" count={deck.length} max={MAX_DECK} />
      {deck.length === 0 ? (
        <Empty text="scan an object to create your first anymon" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {deck.map((a) => (
            <AnymonCard key={a.id} a={a} pos={pos} onChanged={onChanged} />
          ))}
        </div>
      )}

      <div className="mt-6">
        <SectionHeader title="deployed in the wild" count={wild.length} max={MAX_WILD} />
        {wild.length === 0 ? (
          <Empty text="release anymons to farm coins (and risk capture!)" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {wild.map((a) => (
              <AnymonCard key={a.id} a={a} pos={pos} onChanged={onChanged} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  max,
}: {
  title: string;
  count: number;
  max: number;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="font-bold">{title}</div>
      <div className="font-retro text-xs text-anymon-ink/50">
        {count}/{max}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-gummy border-2 border-dashed border-anymon-ocean/30 p-6 text-center text-sm text-anymon-ink/50">
      {text}
    </div>
  );
}
