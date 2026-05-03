# Environment Variables

This reference covers all environment variables read by the backend `Settings` class (`backend/config.py`) and the frontend runtime. All backend variables have defaults, but most deployments override at least `DATABASE_URL`.

## Loading and precedence

### Backend (Python)
- `Settings` loads from `.env` in the repo root via `pydantic-settings`.
- Process environment variables override `.env` values.
- Variable names are case insensitive.
- The `database_url` computed field strips asyncpg-incompatible params (`sslmode`, `ssl`, `channel_binding`) from the raw `DATABASE_URL`.

### Frontend (Next.js)
- Reads from `apps/web/.env.local` during development.
- `NEXT_PUBLIC_*` variables are baked into the client bundle at build time.
- Runtime-only variables (secrets) are only available in server-side code.

## Backend variables

| Variable | Default | Purpose | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://graft:graft@localhost:5432/graft` | Async SQLAlchemy connection string | `sslmode`/`channel_binding` are auto-stripped for asyncpg. |
| `LLM_BASE_URL` | `http://localhost:8001/v1` | OpenAI-compatible LLM endpoint | Points to local vLLM or any compatible API. |
| `LLM_API_KEY` | *(empty)* | API key for the LLM endpoint | Required for external providers (OpenAI, Together). Not needed for local vLLM. |
| `LLM_MODEL` | `graft-agent` | Model name to request | Must match the vLLM `--served-model-name`. |
| `LLM_TEMPERATURE` | `0.2` | Sampling temperature | Lower = more deterministic. |
| `LLM_MAX_TOKENS` | `2048` | Max tokens per LLM response | |
| `VLLM_BASE_URL` | `http://localhost:8001/v1` | vLLM server URL (internal) | Separate from `LLM_BASE_URL` so both can coexist. |
| `VLLM_MODEL` | `graft-agent` | vLLM served model name | |
| `VLLM_AUTO_START` | `false` | Auto-launch vLLM as subprocess | Set `true` on HF Spaces. |
| `VLLM_STARTUP_TIMEOUT` | `600` | Seconds to wait for vLLM health check | Increase to `900` for first cold-start. |
| `VLLM_PORT` | `8001` | vLLM server port | vLLM uses `/v1` for OpenAI-compatible API. |
| `VLLM_GPU_UTIL` | `0.85` | Fraction of GPU memory vLLM may use | Only used when vLLM is enabled. |
| `TRAINING_BASE_MODEL` | `devaanshpa/Qwen2.5-Coder-3B-Instruct-Graft` | Base model ID for vLLM | Used when no local checkpoints are available. |
| `SFT_CHECKPOINT_DIR` | `training/checkpoints/sft` | Path to SFT checkpoint | Used for LoRA if present. |
| `GRPO_CHECKPOINT_DIR` | `training/checkpoints/grpo` | Path to GRPO checkpoints | Latest `batch_*` directory is preferred. |
| `FORCE_MODEL_SOURCE` | *(empty)* | Force checkpoint source | Valid values: `base`, `sft`, `grpo`. |
| `DEP_POLL_INTERVAL_MINUTES` | `15` | Dependency watcher interval | APScheduler poll cadence. |
| `SANDBOX_CPU_COUNT` | `2` | CPU cores for sandbox container | Used by the Docker runner. |
| `SANDBOX_MEMORY_MB` | `2048` | Memory limit for sandbox container | Used by the Docker runner. |
| `SANDBOX_TEST_TIMEOUT_SECONDS` | `120` | Test run timeout | Applies to `run_tests` and final evaluation. |
| `AGENT_MAX_STEPS` | `50` | Maximum tool calls per run | Enforced in the state machine router. |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Comma-separated allowed CORS origins | Set to production URL in deployment. |
| `HF_TOKEN` | *(empty)* | HuggingFace token | For downloading gated models. |
| `GITHUB_CLIENT_ID` | *(empty)* | GitHub OAuth app client ID | Required to start backend OAuth flow. |
| `GITHUB_CLIENT_SECRET` | *(empty)* | GitHub OAuth app client secret | Required to exchange OAuth code for token. |
| `GITHUB_OAUTH_REDIRECT_URL` | `http://localhost:3000/oauth/github/callback` | OAuth callback URL | Must match your GitHub OAuth app config. |
| `GITHUB_OAUTH_SCOPES` | `repo,read:org` | OAuth scopes requested | Comma-separated GitHub scopes. |

## Frontend variables

| Variable | Purpose | Build-time? |
| --- | --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string (Drizzle ORM) | Runtime only |
| `BETTER_AUTH_SECRET` | Auth encryption secret (32+ chars) | Runtime only |
| `BETTER_AUTH_URL` | App base URL (e.g. `http://localhost:3000`) | Runtime only |
| `GITHUB_APP_ID` | GitHub App ID | Runtime only |
| `GITHUB_APP_CLIENT_ID` | GitHub App OAuth client ID | Runtime only |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App OAuth client secret | Runtime only |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook signature secret | Runtime only |
| `NEXT_PUBLIC_APP_URL` | Public app URL | ✅ Build-time |
| `NEXT_PUBLIC_AGENT_URL` | FastAPI backend URL (default: `http://localhost:8000`) | ✅ Build-time |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | GitHub App slug for install URL | ✅ Build-time |
| `NPM_HOOK_SECRET` | npm webhook HMAC signature secret | Runtime only |

## Docker Compose defaults

The `docker-compose.yml` file sets or overrides these values for the backend service:

- `DATABASE_URL` points at the compose Postgres service (port 5432 internal, 5433 external).
- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` are configurable from the host env.
- `DEP_POLL_INTERVAL_MINUTES` is set to `15`.
- `HF_TOKEN` is passed from the host env.

The compose file mounts `./apps/agent` to `/app` for hot-reload during development.

## Common scenarios

### CPU only (no GPU)

Set `FORCE_MODEL_SOURCE=base` so the backend does not try to load LoRA checkpoints. Either:
- Point `LLM_BASE_URL` at an external OpenAI-compatible API (e.g. OpenAI, Together, Ollama) and set `LLM_API_KEY`.
- Or leave `VLLM_AUTO_START=false` (default) — vLLM won't start and agent runs will fail, but the API and watcher still work.

### Using an external LLM instead of local vLLM

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
VLLM_AUTO_START=false
```

### Local checkpoints

Ensure the host has these directories:

- `training/checkpoints/sft`
- `training/checkpoints/grpo/batch_*`

Then run with the compose volume mount or bind them into the container at `/app/checkpoints`.

### Larger test suites

Increase `SANDBOX_TEST_TIMEOUT_SECONDS` and `SANDBOX_MEMORY_MB` if sandbox runs time out or crash under load.

### Neon database

The backend automatically:
- Strips `sslmode`, `ssl`, `channel_binding` from the DATABASE_URL (asyncpg can't handle them)
- Creates an SSL context via `connect_args` if `sslmode=require` was present
- Sets `prepared_statement_cache_size=0` for PgBouncer compatibility
- Uses `pool_recycle=300` since Neon drops idle connections
