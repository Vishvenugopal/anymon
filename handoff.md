# Anymon — Claude Code Handoff

Last updated: 2026-06-21  
Repo: `BerkeleyAIHack2026` (Berkeley AI Hackathon project)  
Production URL: https://anymon.vercel.app  
Local dev: http://localhost:3000

---

## 1. What this project is

**Anymon** is a mobile-first AR edutainment collector game (Pokémon-inspired). Players:

1. Sign in (Google OAuth or guest)
2. Pick a username (`Trainer <name>`)
3. Scan real-world objects with the phone camera
4. AI turns the photo into a stylized 2D sprite + 3D `.glb` model
5. Collect Anymons in a deck (max 5), **deploy** them to **roam** in the wild (max 5)
6. Battle wild Anymons and nearby trainers (turn-based, object-themed moves)
7. Learn science — battle outcomes and move blurbs reference real physics/chemistry/biology

Sponsor integrations:

| Sponsor | Role |
|---------|------|
| **Redis** | Geospatial state, user/Anymon storage, distributed locks |
| **Claude (Anthropic)** | Vision object ID, creative naming, move generation, battle reasoning |
| **Gemini (Google)** | Image-to-image 2D sprite generation ("Nano Banana") |
| **Meshy** | Image → 3D `.glb` (primary 3D provider) |
| **The Token Company** | Optional prompt compression (pass-through if no key) |

---

## 2. Tech stack

- **Next.js 14** (App Router), TypeScript, Tailwind CSS, Framer Motion
- **Auth.js / NextAuth v5** — Google OAuth + optional guest provider
- **react-webcam** — camera feed (scanner + battle AR mode)
- **@react-three/fiber + drei** — 3D models in cards, AR overlay, battles
- **ioredis** — Redis client (`lib/store.ts`)
- **@anthropic-ai/sdk**, **@google/genai**, **@gradio/client** (HF Space fallback)

---

## 3. Repository layout

```
app/
  page.tsx                 # Main client shell (auth gating, tabs, polling loops)
  layout.tsx               # Root layout + Providers
  globals.css              # Design system (retro panels, cards, dots, shadows)
  api/                     # All REST endpoints (see §6)

components/
  SignIn.tsx               # Google + guest sign-in
  UsernameSetup.tsx        # First-time username picker
  ScannerView.tsx          # AR scanner, capture, radar, wild/PvP battles entry
  ArScene.tsx              # R3F overlay: wild Anymons + nearby trainers in AR
  DeckView.tsx             # TCG-style cards, deploy/recall/heal, notifications
  BattleScreen.tsx         # Single-player turn-based wild battles
  PvpBattleScreen.tsx      # PvP battles + accept/decline challenge UI
  IncubatingScreen.tsx     # Post-capture 3D generation progress
  BottomNav.tsx            # Scanner / Anymon logo / Deck tabs
  AnymonCanvas.tsx         # Shared GLB renderer

lib/
  client.ts                # Client-side API helpers + types re-exports
  store.ts                 # MemoryStore + RedisStore abstraction
  pipeline.ts              # Capture pipeline orchestration
  gemini.ts                # 2D sprite generation
  claude.ts                # Claude Vision, moves, battle logic, naming
  meshy.ts / threed.ts     # 3D provider abstraction (meshy | hfspace | trellis | mock)
  hfspace.ts               # Hugging Face TRELLIS.2 Space via @gradio/client
  economy.ts               # Coins, healing costs, roaming win rewards
  pvp.ts                   # PvP battle resolution helpers
  types.ts                 # Core interfaces + rarity/HP helpers
  prompts.ts               # All LLM system/user prompts
  placeholder.ts           # "Who's that Anymon?" SVG placeholder + sample GLBs

public/
  logos/                   # anymon.png, scanner.png, deck.png
  icons/                   # camera.svg, backpack.svg (Fluent-style nav icons)
  models/                  # Player.fbx, sample GLBs

trellis_server/            # Python FastAPI wrapper for self-hosted TRELLIS (NOT on Vercel)
scripts/                   # Redis test scripts
DEPLOY.md                  # Vercel deployment guide
vercel.json                # maxDuration: 60s for API routes
.env.local.example         # Documented env template (safe to commit)
.env.local                 # Local secrets — DO NOT COMMIT
```

