# Deployment Guide

Production deployment for Graft:

| Component | Platform | Purpose |
|-----------|----------|---------|
| Backend + Inference | [Hugging Face Spaces](https://huggingface.co/spaces) (Docker, 1× L4) | FastAPI + vLLM + agent worker + watcher |
| Frontend | [Vercel](https://vercel.com) | Next.js 16 dashboard |
| Database | [Neon](https://neon.tech) | PostgreSQL (free tier) |

---

## Architecture overview

```
┌──────────────┐     HTTPS      ┌───────────────────────────────────────┐
│  Vercel CDN  │◄──────────────►│  HF Spaces — 1× NVIDIA L4 (24 GB)    │
│  (frontend)  │                │                                        │
└──────┬───────┘                │  ┌─────────────────┐  localhost:8001  │
       │ SSR / API routes       │  │  FastAPI :7860  │◄───────────────► │
       │ (Better Auth, DB)      │  │  agent worker   │  ┌─────────────┐ │
       │                        │  │  dep watcher    │  │ vLLM :8001  │ │
┌──────────────┐                │  └─────────────────┘  │ graft-agent │ │
│  Neon PG     │◄───────────────│         asyncpg+SSL   └─────────────┘ │
│  (database)  │                └───────────────────────────────────────┘
└──────────────┘
```

vLLM runs **inside the same container** on port 8001. FastAPI is exposed on port 7860 (required by HF Spaces). The agent worker calls vLLM over localhost — no external LLM API is used.

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| Hugging Face account | [huggingface.co](https://huggingface.co) |
| Vercel account | [vercel.com](https://vercel.com) |
| Neon Postgres database | [neon.tech](https://neon.tech) (free tier) |
| GitHub App | GitHub → Settings → Developer settings → GitHub Apps |

---

## Step 1 — Neon Database

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the **pooled connection string** (hostname contains `-pooler`)
3. You need two variants:
   - **Backend** (asyncpg): `postgresql+asyncpg://user:pass@...neon.tech/dbname?sslmode=require`
   - **Frontend** (pg/node): `postgresql://user:pass@...neon.tech/dbname?sslmode=require`

> [!IMPORTANT]
> The backend strips `sslmode` / `channel_binding` from the URL and handles SSL via `connect_args`. You can paste the Neon URL as-is.

---

## Step 2 — Backend + Inference on Hugging Face Spaces

Everything — FastAPI, the agent worker, the dependency watcher, and vLLM — runs in a single Docker container on an L4 GPU Space.

### 2.1 Create the Space

1. Go to [huggingface.co/new-space](https://huggingface.co/new-space)
2. Configure:
   - **Space name**: `graft-backend`
   - **SDK**: **Docker**
   - **Visibility**: Private (recommended)
   - **Hardware**: **GPU: NVIDIA L4 · 24 GB** (required for vLLM)

### 2.2 Dockerfile

The `apps/agent/Dockerfile` is already set up for this deployment. Key points:

- Base image: `pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime` (Python 3.11 + CUDA 12.1)
- Installs the app with `pip install -e .[inference]` which includes vLLM and PyTorch
- Exposes port **7860** (HF Spaces requirement)
- Sets `HF_HOME=/data/.hf_cache` so model weights are cached on the persistent `/data` volume across restarts

```dockerfile
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime
# ... see apps/agent/Dockerfile
EXPOSE 7860
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 7860"]
```

### 2.3 Startup sequence

When the container starts:

1. `alembic upgrade head` — applies any pending DB migrations
2. FastAPI starts on `:7860` — health endpoint immediately available
3. Lifespan hook detects `VLLM_AUTO_START=true` and launches vLLM as a subprocess on `:8001`
4. vLLM downloads `devaanshpa/Qwen2.5-Coder-3B-Instruct-Graft` (~6 GB, cached after first boot) and loads it into GPU memory
5. Agent worker and dependency watcher start once vLLM is healthy

**First cold start** takes 10–15 min (model download). Subsequent restarts take ~2–3 min (weights load from `/data/.hf_cache`).

### 2.4 Push to the Space

**Option A — Manual push (one-off):**

```bash
git clone https://huggingface.co/spaces/<your-user>/graft-backend
cp -r /path/to/graft/apps/agent/* graft-backend/
cd graft-backend
git add . && git commit -m "deploy" && git push
```

**Option B — GitHub Action (auto-deploy on push):**

```yaml
# .github/workflows/deploy-backend.yml
name: Deploy backend to HF Spaces
on:
  push:
    branches: [main]
    paths: [apps/agent/**]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: JacobLinCool/hugging-face-sync@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          hf_token: ${{ secrets.HF_TOKEN }}
          space_id: ${{ secrets.HF_SPACE_ID }}   # e.g. "youruser/graft-backend"
          subdirectory: apps/agent
```

### 2.5 Environment variables

In the Space settings (Settings → Variables and secrets):

| Variable | Value | Type |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@...neon.tech/dbname?sslmode=require` | Secret |
| `VLLM_AUTO_START` | `true` | Variable |
| `LLM_BASE_URL` | `http://localhost:8001/v1` | Variable |
| `LLM_MODEL` | `graft-agent` | Variable |
| `TRAINING_BASE_MODEL` | `devaanshpa/Qwen2.5-Coder-3B-Instruct-Graft` | Variable |
| `CORS_ORIGINS` | `https://<your-project>.vercel.app,http://localhost:3000` | Variable |
| `HF_TOKEN` | Your HF read token (if the model repo is private) | Secret |
| `DEP_POLL_INTERVAL_MINUTES` | `15` | Variable |
| `AGENT_MAX_STEPS` | `50` | Variable |
| `VLLM_GPU_UTIL` | `0.85` | Variable |
| `VLLM_STARTUP_TIMEOUT` | `900` | Variable |

> [!NOTE]
> `VLLM_STARTUP_TIMEOUT=900` gives 15 minutes for the first cold-start download. After the weights are cached you can lower this to `300`.

### 2.6 Verify

Once the Space shows **Running** (not Building or Sleeping):

```bash
# Health check
curl https://<user>-graft-backend.hf.space/health
# → {"status": "ok", "llm_model": "graft-agent", "llm_base_url": "http://localhost:8001/v1"}

# Swagger UI
https://<user>-graft-backend.hf.space/docs
```

---

## Step 3 — Frontend on Vercel

### 3.1 Import the project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Set **Root Directory** to `apps/web`

### 3.2 Environment variables

In Vercel → Project → Settings → Environment Variables:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_AGENT_URL` | `https://<user>-graft-backend.hf.space` | No trailing slash |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` | |
| `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` | |
| `BETTER_AUTH_SECRET` | Random 32+ char string | `openssl rand -base64 32` |
| `DATABASE_URL` | `postgresql://user:pass@...neon.tech/dbname?sslmode=require` | **`pg` driver, not `asyncpg`** |
| `GITHUB_APP_ID` | GitHub App ID | |
| `GITHUB_APP_CLIENT_ID` | GitHub App OAuth client ID | |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App OAuth client secret | |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | GitHub App slug | |

### 3.3 GitHub App callback URLs

GitHub App → Settings → Callback URL:
```
https://<your-project>.vercel.app/api/auth/callback/github
```

GitHub App → Settings → Setup URL (post-installation redirect):
```
https://<your-project>.vercel.app/api/github/callback
```

GitHub App → Settings → Webhook URL:
```
https://<your-project>.vercel.app/api/github/webhook
```

### 3.4 Deploy

Push to `main` — Vercel builds and deploys automatically.

---

## Post-deploy checklist

- [ ] Space hardware is set to **GPU: L4** (not CPU)
- [ ] `GET /health` returns `200` with `llm_base_url: http://localhost:8001/v1`
- [ ] Space logs show `vLLM ready at http://localhost:8001/v1`
- [ ] Space logs show `Scheduler started`
- [ ] Frontend login page loads
- [ ] GitHub OAuth sign-in completes
- [ ] Create an organisation and project — dependency table populates
- [ ] "Check now" triggers an agent run that reaches `running` status
- [ ] Run detail page shows step trace updating in real time

---

## Environment variable reference

### Backend (HF Spaces)

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host-pooler.neon.tech/dbname?sslmode=require

# Inference — vLLM starts as a subprocess; these point to it
VLLM_AUTO_START=true
LLM_BASE_URL=http://localhost:8001/v1
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
CORS_ORIGINS=https://<your-project>.vercel.app,http://localhost:3000

# Watcher & sandbox
DEP_POLL_INTERVAL_MINUTES=15
AGENT_MAX_STEPS=50
SANDBOX_CPU_COUNT=2
SANDBOX_MEMORY_MB=2048
SANDBOX_TEST_TIMEOUT_SECONDS=120
```

### Frontend (Vercel / apps/web/.env.local)

```env
NEXT_PUBLIC_AGENT_URL=https://<user>-graft-backend.hf.space
NEXT_PUBLIC_APP_URL=https://<your-project>.vercel.app
BETTER_AUTH_URL=https://<your-project>.vercel.app
BETTER_AUTH_SECRET=<random-32-chars>
DATABASE_URL=postgresql://user:pass@host-pooler.neon.tech/dbname?sslmode=require
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

### `/health` returns 200 but agent runs immediately fail

vLLM is still loading. Check Space logs for `vLLM ready at http://localhost:8001/v1`. The worker only starts after vLLM is healthy, so this shouldn't happen in practice — but if you hit the `VLLM_STARTUP_TIMEOUT` before the model finishes loading, increase it.

### `VLLM_STARTUP_TIMEOUT` exceeded on first boot

The model download (~6 GB) timed out. Options:
- Increase `VLLM_STARTUP_TIMEOUT` to `1800` (30 min) for the first deploy
- After the first successful start the weights are in `/data/.hf_cache` and subsequent starts are fast (~2–3 min)

### vLLM OOM on L4

The L4 has 24 GB VRAM. The 3B model uses ~8 GB, leaving 16 GB for KV cache at `gpu_memory_utilization=0.85`. If you OOM:
- Lower `VLLM_GPU_UTIL` to `0.75`
- Add `VLLM_MAX_MODEL_LEN=2048` (the server reads `VLLM_MAX_MODEL_LEN` and passes it as `--max-model-len`)

Actually, to support `VLLM_MAX_MODEL_LEN`, set it and it will be picked up because the server already reads `os.getenv("VLLM_MAX_MODEL_LEN")` — see `vllm_server.py`.

### 401 on all API calls from frontend

- Verify `CORS_ORIGINS` in HF Spaces includes the exact Vercel URL with `https://`
- `allow_credentials=True` is set in CORS middleware — ensure the frontend sends `credentials: "include"`

### Space sleeps (free tier)

Free GPU Spaces sleep after ~15 min of no traffic. Options:
1. Upgrade to a persistent Space (paid)
2. Ping `/health` every 10 min with an external cron (e.g. [cron-job.org](https://cron-job.org))
3. Accept the ~3 min cold start on first request after sleep

### Neon connection errors

- Neon free tier suspends after 5 min idle; first request after suspension takes ~1–2 s — normal
- Never remove `sslmode=require` from the Neon URL

---

## Local development

| Aspect | Local | Production |
|---|---|---|
| Frontend | `cd apps/web && npm run dev` on `:3000` | Vercel |
| Backend | `uvicorn backend.main:app --reload` on `:8000` | HF Spaces on `:7860` |
| Inference | `vllm serve ...` on `:8001` separately | Same container, auto-started via `VLLM_AUTO_START=true` |
| `VLLM_AUTO_START` | `false` (default) | `true` |
| `LLM_BASE_URL` | `http://localhost:8001/v1` (default) | `http://localhost:8001/v1` |
| Database | Local Postgres or Neon | Neon |
