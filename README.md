# anymon

A multi-user AR edutainment collector: sign in, scan a real object, an AI turns it into a 3D monster ("Anymon"), then deploy, battle, and learn. Battles are judged by Claude using real-world physics/chemistry/biology, so every fight teaches something true.

## Pipeline

`webcam photo -> Claude Vision (label) + Gemini "Nano Banana Pro" image-to-image (real photo -> stylized sprite) -> image-to-3D (.glb) -> Redis`

The **actual photograph** is fed into Gemini (`gemini-3-pro-image`) as image input alongside a style prompt, so the Anymon genuinely resembles the scanned object. Gemini's base64 output is passed straight to the 3D provider as a data URI (no image hosting needed).

## Sponsor tracks

- **Redis** — geospatial `GEOADD`/`GEOSEARCH` for wild Anymons, distributed `SET NX PX` locks during battles, user + Anymon storage.
- **Claude** — Vision for object ID + the educational battle "Game Master" that explains the real-world reason one Anymon beats another.
- **The Token Company** — compresses battle prompts before they hit Claude (graceful pass-through if no key).

## Quick start

```bash
npm install
copy .env.local.example .env.local     # macOS/Linux: cp ...
npx auth secret                        # writes AUTH_SECRET into .env.local
npm run dev
```

Open http://localhost:3000.

Out of the box (`MOCK_PIPELINE=1`, `ALLOW_GUEST=1`, no Redis) you can **continue as guest**, pick a username, and play the full loop with placeholder art + sample 3D models, using an in-memory store.

## Auth (real multi-user)

Sign-in uses [Auth.js (NextAuth v5)](https://authjs.dev) with a Google provider.

1. Google Cloud Console -> APIs & Services -> Credentials -> **Create OAuth client ID** -> Web application.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (add your ngrok HTTPS URL too for phone testing).
3. Put the client id/secret in `.env.local` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, and make sure `AUTH_SECRET` is set.
4. Each user picks a unique username on first login; it becomes the creator name on their Anymons. Identity/ownership is derived server-side from the session (clients can't spoof it).

Set `ALLOW_GUEST=0` to require Google only.

## How do I set up Redis?

Any of these — set `REDIS_URL` and restart:

- **Redis Cloud (free tier, easiest):** [redis.io/cloud](https://redis.io/cloud) -> create a free database -> copy the connection string. Format: `redis://default:<password>@<host>:<port>`.
- **Upstash:** create a Redis database -> use the `redis://` (TCP) URL. (We use `ioredis`, so prefer the TCP URL over the REST one.)
- **Local (Docker):** `docker run -p 6379:6379 redis` then `REDIS_URL=redis://localhost:6379`.
- **Local (WSL/Ubuntu):** `sudo apt install redis-server && sudo service redis-server start`.

No `REDIS_URL` = in-memory store (single process, resets on restart, not shared between server instances). For real multi-user across devices, use Redis.

## 3D provider: Meshy vs TRELLIS

Set `MODEL_3D_PROVIDER` (or let it auto-detect):

- `meshy` — hosted, paid, zero setup. Needs `MESHY_API_KEY`.
- `trellis` — **free & open-source, self-hosted**. Needs an NVIDIA GPU. Run the included [trellis_server](trellis_server/README.md) and set `TRELLIS_API_URL`.
- `mock` — sample `.glb` models, no keys, for demos.

Is TRELLIS viable instead of Meshy? Yes if you have an NVIDIA GPU (locally or on a cloud GPU) — it's comparable quality at $0. It is **not** viable on a laptop without a capable NVIDIA GPU; CPU-only isn't practical. See [trellis_server/README.md](trellis_server/README.md).

## Test camera + GPS on iPhone

Camera/geolocation require HTTPS on iOS:

```bash
ngrok http 3000
```

Open the `https://…` URL in iPhone Safari. Add that URL to Google's authorized redirect URIs and set `AUTH_URL` to it.

## Gameplay

- Hold max **5 deck + 5 wild** Anymons.
- **Release** deck Anymons into the wild — they passively farm coins (and can be captured by others).
- **Radar** shows wild Anymons within 100m; battle them with a deck fighter to win coins and capture.
- **Auto-battles**: nearby wild Anymons of different types have a 50% chance to skirmish in the background.

## Tech

Next.js 14 (App Router) · Auth.js (NextAuth v5) · Tailwind · Framer Motion · react-webcam · @react-three/fiber + drei · ioredis · @anthropic-ai/sdk · @google/genai · Meshy / TRELLIS.