---

## 4. Core architecture

### 4.1 Capture pipeline

```
User photo (base64)
  → Claude identifyAndName(object, creativeName, commonnessRarity 1-5)
  → Gemini generateAnymonSprite(photo, object) → PNG data URI
  → Meshy create3D(raster sprite) → task ID
  → Client polls GET /api/capture/status until ready | failed
```

**Critical invariants** (recently fixed):

- Meshy only receives **raster** images (`lib/meshy.ts` `isRasterImage()`). SVG placeholders are refused.
- Real provider failures set `meshyTaskId = "failed"` — **no more random sample GLB substitution** (the old "lamp/duck" bug).
- `resolveGlb()` has a **3-minute watchdog** (`MAX_INCUBATE_MS`) so status polling always terminates.
- Gemini retries 429/503 with exponential backoff (4 attempts max).

Sentinel values for `meshyTaskId`:

| Value | Meaning |
|-------|---------|
| `"mock"` | Demo mode — serves sample GLB after 6s |
| `"hfspace"` | Background HF Space job |
| `"failed"` | Real failure — UI shows failed state, 2D sprite still works |
| `<task-id>` | Real Meshy/TRELLIS task to poll |

### 4.2 Storage

`lib/store.ts` exposes a `Store` interface with two implementations:

- **MemoryStore** — default when `REDIS_URL` is unset. Single-process, resets on restart.
- **RedisStore** — production. Uses `GEOADD`/`GEOSEARCH`, hash storage, distributed locks.

**Vercel requires Redis.** Serverless functions are stateless; in-memory store breaks capture polling, PvP, and multi-user.

### 4.3 Auth

- `auth.ts` — NextAuth config (Google + Credentials guest provider)
- Session is JWT-based; server routes use `lib/auth-helpers.ts` to get the current user
- Username stored in Redis/memory via `/api/me/username`
- Identity is **never** trusted from client payloads

### 4.4 Battles

**Single-player (wild):**

1. `POST /api/battle/start` — validates matchup, locks defender, returns combatants + moves + matchup
2. Client runs turn-based UI (`BattleScreen.tsx`)
3. `POST /api/battle` — resolves outcome, awards coins, may capture
4. `POST /api/battle/cancel` — releases lock on flee

**PvP (nearby trainers):**

- Presence loop: `POST /api/presence` every few seconds
- Challenge: `POST /api/pvp/challenge` → pending room
- Accept/decline: `POST /api/pvp/respond`
- Poll state: `GET /api/pvp/room`
- Submit move: `POST /api/pvp/move`
- Cancel: `POST /api/pvp/cancel`

Moves are generated once per Anymon object type via Claude and cached in the store.

### 4.5 Economy (current rules)

Defined in `lib/economy.ts` + `lib/types.ts`:

| Action | Coins |
|--------|-------|
| Win wild battle | +10 |
| Roaming auto-battle win | +3 (recorded as `pendingCoins` / `pendingWins`) |
| Capture another trainer's roaming Anymon | +8 |
| PvP win | +15 |
| Heal | ~0.3 coins/HP missing (min 3) |

**No passive/idle coin farming.** Coins are pooled per-owner across all Anymons.

### 4.6 Rarity

- 1–5 gold stars on cards
- Assigned at capture by Claude **commonness** rating (harsh: phone/cup/pen = 1 star)
- Fallback rarity = **1** (not random)
- r1 = 100 HP, r5 = 180 HP; move power scales ×1.0 → ×1.4

### 4.7 AR (simulated ground plane)

Not true WebXR — it's camera feed + R3F overlay for iOS Safari compatibility.

- `ArScene.tsx` places wild Anymons on a ground arc by compass bearing + distance
- `useDeviceOrientation` hook tracks yaw (alpha) + pitch (beta)
- `HeadingGroup` rotates world by compass; `CameraRig` tilts by pitch
- iOS requires `DeviceOrientationEvent.requestPermission()` from a user gesture
- Overlays (`<Html>` nameplates/CAPTURE buttons) hidden when battle/incubating modals are open

