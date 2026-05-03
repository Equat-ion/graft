# Deployment Guide

Production deployment for Graft:

| Component | Platform | Purpose |
|-----------|----------|---------|
| Full stack | [Hugging Face Spaces](https://huggingface.co/spaces) (Docker, 1× L4) | Nginx + Next.js + FastAPI + vLLM + agent worker + watcher |
| Database | [Neon](https://neon.tech) | PostgreSQL (free tier) |

> [!NOTE]
> In the current deployment model, **everything runs in a single container** on HF Spaces. The root `Dockerfile` builds Next.js in a builder stage, then combines it with the Python backend. Nginx on port 7860 routes `/backend/*` to FastAPI (:8000) and everything else to Next.js (:3000).

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│  HF Spaces — 1× NVIDIA L4 (24 GB)                               │
│                                                                  │
│  ┌─────────────────┐                                             │
│  │  Nginx :7860    │                                             │
│  │  (public port)  │                                             │
│  └──────┬──────────┘                                             │
│         │                                                        │
│    /backend/*  ──► FastAPI :8000 (agent worker, dep watcher)     │
│    /*          ──► Next.js :3000 (dashboard, auth, webhooks)     │
│                                                                  │
│  ┌─────────────┐                                                 │
│  │ vLLM :8001  │ ◄── localhost only, not exposed                 │
│  │ graft-agent │                                                 │
│  └─────────────┘                                                 │
│                                                                  │
│  ┌──────────────┐                                                │
│  │ Neon PG      │ ◄── asyncpg+SSL (backend)                     │
│  │ (external)   │ ◄── @neondatabase/serverless (frontend)        │
│  └──────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
```

vLLM runs **inside the same container** on port 8001. Nginx is exposed on port 7860 (required by HF Spaces). The agent worker calls vLLM over localhost — no external LLM API is used.

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| Hugging Face account | [huggingface.co](https://huggingface.co) |
| Neon Postgres database | [neon.tech](https://neon.tech) (free tier) |
| GitHub App | GitHub → Settings → Developer settings → GitHub Apps |

---

## Step 1 — Neon Database

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the **pooled connection string** (hostname contains `-pooler`)
3. You need two variants:
   - **Backend** (asyncpg): `postgresql+asyncpg://user:pass@...neon.tech/dbname?sslmode=require`
   - **Frontend** (Neon serverless driver): `postgresql://user:pass@...neon.tech/dbname?sslmode=require`

> [!IMPORTANT]
> The backend strips `sslmode` / `channel_binding` from the URL and handles SSL via `connect_args`. You can paste the Neon URL as-is. The frontend uses `@neondatabase/serverless` which handles SSL natively.

---

## Step 2 — Deploy to Hugging Face Spaces

Everything — Nginx, Next.js, FastAPI, the agent worker, the dependency watcher, and vLLM — runs in a single Docker container on an L4 GPU Space.

### 2.1 Create the Space

1. Go to [huggingface.co/new-space](https://huggingface.co/new-space)
2. Configure:
   - **Space name**: `graft-backend`
   - **SDK**: **Docker**
   - **Visibility**: Private (recommended)
   - **Hardware**: **GPU: NVIDIA L4 · 24 GB** (required for vLLM)

### 2.2 Dockerfile

The root `Dockerfile` is a multi-stage build:

**Stage 1 — Web builder:**
- Base image: `node:20-slim`
- Runs `npm ci` + `npm run build` for the Next.js app
- Build-time `ARG`s bake in `NEXT_PUBLIC_*` env vars
- Sets `DATABASE_URL=postgresql://placeholder` so `neon()` doesn't crash at build time (the `db` module uses lazy initialisation via a Proxy)

**Stage 2 — Runtime:**
- Base image: `pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime` (Python 3.11 + CUDA 12.1)
- Installs system deps: `build-essential`, `git`, `nginx`, Node.js 20
- Installs the Python backend with `pip install -e .[inference]`
- Copies built Next.js artefacts from the builder stage
- Copies `deploy/nginx.conf` and `deploy/entrypoint.sh`
- Exposes port **7860** (HF Spaces requirement)

### 2.3 Entrypoint and services

The `deploy/entrypoint.sh` starts three processes:

1. **`alembic upgrade head`** — applies pending DB migrations
2. **Nginx** on :7860 — reverse proxy
3. **Next.js** on :3000 — `next start` (production server)
4. **FastAPI** on :8000 — `uvicorn backend.main:app`

FastAPI's lifespan hook then:
- Detects `VLLM_AUTO_START=true` and launches vLLM as a subprocess on :8001
- Starts the agent worker and dependency watcher once vLLM is healthy

### 2.4 Nginx routing

```
/backend/*  →  http://localhost:8000/  (prefix stripped)
/*          →  http://localhost:3000   (Next.js)
```

This means the frontend's `NEXT_PUBLIC_AGENT_URL` should be set to `https://<space-url>/backend` in production.

### 2.5 Push to the Space

**Option A — Git remote:**

```bash
# Add HF as a remote
git remote add hf https://huggingface.co/spaces/<your-user>/graft-backend

# Push
git push hf main
```

**Option B — GitHub Action (auto-deploy on push):**

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy to HF Spaces
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: JacobLinCool/hugging-face-sync@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          hf_token: ${{ secrets.HF_TOKEN }}
          space_id: ${{ secrets.HF_SPACE_ID }}
```

### 2.6 Environment variables (HF Spaces)

In the Space settings (Settings → Variables and secrets):

| Variable | Value | Type |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@...neon.tech/dbname?sslmode=require` | Secret |
| `VLLM_AUTO_START` | `true` | Variable |
| `LLM_BASE_URL` | `http://localhost:8001/v1` | Variable |
| `LLM_MODEL` | `graft-agent` | Variable |
| `LLM_API_KEY` | *(empty or set for external LLM)* | Secret |
| `TRAINING_BASE_MODEL` | `devaanshpa/Qwen2.5-Coder-3B-Instruct-Graft` | Variable |
| `CORS_ORIGINS` | `https://<space-url>,http://localhost:3000` | Variable |
| `HF_TOKEN` | Your HF read token (if model repo is private) | Secret |
| `BETTER_AUTH_SECRET` | Random 32+ char string | Secret |
| `BETTER_AUTH_URL` | `https://<space-url>` | Variable |
| `GITHUB_APP_ID` | GitHub App ID | Variable |
| `GITHUB_APP_CLIENT_ID` | GitHub App OAuth client ID | Secret |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App OAuth client secret | Secret |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | Secret |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | GitHub App slug | Variable |
| `DEP_POLL_INTERVAL_MINUTES` | `15` | Variable |
| `AGENT_MAX_STEPS` | `50` | Variable |
| `VLLM_GPU_UTIL` | `0.85` | Variable |
| `VLLM_STARTUP_TIMEOUT` | `900` | Variable |

> [!NOTE]
> `VLLM_STARTUP_TIMEOUT=900` gives 15 minutes for the first cold-start download. After the weights are cached you can lower this to `300`.

### 2.7 GitHub App callback URLs

GitHub App → Settings → Callback URL:
```
https://<space-url>/api/auth/callback/github
```

GitHub App → Settings → Webhook URL:
```
https://<space-url>/api/github/webhook
```

### 2.8 Verify

Once the Space shows **Running** (not Building or Sleeping):

```bash
# Health check
curl https://<space-url>/backend/health
# → {"status": "ok", "llm_model": "graft-agent", "llm_base_url": "http://localhost:8001/v1"}

# Swagger UI
https://<space-url>/backend/docs
```

---

## Post-deploy checklist

- [ ] Space hardware is set to **GPU: L4** (not CPU)
- [ ] `GET /backend/health` returns `200` with `llm_base_url: http://localhost:8001/v1`
- [ ] Space logs show `vLLM ready at http://localhost:8001/v1`
- [ ] Space logs show `Scheduler started`
- [ ] Frontend login page loads at the Space URL
- [ ] GitHub OAuth sign-in completes
- [ ] Create an organisation and project — dependency table populates
- [ ] "Check now" triggers an agent run that reaches `running` status
- [ ] Run detail page shows step trace updating in real time

---

## Environment variable reference

### All-in-one container (HF Spaces)

```env
# Database (backend — asyncpg)
DATABASE_URL=postgresql+asyncpg://user:pass@host-pooler.neon.tech/dbname?sslmode=require

# Inference — vLLM starts as a subprocess; these point to it
VLLM_AUTO_START=true
LLM_BASE_URL=http://localhost:8001/v1
LLM_API_KEY=
LLM_MODEL=graft-agent
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=2048
TRAINING_BASE_MODEL=devaanshpa/Qwen2.5-Coder-3B-Instruct-Graft

# vLLM tuning
VLLM_GPU_UTIL=0.85
VLLM_STARTUP_TIMEOUT=900

# HF Hub (set if model repo is private)
HF_TOKEN=hf_...

# CORS
CORS_ORIGINS=https://<space-url>,http://localhost:3000

# Watcher & sandbox
DEP_POLL_INTERVAL_MINUTES=15
AGENT_MAX_STEPS=50
SANDBOX_CPU_COUNT=2
SANDBOX_MEMORY_MB=2048
SANDBOX_TEST_TIMEOUT_SECONDS=120

# Auth (Next.js runtime)
BETTER_AUTH_SECRET=<random-32-chars>
BETTER_AUTH_URL=https://<space-url>

# GitHub App (Next.js runtime)
GITHUB_APP_ID=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...
NEXT_PUBLIC_GITHUB_APP_SLUG=...
```

---

## Troubleshooting

### Space stuck at "Building"

Large base image (`pytorch/pytorch`) takes 10–15 min to pull on first build. This is normal.

### Build fails with `neon()` connection string error

The Next.js builder stage needs `DATABASE_URL=postgresql://placeholder` set as a build-time env var (already configured in the root Dockerfile). The `db` module uses a Proxy-based lazy singleton so `neon()` is only called at request time, not at build time.

### `/health` returns 200 but agent runs immediately fail

vLLM is still loading. Check Space logs for `vLLM ready at http://localhost:8001/v1`. The worker only starts after vLLM is healthy, so this shouldn't happen in practice — but if you hit the `VLLM_STARTUP_TIMEOUT` before the model finishes loading, increase it.

### `VLLM_STARTUP_TIMEOUT` exceeded on first boot

The model download (~6 GB) timed out. Options:
- Increase `VLLM_STARTUP_TIMEOUT` to `1800` (30 min) for the first deploy
- After the first successful start the weights are in `/data/.hf_cache` and subsequent starts are fast (~2–3 min)

### vLLM OOM on L4

The L4 has 24 GB VRAM. The 3B model uses ~8 GB, leaving 16 GB for KV cache at `gpu_memory_utilization=0.85`. If you OOM:
- Lower `VLLM_GPU_UTIL` to `0.75`
- Set `VLLM_MAX_MODEL_LEN=2048` (the server reads this env var and passes it as `--max-model-len`)

### 401 on all API calls from frontend

- Verify `CORS_ORIGINS` includes the exact Space URL with `https://`
- `allow_credentials=True` is set in CORS middleware — ensure the frontend sends `credentials: "include"`

### Space sleeps (free tier)

Free GPU Spaces sleep after ~15 min of no traffic. Options:
1. Upgrade to a persistent Space (paid)
2. Ping `/backend/health` every 10 min with an external cron (e.g. [cron-job.org](https://cron-job.org))
3. Accept the ~3 min cold start on first request after sleep

### Neon connection errors

- Neon free tier suspends after 5 min idle; first request after suspension takes ~1–2 s — normal
- The backend auto-strips `sslmode` from the URL and uses SSL via `connect_args` — you don't need to modify the Neon URL
- `prepared_statement_cache_size=0` is set automatically for PgBouncer compatibility

---

## Local development

| Aspect | Local | Production |
|---|---|---|
| Frontend | `cd apps/web && npm run dev` on `:3000` | Same container via Next.js production server on `:3000` |
| Backend | `uvicorn backend.main:app --reload` on `:8000` | Same container on `:8000` |
| Proxy | N/A (direct access to :3000 and :8000) | Nginx on `:7860` |
| Inference | `vllm serve ...` on `:8001` separately | Same container, auto-started via `VLLM_AUTO_START=true` |
| `VLLM_AUTO_START` | `false` (default) | `true` |
| `LLM_BASE_URL` | `http://localhost:8001/v1` (default) | `http://localhost:8001/v1` |
| Database | Local Postgres or Neon | Neon |

### Docker Compose (local dev)

```bash
docker compose up --build
```

This starts four services:

| Service | Port | Purpose |
|---------|------|---------|
| `db` | 5433 | PostgreSQL 16 |
| `backend` | 8000 | FastAPI with hot-reload |
| `frontend` | 3000 | Next.js dev server |
| `jupyter` | 8888 | Training notebooks |

> [!NOTE]
> The local docker-compose uses the standalone agent Dockerfile (`apps/agent/Dockerfile`) and a simple frontend setup, not the production monolith Dockerfile at the repo root.
