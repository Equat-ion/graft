# Deployment Guide

Production deployment for Graft: **Frontend on Vercel**, **Backend + Agent on Hugging Face Spaces**.

> [!NOTE]
> Both platforms have generous free tiers. The only paid dependency is a PostgreSQL database (Neon free tier works).

---

## Architecture overview

```
┌──────────────┐       HTTPS        ┌───────────────────────┐
│  Vercel CDN  │◄──────────────────►│  Browser (Next.js)    │
│  (frontend)  │                    └───────────┬───────────┘
└──────┬───────┘                                │
       │ SSR / API routes                       │ fetch w/ credentials
       │ (Better Auth, DB)                      │
       ▼                                        ▼
┌──────────────┐                    ┌───────────────────────┐
│  Neon PG     │◄──────────────────►│  HF Spaces (Docker)   │
│  (database)  │    asyncpg + SSL   │  FastAPI backend      │
└──────────────┘                    │  + LangGraph agent    │
                                    │  + Watcher scheduler  │
                                    └───────────────────────┘
```

| Component | Platform | URL pattern |
|-----------|----------|-------------|
| Frontend | Vercel | `https://<project>.vercel.app` |
| Backend API | HF Spaces (Docker) | `https://<user>-<space>.hf.space` |
| Database | Neon | `postgresql+asyncpg://...neon.tech/...` |

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| GitHub account | [github.com](https://github.com) |
| Vercel account | [vercel.com](https://vercel.com) (sign in with GitHub) |
| Hugging Face account | [huggingface.co](https://huggingface.co) |
| Neon Postgres database | [neon.tech](https://neon.tech) (free tier) |
| GitHub OAuth app | GitHub → Settings → Developer settings → OAuth Apps |
| Google OAuth credentials | [console.cloud.google.com](https://console.cloud.google.com) (optional) |

---

## Step 1 — Neon Database

If you don't already have one:

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the **pooled connection string** (the one with `-pooler` in the hostname)
3. You'll need **two** variants of this URL:
   - **Backend** (asyncpg): `postgresql+asyncpg://user:pass@...neon.tech/dbname?sslmode=require`
   - **Frontend** (pg/node): `postgresql://user:pass@...neon.tech/dbname?sslmode=require`

> [!IMPORTANT]
> The backend automatically strips `sslmode` / `channel_binding` from the URL and handles SSL via `connect_args` (asyncpg doesn't support libpq query params). You can paste the Neon URL as-is.

---

## Step 2 — Deploy Backend on Hugging Face Spaces

### 2.1 Create the Space

1. Go to [huggingface.co/new-space](https://huggingface.co/new-space)
2. Configure:
   - **Space name**: `graft-backend` (or similar)
   - **SDK**: **Docker**
   - **Visibility**: Private (recommended)
   - **Hardware**: CPU basic (free) — GPU only needed if running vLLM locally

### 2.2 Prepare the Dockerfile

HF Spaces expects the Dockerfile at the repo root. Create a `Dockerfile` in `apps/agent/` (already exists) or at the Space root:

```dockerfile
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# System deps for building Python packages
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY pyproject.toml README.md ./
RUN pip install --upgrade pip && pip install -e .

COPY . .

# Run Alembic migrations on startup, then launch uvicorn
# HF Spaces expects the app on port 7860
EXPOSE 7860

CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 7860"]
```

> [!WARNING]
> Hugging Face Spaces serves on **port 7860** by default. Make sure your `CMD` uses `--port 7860`, not 8000.

### 2.3 Push the code

You can either:

**Option A — Link a Git subdirectory (recommended):**

```bash
# Clone just the backend into the HF Space repo
cd graft-backend   # your HF Space local clone
cp -r /path/to/graft/apps/agent/* .
git add . && git commit -m "initial deploy" && git push
```

**Option B — Use a GitHub Action** to sync `apps/agent/` to the HF Space repo on push to `main`:

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy Backend to HF Spaces
on:
  push:
    branches: [main]
    paths: [apps/agent/**]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Push to HF Space
        uses: JacobLinCool/hugging-face-sync@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          hf_token: ${{ secrets.HF_TOKEN }}
          space_id: ${{ secrets.HF_SPACE_ID }}  # e.g. "youruser/graft-backend"
          subdirectory: apps/agent
```

### 2.4 Configure environment variables

In the HF Space settings (Settings → Variables and secrets), add:

| Variable | Value | Type |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@...neon.tech/dbname?sslmode=require` | Secret |
| `LLM_BASE_URL` | Your LLM endpoint (e.g. `https://api.openai.com/v1`) | Variable |
| `LLM_API_KEY` | Your LLM API key | Secret |
| `LLM_MODEL` | `gpt-4o-mini` or your model | Variable |
| `DEP_POLL_INTERVAL_MINUTES` | `15` | Variable |
| `AGENT_MAX_STEPS` | `50` | Variable |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | Secret |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | Secret |

> [!NOTE]
> HF Spaces injects env vars into the Docker container automatically. No `.env` file needed.

### 2.5 CORS configuration

Update `backend/main.py` to allow your Vercel domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://<your-project>.vercel.app",    # ← add this
        "https://your-custom-domain.com",        # ← if using a custom domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Alternatively, read origins from an env var for flexibility:

```python
import os

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then set `CORS_ORIGINS=https://your-app.vercel.app,http://localhost:3000` in HF Spaces.

### 2.6 Verify

Once the Space builds, check:

```
https://<user>-graft-backend.hf.space/health
https://<user>-graft-backend.hf.space/docs
```

---

## Step 3 — Deploy Frontend on Vercel

### 3.1 Import the project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)

### 3.2 Configure environment variables

In Vercel → Project Settings → Environment Variables, add:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<user>-graft-backend.hf.space` | Backend URL (no trailing slash) |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` | Frontend URL (for Better Auth client) |
| `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` | Better Auth server base URL |
| `BETTER_AUTH_SECRET` | Random 32+ char string | `openssl rand -base64 32` |
| `DATABASE_URL` | `postgresql://user:pass@...neon.tech/dbname?sslmode=require` | **Note: `pg` driver, NOT `asyncpg`** |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Optional |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | Same app as backend |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | Same app as backend |

> [!IMPORTANT]
> The frontend `DATABASE_URL` uses the **`postgresql://`** scheme (node `pg` driver), while the backend uses **`postgresql+asyncpg://`**. Both point to the same Neon database.

### 3.3 Update OAuth callback URLs

In your GitHub OAuth App settings, update the callback URL:

```
https://<your-project>.vercel.app/api/auth/callback/github
```

For Google OAuth, add to Authorized redirect URIs:

```
https://<your-project>.vercel.app/api/auth/callback/google
```

### 3.4 Install command override

Since the monorepo uses npm workspaces, you may need to override the install command in Vercel settings:

- **Install Command**: `npm install` (run from the root `apps/web`)

If Vercel can't resolve workspace dependencies, use:

```
npm install --prefix .
```

### 3.5 Deploy

Push to `main` or click "Deploy" in the Vercel dashboard. Vercel auto-deploys on every push.

---

## Step 4 — Post-deploy checklist

- [ ] Backend health check returns `200` at `/health`
- [ ] Swagger docs accessible at `/docs`
- [ ] Frontend loads the login page
- [ ] OAuth sign-in works (Google / GitHub)
- [ ] After login, projects list loads (no 401s)
- [ ] CORS allows cross-origin requests from Vercel → HF Spaces
- [ ] Watcher scheduler is running (check backend logs)

---

## Environment variable reference

### Backend (HF Spaces)

```env
# Required
DATABASE_URL=postgresql+asyncpg://user:pass@host/db?sslmode=require

# LLM
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# GitHub OAuth (for repo integration features)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Optional
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=2048
DEP_POLL_INTERVAL_MINUTES=15
AGENT_MAX_STEPS=50
SANDBOX_CPU_COUNT=2
SANDBOX_MEMORY_MB=2048
SANDBOX_TEST_TIMEOUT_SECONDS=120
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:3000
```

### Frontend (Vercel)

```env
# Required
NEXT_PUBLIC_API_URL=https://user-graft-backend.hf.space
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
BETTER_AUTH_URL=https://your-app.vercel.app
BETTER_AUTH_SECRET=<random-32-chars>
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# OAuth providers
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

---

## Troubleshooting

### HF Spaces build fails

- Check the build logs in the Space's "Logs" tab
- Ensure the `Dockerfile` is at the root of what you pushed (not nested in `apps/agent/`)
- If you get pip install errors, check that `pyproject.toml` and `README.md` are present

### 401 Unauthorized on all API calls

- Verify the `better-auth.session_token` cookie is being sent cross-origin
- Check that `CORS_ORIGINS` includes the exact Vercel URL (including `https://`)
- Ensure `allow_credentials=True` is set in CORSMiddleware

### Database connection errors

- Confirm the Neon DB isn't suspended (free tier suspends after 5 min idle)
- The backend auto-handles SSL for asyncpg via `connect_args` — don't remove the `sslmode` from the URL
- Connection pool recycling (`pool_recycle=300`) handles Neon dropping idle connections

### HF Space sleeps after inactivity

Free-tier HF Spaces sleep after ~15 minutes of inactivity. Options:

1. **Upgrade to a persistent Space** (paid)
2. **Use a cron job** to ping `/health` every 10 minutes
3. Accept the ~30s cold start on first request

### Cookie issues across domains

If the frontend (Vercel) and backend (HF Spaces) are on different domains, `SameSite=None; Secure` must be set on cookies. Better Auth handles this if `BETTER_AUTH_URL` is correctly configured. The backend session cookie used by `get_current_user` is set by the frontend's Better Auth, so cross-origin cookie sharing is only needed for the API calls (handled by `credentials: "include"` in fetch + CORS config).

---

## Local development vs Production

| Aspect | Local | Production |
|---|---|---|
| Frontend | `npm run dev` on `:3000` | Vercel |
| Backend | `uvicorn ... --reload` on `:8000` | HF Spaces Docker on `:7860` |
| Database | Local Postgres or Neon | Neon |
| OAuth callbacks | `http://localhost:3000/...` | `https://your-app.vercel.app/...` |
| CORS origins | `http://localhost:3000` | `https://your-app.vercel.app` |
| SSL | Not required locally | Required (Neon enforces it) |