---

## 5. Design system conventions

Read `app/globals.css` and `tailwind.config.ts` before changing UI.

**Visual language:** Retro Nintendo / Pokémon / Persona 5 — lime green accents, berry-red cards (`#E24040`), cream backgrounds (`#FBF6F3`).

**Shadows (strict rule):**

- **No horizontal (x) offset** — y-only drop shadows
- **Never black** — use darker shade of the element's edge color (`edgecloud`, `edgelime`, `edgeberry`, `edgecard`, etc.)

**Cards:**

- Sharp corners (no rounding on card frame)
- Glossy/physical TCG look (`.anymon-card`)
- Type badge: faded red, bottom-right of art box
- Rarity stars: gold, top-left of white art box

**Coins:**

- Token: `text-anymon-coin` (`#EAB308` golden yellow)
- Border/shadow: `anymon-edgecoin` / `#A16207`

**Typography:**

- Global lowercase except `.preserve-case` elements
- Trainer name: Doto font, bold, dark faded red (`.trainer-name`)
- All sans-serif text is bold (`font-weight: 700` on body)

**Nav:**

- No "scan"/"deck" text labels — icons only
- Active tab icon rotates slightly (`-rotate-12`)
- Center Anymon logo between tabs

---

## 6. API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[...nextauth]` | * | NextAuth handlers |
| `/api/me` | GET | Current user profile |
| `/api/me/username` | POST | Set username |
| `/api/capture` | POST | Start capture pipeline |
| `/api/capture/status` | GET | Poll 3D generation status |
| `/api/anymon/list` | GET | All owned Anymons |
| `/api/anymon/nearby` | GET | Wild Anymons within radius |
| `/api/anymon/release` | POST | Deploy deck Anymon to roam |
| `/api/anymon/recall` | POST | Recall roaming Anymon to deck |
| `/api/anymon/heal` | POST | Spend coins to restore HP |
| `/api/anymon/notify` | POST | Acknowledge win/capture notification |
| `/api/anymon/autobattle` | POST | Background roaming skirmishes |
| `/api/battle/start` | POST | Start turn-based wild battle |
| `/api/battle` | POST | Resolve battle outcome |
| `/api/battle/cancel` | POST | Cancel/flee battle |
| `/api/presence` | POST | Update player geo + get nearby trainers |
| `/api/pvp/challenge` | POST | Challenge nearby trainer |
| `/api/pvp/respond` | POST | Accept/decline challenge |
| `/api/pvp/room` | GET | Poll PvP room state |
| `/api/pvp/move` | POST | Submit PvP move |
| `/api/pvp/cancel` | POST | Cancel PvP |
| `/api/seed` | POST | Seed wild Anymons for demo |
| `/api/glb` | GET | Proxy external GLB URLs (HF Space) |

All API routes use `export const runtime = "nodejs"` (required for ioredis).

---

## 7. Environment variables

Copy `.env.local.example` → `.env.local`. **Never commit `.env.local`.**

| Variable | Required | Notes |
|----------|----------|-------|
| `AUTH_SECRET` | Yes | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | For Google sign-in | Add Vercel redirect URI in Google Console |
| `ALLOW_GUEST` | Optional | `1` = guest button enabled |
| `ANTHROPIC_API_KEY` | For real AI | Claude Vision + battles |
| `GEMINI_API_KEY` | For real sprites | **Must start with `AIza`** — see blocker below |
| `GEMINI_IMAGE_MODEL` | Optional | Default `gemini-2.5-flash-image` |
| `MESHY_API_KEY` | For real 3D | Primary 3D provider |
| `MODEL_3D_PROVIDER` | Optional | `meshy` (recommended) \| `hfspace` \| `trellis` \| `mock` |
| `HF_TOKEN` | For hfspace | Hugging Face read token |
| `REDIS_URL` | **Required on Vercel** | `redis://` or `rediss://` |
| `MOCK_PIPELINE` | Optional | `1` = force placeholder art + sample GLBs |
| `AUTH_URL` / `NEXTAUTH_URL` | Production | Set to deployment URL |
| `AUTH_TRUST_HOST` | Vercel | `true` |

