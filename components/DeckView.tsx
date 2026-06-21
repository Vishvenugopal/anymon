"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "next-auth/react";
import AnymonCanvas from "./AnymonCanvas";
import {
  apiAcknowledge,
  apiHeal,
  apiRecall,
  apiRelease,
  type Anymon,
  type Player,
  type Position,
} from "@/lib/client";
import { healCost } from "@/lib/economy";
import { MAX_DECK, MAX_WILD, RARITY_MAX } from "@/lib/types";

/** Render a player's display name as "Trainer X" (casing preserved via .preserve-case). */
export function trainerName(name: string): string {
  return `Trainer ${name}`;
}

/** Plain-language explainer for what deploying / roaming entails. */
function RoamExplainer() {
  return (
    <p className="text-xs leading-relaxed text-anymon-ink/75">
      Deploying sends your anymon out to{" "}
      <span className="text-anymon-cardink">roam the wild</span>. While roaming it
      can fight other roaming anymon to{" "}
      <span className="text-anymon-coin">earn you coins</span> — but watch out:
      other trainers can find and <span className="text-anymon-cardink">capture it</span>{" "}
      for themselves.
    </p>
  );
}

/**
 * Shared modal: pure info (the "?" reopen) when no `onConfirm`, or a
 * deploy-confirmation when `onConfirm` is provided.
 */
