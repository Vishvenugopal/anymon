"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import ScannerView from "@/components/ScannerView";
import DeckView from "@/components/DeckView";
import { unlockAudio, playSfx } from "@/lib/audio";
import BottomNav, { type Tab } from "@/components/BottomNav";
import SignIn from "@/components/SignIn";
import UsernameSetup from "@/components/UsernameSetup";
import {
  apiAutoBattle,
  apiList,
  apiMe,
  apiNearby,
  apiPresence,
  apiSeed,
  getPosition,
  reverseGeocode,
  type Anymon,
  type MeResponse,
  type NearbyTrainer,
  type Player,
  type Position,
} from "@/lib/client";

type NearbyAnymon = Anymon & { distM: number; mine: boolean };

export default function Home() {
  const { status } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);

  const [pos, setPos] = useState<Position | null>(null);
  const [place, setPlace] = useState({ city: "Somewhere", country: "Earth" });
  const [tab, setTab] = useState<Tab>("scanner");
  const [anymons, setAnymons] = useState<Anymon[]>([]);
  const [nearby, setNearby] = useState<NearbyAnymon[]>([]);
  const [trainers, setTrainers] = useState<NearbyTrainer[]>([]);
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const posRef = useRef<Position | null>(null);

  // Memoized so its identity is stable across renders (otherwise a fresh object
  // each render retriggers the effects that depend on `player`).
  const player: Player | null = useMemo(
    () =>
      me?.authenticated && me.id && me.username
        ? { id: me.id, name: me.username }
        : null,
    [me],
  );

  const loadMe = useCallback(async () => {
    setMe(await apiMe());
  }, []);

  // Pull our profile whenever auth state changes.
  useEffect(() => {
    if (status === "authenticated") loadMe();
    if (status === "unauthenticated") setMe({ authenticated: false });
  }, [status, loadMe]);

  const refresh = useCallback(async () => {
    try {
      setAnymons(await apiList());
    } catch {
      /* noop */
    }
    const cur = posRef.current;
    if (cur) {
      try {
        await apiAutoBattle(cur);
        setNearby(await apiNearby(cur));
      } catch {
        /* noop */
      }
      try {
        // Upsert our presence + discover nearby trainers and any PvP invite.
        const presence = await apiPresence(cur);
        setTrainers(presence.trainers);
        setInviteRoomId(presence.invite?.roomId ?? null);
      } catch {
        /* noop */
      }
    }
  }, []);

  // Boot location + seed once we have a usable player.
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    (async () => {
      try {
        const position = await getPosition();
        if (cancelled) return;
        posRef.current = position;
        setPos(position);
        const where = await reverseGeocode(position);
        setPlace(where);
        await apiSeed(position);
      } catch {
        /* location denied: scanning + deck still work */
      } finally {
        await refresh();
        if (!cancelled) setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  // Keep coins + radar + presence/invites fresh.
  useEffect(() => {
    if (!player) return;
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [player, refresh]);

  // Audio: unlock on the first user gesture (autoplay policy), then play a short
  // click sound whenever any button is pressed. Background music is driven by the
  // screens themselves (ambient by default; battle screens switch to battle).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button")) playSfx("click");
    };
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // ---- Gating (all wrapped in the same phone-width frame as the app) ----
  if (status === "loading" || me === null) {
    return (
      <PhoneFrame>
        <Splash />
      </PhoneFrame>
    );
  }
  if (!me.authenticated) {
    return (
      <PhoneFrame>
        <SignIn />
      </PhoneFrame>
    );
  }
  if (me.needsUsername || !me.username) {
    return (
      <PhoneFrame>
        <UsernameSetup onDone={loadMe} />
      </PhoneFrame>
    );
  }

  return (
    <main className="flex min-h-[100dvh] w-full justify-center bg-anymon-ink">
      <div className="relative h-[100dvh] w-full max-w-md overflow-hidden bg-anymon-cloud shadow-2xl">
        {tab === "scanner" && player && (
          <ScannerView
            pos={pos}
            place={place}
            nearby={nearby}
            deck={anymons}
            player={player}
            trainers={trainers}
            inviteRoomId={inviteRoomId}
            onRefresh={refresh}
            onInviteHandled={() => setInviteRoomId(null)}
          />
        )}
        {tab === "deck" && player && (
          <DeckView anymons={anymons} pos={pos} player={player} onChanged={refresh} />
        )}

        {!booted && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs text-white">
            warming up…
          </div>
        )}

        <BottomNav tab={tab} setTab={setTab} nearbyCount={nearby.length} />
      </div>
    </main>
  );
}

/** Shared phone-width frame so every screen keeps the mobile aspect ratio. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] w-full justify-center bg-anymon-ink">
      <div className="relative h-[100dvh] w-full max-w-md overflow-hidden bg-anymon-cloud shadow-2xl">
        {children}
      </div>
    </main>
  );
}

function Splash() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden bg-[#FBF6F3] text-anymon-ink">
      {/* Match the sign-in screen: cream base + a rising lime/green dot field. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[36%]"
        style={{
          backgroundImage: "radial-gradient(#8BE01E 1px, transparent 1.6px)",
          backgroundSize: "6px 6px",
          imageRendering: "pixelated",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,0) 100%)",
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,0) 100%)",
        }}
      />
      <Image
        src="/logos/anymon.png"
        alt="anyMon!"
        width={440}
        height={220}
        priority
        className="relative z-10 h-auto w-[60%] max-w-[220px] object-contain animate-bob"
      />
    </div>
  );
}
