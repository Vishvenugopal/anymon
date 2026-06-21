"use client";

import { useState } from "react";
import Image from "next/image";
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

/** Render a player's display name as "Trainer X" (casing preserved via .preserve-case). */
export function trainerName(name: string): string {
  return `Trainer ${name}`;
}

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
    <motion.div
      layout
      className="overflow-hidden rounded-xl border-2 border-anymon-ink bg-anymon-ink p-1.5 shadow-retro"
    >
      {/* Title bar: name + element/type badge */}
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5 pt-1">
        <div className="truncate font-retro text-sm font-bold uppercase tracking-wide text-anymon-white">
          {a.name}
        </div>
        <span className="type-badge shrink-0">{a.object}</span>
      </div>

      {/* Framed art window wrapping the 3D canvas */}
      <div className="relative rounded-md border-2 border-anymon-ink bg-anymon-cloud">
        <div className="h-36 w-full overflow-hidden rounded-[3px]">
          <AnymonCanvas
            glbUrl={a.status === "ready" ? a.glbUrl : null}
            spriteFallback={a.spriteDataUri}
            className="h-full w-full"
          />
        </div>
        {a.status !== "ready" && (
          <div className="absolute left-1.5 top-1.5 rounded border border-anymon-ink bg-anymon-berry px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-anymon-white">
            incubating…
          </div>
        )}
      </div>

      {/* Stats strip: coins + location */}
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border-2 border-anymon-ink bg-anymon-white px-2 py-1">
        <div className="truncate text-[10px] font-semibold text-anymon-ink/70">
          {a.city}, {a.country}
        </div>
        <div className="shrink-0 font-retro text-xs font-bold text-amber-600">
          {a.coins}¢
        </div>
      </div>

      {/* Footer action */}
      {a.state === "deck" ? (
        <button
          onClick={release}
          disabled={busy}
          className="retro-btn mt-1.5 w-full bg-anymon-lime py-1.5 text-xs"
        >
          {busy ? "releasing…" : "release to wild"}
        </button>
      ) : (
        <div className="mt-1.5 w-full rounded-lg border-2 border-anymon-ink bg-anymon-ocean/20 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-anymon-ocean">
          farming in the wild
        </div>
      )}
      {err && (
        <div className="mt-1 text-center text-[10px] font-semibold text-anymon-berry">
          {err}
        </div>
      )}
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
          <Image
            src="/logos/deck.png"
            alt="deck"
            width={440}
            height={180}
            priority
            className="mb-1 h-auto w-[60%] max-w-[180px] object-contain"
          />
          <div className="preserve-case text-2xl font-bold">
            {trainerName(player.name)}
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs text-anymon-ink/40 underline-offset-2 hover:underline"
          >
            sign out
          </button>
        </div>
        <div className="retro-panel px-4 py-2 text-right">
          <div className="font-retro text-lg font-bold text-amber-600">
            {totalCoins}¢
          </div>
          <div className="text-[10px] font-semibold text-anymon-ink/50">coins</div>
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