function RoamInfoModal({
  onClose,
  onConfirm,
  busy,
  error,
}: {
  onClose: () => void;
  onConfirm?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const confirm = typeof onConfirm === "function";
  return (
    <motion.div
      className="deck-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="deck-modal"
        initial={{ scale: 0.9, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-retro text-lg uppercase tracking-wide text-anymon-cardink">
          {confirm ? "deploy to the wild?" : "roaming in the wild"}
        </div>
        <RoamExplainer />
        {error && (
          <div className="mt-2 text-center text-[11px] text-anymon-berry">
            {error}
          </div>
        )}
        {confirm ? (
          <div className="mt-3 flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="retro-btn flex-1 border-anymon-edgecloud bg-white py-2 text-xs"
            >
              cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="retro-btn flex-1 border-anymon-edgelime bg-anymon-lime py-2 text-xs text-white shadow-gummy-lime"
            >
              {busy ? "deploying…" : "deploy"}
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="retro-btn mt-3 w-full border-anymon-edgecard bg-anymon-card py-2 text-xs text-white shadow-[0_3px_0_0_#8C2B38]"
          >
            got it
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

/** 1–5 gold stars in the top-left of the art window. */
function RarityStars({ rarity }: { rarity: number }) {
  const filled = Math.max(1, Math.min(RARITY_MAX, Math.round(rarity || 1)));
  return (
    <div className="card-stars" aria-label={`rarity ${filled} of ${RARITY_MAX}`}>
      {Array.from({ length: filled }).map((_, i) => (
        <span key={i} className="card-star">
          ★
        </span>
      ))}
    </div>
  );
}

function AnymonCard({
  a,
  onChanged,
  onDeploy,
  idx = 0,
}: {
  a: Anymon;
  onChanged: () => void;
  /** Provided for deck cards: opens the shared deploy-confirm modal. */
  onDeploy?: (a: Anymon) => void;
  idx?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [coinFx, setCoinFx] = useState<number | null>(null);
  const ackedRef = useRef(false);

  const hurt = a.hp < a.maxHp;
  const cost = healCost(a);

  // "+XX$" reward effect: rises off the card, fades, then clears the tally.
  useEffect(() => {
    if (a.pendingCoins > 0 && !ackedRef.current) {
      ackedRef.current = true;
      setCoinFx(a.pendingCoins);
      apiAcknowledge(a.id).then(() => onChanged());
      const t = setTimeout(() => setCoinFx(null), 1600);
      return () => clearTimeout(t);
    }
  }, [a.id, a.pendingCoins, onChanged]);

  const recall = async () => {
    setBusy(true);
    setErr(null);
    const res = await apiRecall(a.id);
    setBusy(false);
    if (!res.ok) setErr(res.error || "deck is full");
    else onChanged();
  };

  const heal = async () => {
    setBusy(true);
    setErr(null);
    const res = await apiHeal(a.id);
    setBusy(false);
    if (!res.ok) setErr(res.error || "can't heal");
    else onChanged();
  };

  // Subtle hand-of-cards tilt so the deck reads as real physical cards.
  const tilt = idx % 2 === 0 ? -1.6 : 1.6;

  return (
    <div className="relative">
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
          {/* Title bar: name + object-type label */}
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 pt-0.5">
            <div className="truncate font-retro text-sm uppercase tracking-wide text-anymon-white drop-shadow-[0_1px_0_rgba(120,20,30,0.7)]">
              {a.name}
            </div>
            <span className="type-badge shrink-0">{a.object}</span>
          </div>

          {/* Framed art window wrapping the 3D canvas (rectangular like real cards) */}
          <div className="relative border-2 border-white/55 bg-anymon-cloud shadow-[inset_0_2px_6px_rgba(120,20,30,0.35)]">
            <RarityStars rarity={a.rarity} />
            <div className="h-36 w-full overflow-hidden">
              <AnymonCanvas
                glbUrl={a.status === "ready" ? a.glbUrl : null}
                spriteFallback={a.spriteDataUri}
                className="h-full w-full"
              />
            </div>
            {a.status !== "ready" && (
              <div className="absolute left-1.5 bottom-1.5 rounded-gummy border border-anymon-edgeberry bg-anymon-berry px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-anymon-white">
                incubating…
              </div>
            )}
          </div>

          {/* Stats strip: location + coins */}
          <div className="mt-1.5 flex items-center justify-between gap-2 border-2 border-white/55 bg-white/95 px-2 py-1">
            <div className="truncate text-[10px] text-anymon-ink/70">
              {a.city}, {a.country}
            </div>
            <div className="shrink-0 font-retro text-xs text-anymon-coin">
              {a.coins}¢
            </div>
          </div>

          {/* HP + heal (only when hurt) */}
          {hurt && (
            <div className="mt-1.5 flex items-center justify-between gap-2 border-2 border-white/55 bg-white/95 px-2 py-1">
              <div className="shrink-0 font-retro text-[11px] text-anymon-berry">
                hp {a.hp}/{a.maxHp}
              </div>
              <button
                onClick={heal}
                disabled={busy}
                className="retro-btn border-anymon-edgecoin bg-anymon-coin px-2 py-1 text-[10px] text-white shadow-[0_2px_0_0_#92400E]"
              >
                {busy ? "…" : `heal ${cost}¢`}
              </button>
            </div>
          )}

          {/* Roaming "won N battles" notice */}
          {a.state === "wild" && a.pendingWins > 0 && (
            <div className="win-notice mt-1.5">
              ⚔ won {a.pendingWins} {a.pendingWins === 1 ? "battle" : "battles"}
            </div>
          )}

          {/* Footer action */}
          {a.state === "deck" ? (
            <button
              onClick={() => onDeploy?.(a)}
              disabled={busy}
              className="retro-btn mt-1.5 w-full border-anymon-edgelime bg-anymon-lime py-1.5 text-xs text-white shadow-gummy-lime"
            >
              deploy
            </button>
          ) : (
            <div className="mt-1.5">
              <div className="text-center text-[10px] uppercase tracking-wide text-anymon-coin">
                roaming in the wild
              </div>
              <button
                onClick={recall}
                disabled={busy}
                className="retro-btn mt-1 w-full border-anymon-edgeocean bg-anymon-ocean py-1.5 text-xs text-white shadow-[0_3px_0_0_#1F5E78]"
              >
                {busy ? "recalling…" : "recall"}
              </button>
            </div>
          )}
          {err && (
            <div className="mt-1 text-center text-[10px] text-anymon-berry drop-shadow-[0_1px_0_rgba(120,20,30,0.6)]">
              {err}
            </div>
          )}
        </div>
      </motion.div>

      {/* Floating reward effect (rendered outside the clipped card so it can rise) */}
      <AnimatePresence>
        {coinFx !== null && (
          <motion.div
            key="coinfx"
            className="coin-pop"
            initial={{ opacity: 0, y: 12, scale: 0.8 }}
            animate={{ opacity: 1, y: -52, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          >
            +{coinFx}$
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CapturedAlert({
  a,
  onChanged,
}: {
  a: Anymon;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const dismiss = async () => {
    setBusy(true);
    await apiAcknowledge(a.id);
    setBusy(false);
    onChanged();
  };
  return (
    <div className="captured-alert flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm text-anymon-cardink">
          <span className="font-retro uppercase">{a.name}</span> was captured!
        </div>
        <div className="truncate text-[11px] text-anymon-ink/60">
          taken by{" "}
          <span className="preserve-case text-anymon-cardink">
            {a.capturedBy || "another trainer"}
          </span>
        </div>
      </div>
      <button
        onClick={dismiss}
        disabled={busy}
        className="retro-btn shrink-0 border-anymon-edgeberry bg-anymon-berry px-3 py-1 text-xs text-white shadow-retro-berry"
      >
        {busy ? "…" : "dismiss"}
      </button>
    </div>
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
  const captured = anymons.filter((a) => a.state === "captured");
  const totalCoins = anymons.reduce((s, a) => s + a.coins, 0);

  // Shared modal: { mode: "info" } for the "?" explainer, or a deploy confirm.
  const [modal, setModal] = useState<
    null | { mode: "info" } | { mode: "confirm"; a: Anymon }
  >(null);
  const [deploying, setDeploying] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const closeModal = () => {
    if (deploying) return;
    setModal(null);
    setModalErr(null);
  };

  const confirmDeploy = async () => {
    if (!modal || modal.mode !== "confirm") return;
    if (!pos) {
      setModalErr("need your location to deploy");
      return;
    }
    setDeploying(true);
    setModalErr(null);
    const res = await apiRelease(modal.a.id, pos);
    setDeploying(false);
    if (!res.ok) {
      setModalErr(res.error || "the wild is full");
      return;
    }
    setModal(null);
    onChanged();
  };

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
              <div className="preserve-case trainer-name">
                {trainerName(player.name)}
              </div>
              <button
                onClick={() => signOut()}
                className="text-xs text-anymon-ink/40 underline-offset-2 hover:underline"
              >
                sign out
              </button>
            </div>
            <div className="coins-counter px-4 py-2 text-right">
              <div className="font-retro text-lg text-anymon-coin">
                {totalCoins}¢
              </div>
              <div className="text-[10px] text-anymon-ink/50">coins</div>
            </div>
          </div>
        </div>

        {/* Captured-ghost alerts (never silently dropped) */}
        {captured.length > 0 && (
          <div className="mb-4 space-y-2">
            {captured.map((a) => (
              <CapturedAlert key={a.id} a={a} onChanged={onChanged} />
            ))}
          </div>
        )}

        <SectionHeader title="deck" count={deck.length} max={MAX_DECK} />
        {deck.length === 0 ? (
          <Empty text="scan an object to create your first anymon" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {deck.map((a, i) => (
              <AnymonCard
                key={a.id}
                a={a}
                onChanged={onChanged}
                onDeploy={(target) => {
                  setModalErr(null);
                  setModal({ mode: "confirm", a: target });
                }}
                idx={i}
              />
            ))}
          </div>
        )}

        <div className="mt-6">
          <SectionHeader
            title="roaming in the wild"
            count={wild.length}
            max={MAX_WILD}
            onInfo={() => {
              setModalErr(null);
              setModal({ mode: "info" });
            }}
          />
          {wild.length === 0 ? (
            <Empty text="deploy anymon to battle for coins (and risk capture!)" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {wild.map((a, i) => (
                <AnymonCard key={a.id} a={a} onChanged={onChanged} idx={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {modal && (
          <RoamInfoModal
            key="roam-modal"
            onClose={closeModal}
            onConfirm={modal.mode === "confirm" ? confirmDeploy : undefined}
            busy={deploying}
            error={modalErr}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  max,
  onInfo,
}: {
  title: string;
  count: number;
  max: number;
  onInfo?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <div className="font-bold">{title}</div>
        {onInfo && (
          <button
            onClick={onInfo}
            aria-label="what does roaming mean?"
            className="flex h-4 w-4 items-center justify-center rounded-full border border-anymon-edgecard bg-anymon-card/15 text-[10px] font-bold text-anymon-cardink"
          >
            ?
          </button>
        )}
      </div>
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
