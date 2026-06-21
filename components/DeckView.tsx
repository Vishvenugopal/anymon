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
  idx = 0,
}: {
  a: Anymon;
  pos: Position | null;
  onChanged: () => void;
  idx?: number;
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

  // Subtle hand-of-cards tilt so the deck reads as real physical cards.
  const tilt = idx % 2 === 0 ? -1.6 : 1.6;

  return (
    <motion.div
      layout
      whileHover={{ rotateX: 7, rotateY: -7, scale: 1.05, zIndex: 30 }}
      transition={{ type: "spring", stiffness: 240, damping: 18 }}
      style={{ transformPerspective: 720, rotateZ: tilt }}
      className="anymon-card group p-1.5"
    >
      {/* moving glossy foil sheen (above art, below text via z-index) */}
      <div className="card-sheen z-20" />

      <div className="relative z-10">
        {/* Title bar: name + element/type badge */}
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5 pt-0.5">
          <div className="truncate font-retro text-sm uppercase tracking-wide text-anymon-white drop-shadow-[0_1px_0_rgba(120,20,30,0.7)]">
            {a.name}
          </div>
          <span className="type-badge shrink-0">{a.object}</span>
        </div>

        {/* Framed art window wrapping the 3D canvas (rectangular like real cards) */}
        <div className="relative border-2 border-white/55 bg-anymon-cloud shadow-[inset_0_2px_6px_rgba(120,20,30,0.35)]">
          <div className="h-36 w-full overflow-hidden">
            <AnymonCanvas
              glbUrl={a.status === "ready" ? a.glbUrl : null}
              spriteFallback={a.spriteDataUri}
              className="h-full w-full"
            />
          </div>
          {a.status !== "ready" && (
            <div className="absolute left-1.5 top-1.5 rounded-gummy border border-anymon-edgeberry bg-anymon-berry px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-anymon-white">
              incubating…
            </div>
          )}
        </div>

        {/* Stats strip: coins + location */}
        <div className="mt-1.5 flex items-center justify-between gap-2 border-2 border-white/55 bg-white/95 px-2 py-1">
          <div className="truncate text-[10px] text-anymon-ink/70">
            {a.city}, {a.country}
          </div>
          <div className="shrink-0 font-retro text-xs text-amber-600">
            {a.coins}¢
          </div>
        </div>

        {/* Footer action */}
        {a.state === "deck" ? (
          <button
            onClick={release}
            disabled={busy}
            className="retro-btn mt-1.5 w-full border-anymon-edgelime bg-anymon-lime py-1.5 text-xs"
          >
            {busy ? "releasing…" : "release to wild"}
          </button>
        ) : (
          <div className="mt-1.5 w-full rounded-gummy border-2 border-anymon-edgecloud bg-white/90 py-1.5 text-center text-xs uppercase tracking-wide text-anymon-ocean">
            farming in the wild
          </div>
        )}
        {err && (
          <div className="mt-1 text-center text-[10px] text-anymon-berry drop-shadow-[0_1px_0_rgba(120,20,30,0.6)]">
            {err}
          </div>
        )}
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
    <div className="relative h-full bg-[#FBF6F3]">
      {/* Red dot field rising from the bottom (behind content + bottom menu). */}
      <div className="deck-dots-red pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[36%]" />

      <div className="no-scrollbar relative z-10 h-full overflow-y-auto p-4 pb-24">
      <div className="mb-4">
        <Image
          src="/logos/deck.png"
          alt="deck"
          width={440}
          height={180}
          priority
          className="mx-auto mb-3 h-auto w-[55%] max-w-[180px] object-contain"
        />
        <div className="flex items-end justify-between">
          <div>
            <div className="preserve-case font-retro text-2xl text-anymon-ink">
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
            <div className="font-retro text-lg text-amber-600">{totalCoins}¢</div>
            <div className="text-[10px] text-anymon-ink/50">coins</div>
          </div>
        </div>
      </div>

      <SectionHeader title="deck" count={deck.length} max={MAX_DECK} />
      {deck.length === 0 ? (
        <Empty text="scan an object to create your first anymon" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {deck.map((a, i) => (
            <AnymonCard key={a.id} a={a} pos={pos} onChanged={onChanged} idx={i} />
          ))}
        </div>
      )}

      <div className="mt-6">
        <SectionHeader title="deployed in the wild" count={wild.length} max={MAX_WILD} />
        {wild.length === 0 ? (
          <Empty text="release anymons to farm coins (and risk capture!)" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {wild.map((a, i) => (
              <AnymonCard key={a.id} a={a} pos={pos} onChanged={onChanged} idx={i} />
            ))}
          </div>
        )}
      </div>
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
    <div className="px-4 py-5 text-center text-sm text-anymon-ink/60">{text}</div>
  );
}
