"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import ScannerView from "@/components/ScannerView";
import DeckView from "@/components/DeckView";
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

  const player: Player | null =
    me?.authenticated && me.id && me.username
      ? { id: me.id, name: me.username }
      : null;

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
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-anymon-ocean to-anymon-lime text-white">
      <Image
        src="/logos/anymon.png"
        alt="anyMon!"
        width={440}
        height={220}
        priority
        className="h-auto w-[60%] max-w-[220px] object-contain animate-bob"
      />
    </div>
  );
}
