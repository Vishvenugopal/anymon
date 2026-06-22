<img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/804/690/datas/original.png" width="25%"> <img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/804/689/datas/original.png" width="25%"> <img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/804/688/datas/original.png" width="25%">


### Made at Berkeley AI Hackathon 2026

# What it does
Anymon is an AR mobile game similar to Pokemon Go where players can "capture" any object they point their camera at! These objects (say, a water bottle), turn into monsters and gain their own unique moveset (e.g. a water bottle will have water related moves). Players battle their anymon against each other to earn rewards. Battles are decided by science! For example, if a water bottle anymon goes against a book anymon, the bottle anymon will have the advantage; subsequently, the game will explain the chemistry of how the water breaks down the book's chemical bonds.

Players will also have to choose their moves carefully in this game: when I was playtesting, I had a lot of fun deciding which moves will be most effective against other anymon, especially when they are both unique objects! The gameplay also borrows a lot of the gameplay loop and fun systems from the original Pokemon games, so it's actually a very engaging experience.

## **Other important gameplay features:**

- Anymon can be released into the wild to passively fight other anymon in the background. However, other nearby players can capture those anymon if they defeat it in a battle.
- More rare and unique real-life objects will create stronger anymon. This encourages players to go out, explore the world, and be curious!
- There's a fully functioning in-game economy to keep the game balanced. When your anymon takes damage, you will have to spend coins to heal it. You can gain coins by defeating other anymon.

# Inspiration
AI has been gaining stigma of ruining creativity, imagination, and learning. I wanted to make something that improves all 3, especially for kids. I also wanted to develop a game that was fun for myself to play, and that actually came out to be true, as I found myself enjoying this a lot!

# Challenges I ran into
This was a solo project so it was pretty difficult for me. I needed to feed camera data into an image generator, then feed that into a image to 3D model conversion AI. This seemed simple but this specific pipeline was throwing a lot of difficulties at me. But eventually, I fixed this. Another big issue is that I was planning on using Redis for multiplayer. However, I was having trouble setting it up, so my project was only functional on localhost now, but now I got it working on Vercel through Redis.

# Accomplishments that I'm proud of
I designed the visuals, style, UX, gameplay, etc. and I'm happy with it.

# Notes
Phone with browser is recommended for demo app

Reach out for questions: vishv@uw.edu

# Setup
## Prerequisites

- Node.js 20+ and npm.
- A browser with camera andpermissions. For phone demos, use HTTPS (Vercel or an
  HTTPS tunnel such as ngrok); mobile browsers usually block camera access on
  plain HTTP.

## Quick local demo (no paid AI keys)

The project can boot in demo mode with mock capture generation and a local
in-memory store.

```bash
npm install
cp .env.local.example .env.local
npx auth secret
npm run dev
```

Put the generated `AUTH_SECRET` into `.env.local`, keep `ALLOW_GUEST=1`, and
keep `MOCK_PIPELINE=1`. Then open `http://localhost:3000` and use "continue as
guest".

This mode uses placeholder/sample generation and stores data in memory, so data
resets when the dev server restarts and is not shared across machines.

## Full local setup

1. Copy the env template:

   ```bash
   cp .env.local.example .env.local
   ```

2. Set auth:

   - `AUTH_SECRET`: run `npx auth secret` and paste the generated value.
   - Easiest local sign-in: keep `ALLOW_GUEST=1`.
   - Google sign-in: create a Google OAuth "Web application" client in the
     [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
     then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
     Add these authorized redirect URIs as needed:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<your-ngrok-domain>/api/auth/callback/google`
     - `https://<your-production-domain>/api/auth/callback/google`

3. Choose generation mode:

   - Mock/demo: `MOCK_PIPELINE=1`
   - Real AI: set `MOCK_PIPELINE=0`, then add `ANTHROPIC_API_KEY`,
     `GEMINI_API_KEY`, and one 3D provider below.

4. Choose one 3D provider:

   - Meshy hosted API: set `MODEL_3D_PROVIDER=meshy` and `MESHY_API_KEY`.
   - Self-hosted TRELLIS: set `MODEL_3D_PROVIDER=trellis` and
     `TRELLIS_API_URL`. See `trellis_server/README.md`; this needs an NVIDIA GPU
     with CUDA, often via RunPod or another cloud GPU.
   - Hugging Face Space: set `MODEL_3D_PROVIDER=hfspace` and `HF_TOKEN`.
     This uses `microsoft/TRELLIS.2` by default and is best for local/self-hosted
     Node because the current implementation starts a background job after
     capture.

5. Optional but recommended for shared state/multiplayer:

   - Local single-machine testing can leave `REDIS_URL` empty.
   - Vercel, multiplayer, PvP, and reliable capture/status polling need Redis.
     Use a TCP URL such as `redis://...` or `rediss://...`; this app uses
     `ioredis`, not the Upstash REST URL/token pair.

6. Start the app:

   ```bash
   npm run dev
   ```

## Phone testing

For a real phone camera demo, run the dev server and expose it through HTTPS:

```bash
npm run dev
npx ngrok http 3000
```

Then set `AUTH_URL=https://<your-ngrok-domain>` in `.env.local` and add the
matching Google OAuth redirect URI if you are using Google sign-in. Restart the
dev server after changing env vars.

## Where to get the less-obvious API keys

- `ANTHROPIC_API_KEY`: create a Claude Console account, then generate a key from
  [Anthropic/Claude API key settings](https://platform.claude.com/settings/keys).
  The app uses Claude for object identification, rarity/name generation, moves,
  and battle explanations.
- `GEMINI_API_KEY`: create or view a Gemini API key in
  [Google AI Studio](https://aistudio.google.com/apikey). If your Google Cloud
  project does not appear, import it in AI Studio first. Image generation may
  require Google Cloud billing even if text Gemini calls work; a consumer Gemini
  subscription is separate from Gemini API billing.
- `MESHY_API_KEY`: sign in to Meshy, open
  [API settings](https://www.meshy.ai/settings/api), and create an API key.
  Meshy only shows the key once, so store it securely. For app demos without
  spending credits, prefer `MOCK_PIPELINE=1`.
- `HF_TOKEN`: create a Hugging Face user access token from
  [Settings -> Access Tokens](https://huggingface.co/settings/tokens). A read
  token is enough for the public TRELLIS Space path.
- `REDIS_URL`: for Vercel, install the
  [Upstash Redis integration](https://upstash.com/docs/redis/howto/vercelintegration)
  or create an Upstash Redis database and copy the Redis-compatible TLS
  connection string (`rediss://...`). Do not paste `UPSTASH_REDIS_REST_URL` into
  `REDIS_URL`.
- `TOKENCOMPANY_API_KEY`: optional. If absent, battle prompts are sent to Claude
  without compression.

Never commit `.env.local`; it is intentionally ignored by git.