---

## 8. Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in keys
npx auth secret                     # writes AUTH_SECRET
npm run dev                         # http://localhost:3000
```

**Phone testing (camera + geolocation need HTTPS on iOS):**

```bash
ngrok http 3000
# Add https://<ngrok>.ngrok-free.app/api/auth/callback/google to Google Console
# Set AUTH_URL=https://<ngrok>.ngrok-free.app in .env.local
```

**Without ngrok/Vercel:** the app only works on the machine running `npm run dev`. Closing the terminal or stopping ngrok kills access from your phone.

**Validation:**

```bash
npx tsc --noEmit
npm run lint
```

Known lint warning (pre-existing): `app/page.tsx:43` — `player` in useEffect deps should be wrapped in useMemo.

---

## 9. Deployment (Vercel)

See **`DEPLOY.md`** for full instructions.

- Project linked: `vishs-projects-d2c8199a/anymon`
- Production: https://anymon.vercel.app
- `vercel.json` sets 60s maxDuration for API routes
- `trellis_server/` excluded via `.vercelignore`

### Required manual steps (still open)

1. **Provision Redis on Vercel** (Upstash via Marketplace):
   ```bash
   vercel integration add upstash/upstash-kv --plan free -m primaryRegion=iad1 -n anymon-redis
   ```
   Confirm `REDIS_URL` appears in `vercel env ls`, then redeploy.

2. **Google OAuth redirect URI** — add to Google Cloud Console:
   ```
   https://anymon.vercel.app/api/auth/callback/google
   ```

3. **Redeploy after env changes:**
   ```bash
   vercel deploy --prod
   ```

4. **Sync local `.env.local` keys to Vercel** if not already done (`vercel env pull` / `vercel env add`).

---

## 10. Known blockers & open issues

### 🔴 BLOCKER: Invalid Gemini API key

Local `.env.local` currently has `GEMINI_API_KEY` starting with `AQ.` — this is **not** a valid Google AI Studio key (valid keys start with `AIza`).

**Symptom:** Sprites fall back to black "?" placeholder; Meshy gets no raster image → 3D status = `failed`; Meshy dashboard shows $0 usage.

**Fix:** Create a key at https://aistudio.google.com/apikey, paste into `.env.local`, restart dev server. Also set on Vercel.

### 🟡 Gemini 429 rate limits

Even with a valid key, the free tier has very low image-generation RPM. `lib/gemini.ts` retries 4× with backoff. If still 429, enable billing on the Google Cloud project or wait for quota reset.

### 🟡 Redis not connected locally

`REDIS_URL` is commented out in `.env.local` due to prior Redis Cloud connection issues (ECONNRESET / IP lockout). App falls back to in-memory store — fine for solo local demo, **not** for multi-user or Vercel.

To reconnect: create a fresh Redis Cloud database, copy the exact connection string, uncomment `REDIS_URL`, restart.

### 🟡 README is stale

`README.md` still mentions passive coin farming and old terminology ("release"). Update it to match current roaming/deploy/heal economy.

### 🟡 Uncommitted local changes

```
modified: app/api/battle/cancel/route.ts
modified: scripts/test-redis-raw.mjs
modified: scripts/test-redis.mjs
```

Review before committing.

### 🟢 Needs on-device verification

These were implemented but should be tested on a real phone over HTTPS:

- AR pitch anchoring when tilting camera up/down (`ArScene.tsx` `CameraRig`)
- iOS `DeviceOrientationEvent.requestPermission()` flow
- Battle AR camera toggle + 3s action pacing + tap-to-skip
- Deck card drag-hover tilt on touch
- Deploy confirmation modal + recall + heal + "+$" notification effects
- PvP accept/decline screen styling

---

## 11. Recent session work (completed)

Large UI/backend overhaul across multiple agent passes:

**Backend / pipeline:**
- Fixed placeholder GLB bug (no silent sample model on failure)
- Terminal incubation states + 3-minute watchdog
- Gemini 429 retry + invalid key warnings
- Commonness-based rarity (harsh, phone = 1 star)
- Roaming economy overhaul (no passive farming, heal sink, notifications)
- Recall / heal / notify API endpoints
- Battle wording simplified (scientific, not flowery)

**UI:**
- Full retro design system (edge-colored y-only shadows, berry cards, cream backgrounds)
- Deck: gold stars, deploy confirm popup, recall, heal, captured alerts, drag-hover
- Scanner: AR overlays, corner radar with facing triangle, device orientation
- Battle: live camera AR + toggle, Pokedex-style moves, persistent weakness box, give-up button
- Sign-in: new copy, green accent, 75% logo, cream + dot background
- Username: "Trainer" prefix, flat ticket icon
- Incubating: cream background (no blue/green gradient)
- Bottom nav: Fluent SVG icons, no text labels, rotate on select

---

## 12. Suggested next tasks for Claude Code

Priority order:

1. **Fix `GEMINI_API_KEY`** — verify sprite + Meshy 3D end-to-end after a valid `AIza` key is set
2. **Provision Vercel Redis** — follow `DEPLOY.md`, redeploy, smoke-test capture → incubate → ready on production URL
3. **Add Google OAuth redirect URI** for `anymon.vercel.app`
4. **Update `README.md`** to reflect current gameplay (deploy/roam/heal, no passive farming)
5. **Fix `app/page.tsx` lint warning** — wrap `player` in `useMemo`
6. **On-device QA pass** — AR pitch, battle pacing, deck interactions
7. **Optional:** Replace nav SVG icons with actual Fluent Emoji PNGs from `microsoft/fluentui-emoji` if user wants exact Win11 look (currently using custom SVGs in `public/icons/`)
8. **Optional:** Add retry button on failed 3D generation in `IncubatingScreen`

---

## 13. Instructions for Claude Code

When working in this repo:

1. **Read before editing:** `lib/types.ts`, `lib/pipeline.ts`, and the component you're touching
2. **Match design rules:** y-only shadows, edge-colored outlines, no black shadows, cream backgrounds
3. **Don't commit secrets:** `.env.local` is gitignored; use `.env.local.example` for documentation
4. **Don't force-push main**
5. **Run `npx tsc --noEmit && npm run lint`** after substantive changes
6. **Server-side identity:** always derive user ID from session, never from client body
7. **3D provider:** production uses Meshy (`MODEL_3D_PROVIDER=meshy`); don't reintroduce sample GLB fallback on real failures
8. **Terminology:** "deploy" (not "release to wild"), "roaming" (not "farming/deployed")
9. **Mobile-first:** test assumptions against iPhone Safari constraints (HTTPS, orientation permission, no hover)
10. **Parallel edits:** `app/globals.css` + `tailwind.config.ts` affect the whole app — coordinate changes there carefully

### Key files by feature area

| Feature | Primary files |
|---------|---------------|
| Capture / 3D | `lib/pipeline.ts`, `lib/gemini.ts`, `lib/meshy.ts`, `app/api/capture/*` |
| Battles | `components/BattleScreen.tsx`, `app/api/battle/*`, `lib/claude.ts`, `lib/moves.ts` |
| PvP | `components/PvpBattleScreen.tsx`, `app/api/pvp/*`, `lib/pvp.ts` |
| Deck / economy | `components/DeckView.tsx`, `lib/economy.ts`, `app/api/anymon/*` |
| AR scanner | `components/ScannerView.tsx`, `components/ArScene.tsx` |
| Auth | `auth.ts`, `components/SignIn.tsx`, `app/api/me/*` |
| Store / geo | `lib/store.ts`, `lib/types.ts` |

---

## 14. Git state at handoff

- Branch: `main` (up to date with `origin/main`)
- Latest commit: `fe7f62b final cursor`
- Uncommitted: 3 files (see §10)

No commit was made during the latest agent session unless the user requested one separately.
