# Deploying Anymon to Vercel

This app is a Next.js 14 App Router project. It is linked to the Vercel project
**`vishs-projects-d2c8199a/anymon`** and deploys to a permanent HTTPS URL — no
`ngrok` + local `npm run dev` required.

- **Production URL:** https://anymon.vercel.app
- **Git repo connected:** https://github.com/Vishvenugopal/BerkeleyAIHack2026

## What's already configured

- **`vercel.json`** — declares the Next.js framework and a default
  `maxDuration: 60` for all `app/api/**/*` functions (route-level
  `export const maxDuration` / `export const runtime = "nodejs"` still take
  precedence per route). `ioredis` needs the Node.js runtime, which every API
  route already declares.
- **`.vercelignore`** — excludes the Python `trellis_server/` (cannot run on
  Vercel; the app uses Meshy via `MODEL_3D_PROVIDER=meshy`) and local `scripts/`.
- **Environment variables** set on the project (Production / Preview /
  Development): `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MESHY_API_KEY`,
  `MODEL_3D_PROVIDER=meshy`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `ALLOW_GUEST=1`, `HF_TOKEN`, `MOCK_PIPELINE=0`,
  `AUTH_TRUST_HOST=true`. Production also has `AUTH_URL` / `NEXTAUTH_URL`
  = `https://anymon.vercel.app`.

## Required manual steps

### 1. Provision Redis (REQUIRED — state breaks without it)

On serverless, the in-memory store in `lib/store.ts` loses state between
invocations. Provision Upstash Redis (auto-injects `REDIS_URL`). First-time
install needs a one-time **browser** acceptance of marketplace terms:

1. Accept terms: https://vercel.com/vishs-projects-d2c8199a/~/integrations/accept-terms/upstash?source=cli
2. Then run:

   ```bash
   vercel integration add upstash/upstash-kv --plan free -m primaryRegion=iad1 -n anymon-redis
   ```

   This connects the resource to the project and injects `REDIS_URL`
   (`rediss://...`). Confirm with `vercel env ls` (look for `REDIS_URL`).

> Alternatively, set `REDIS_URL` manually from any managed Redis:
> `vercel env add REDIS_URL production --value "rediss://..." --yes`

### 2. Google OAuth redirect URI (REQUIRED for Google sign-in)

In Google Cloud Console → Credentials → your OAuth client → **Authorized
redirect URIs**, add:

```
https://anymon.vercel.app/api/auth/callback/google
```

Until then, use the guest button (`ALLOW_GUEST=1`) to sign in.

## Deploy commands

```bash
# Preview build (validate)
vercel deploy

# Production (run AFTER Redis is provisioned and all code changes have landed)
vercel deploy --prod
```

After provisioning Redis or changing any env var, **redeploy** so the new value
is picked up.
