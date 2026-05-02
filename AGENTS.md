# AGENTS.md — Graft

> Instructions for AI agents working in this codebase.

## Repository layout

This is a monorepo managed with npm workspaces + Turborepo. The two primary apps are:

- **`apps/agent/`** — Python 3.11+ FastAPI backend with a LangGraph-based autonomous agent
- **`apps/web/`** — Next.js 15 TypeScript frontend (Tailwind CSS + shadcn/ui)

Training notebooks live in `training/`. Docker Compose orchestrates everything.

## Tech stack (strict — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript strict, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.11+, Pydantic v2, pydantic-settings |
| Agent framework | LangGraph `StateGraph` (not plain LangChain) |
| Database | PostgreSQL 16 via SQLAlchemy 2.0 async + Alembic |
| Sandbox | Docker SDK for Python |
| Dep watching | PyPI RSS/JSON + npm dist-tags REST, APScheduler |
| Inference | vLLM (OpenAI-compatible local server, port 8001) |
| Training | Jupyter, Transformers, TRL (SFT + GRPO) |

## Key architectural decisions

### All inference is local
The agent never calls external LLM APIs (no Anthropic, no OpenAI). All inference runs through a local vLLM server managed as a subprocess by `backend/agent/vllm_server.py`. The model served follows a checkpoint priority chain: GRPO → SFT → base.

### The sandbox is the source of truth
Reward is always computed from a **fresh Docker container** at `submit()`, never from the agent's own `run_tests()` observations. The sandbox also enforces tamper detection.

### Reward function is pure
`backend/agent/reward.py:compute_reward()` has no I/O, no side effects. It takes numbers in and returns a float out.

### Per-run context isolation
Agent sessions use Python's `ContextVar` (`backend/agent/session.py`) to isolate per-run state. The tool functions access the current workspace through `current_session()`.

## Coding conventions

### Python (backend)
- **Type annotations everywhere.** All functions have return type annotations.
- **No `pass` stubs or TODOs.** Every function must be implemented.
- **Async by default.** DB sessions, HTTP clients, and the scheduler are all async.
- **Pydantic v2** for all API schemas (`model_config = ConfigDict(from_attributes=True)`).
- **SQLAlchemy 2.0 style** with `Mapped[]` and `mapped_column()`.
- **Ruff** for linting (line-length 100, target Python 3.11).
- **No hardcoded secrets.** All credentials come from environment variables via `backend/config.py`.

### TypeScript (frontend)
- **Strict mode.** No `any` except where external libraries force it.
- **SWR** for data fetching. Poll active runs every 2 seconds.
- **shadcn/ui** for component primitives. Custom components in `components/`.
- **Typed API client** in `lib/api.ts` wrapping every backend endpoint.

### Database
- UUIDs as primary keys everywhere.
- Timestamps are always UTC with timezone.
- `AgentRun.steps` is a JSON column containing denormalised `StepRecord` objects.
- Cascade deletes from Project → Dependency → AgentRun.

## File-by-file guide

### Backend entry point
- `backend/main.py` — FastAPI app with lifespan that boots vLLM, starts the watcher scheduler, and starts the agent worker.

### API routes
- `backend/api/projects.py` — CRUD for watched projects (validates repo_path exists on disk).
- `backend/api/runs.py` — List/get/cancel agent runs. Supports filtering by `project_id` and `status`.
- `backend/api/deps.py` — List deps for a project, trigger an immediate dependency check.

### Agent
- `backend/agent/graph.py` — LangGraph `StateGraph` with nodes: `agent`, `tools`, `reward`, `violation`. Conditional routing based on tool calls, submission, or budget exhaustion.
- `backend/agent/tools.py` — Seven tools as `StructuredTool` objects. `edit_file` rejects edits to test paths. `submit` flags episode completion.
- `backend/agent/orchestrator.py` — Background asyncio worker that polls for pending `AgentRun` rows, claims them with `SELECT ... FOR UPDATE SKIP LOCKED`, and executes the LangGraph episode in a thread.
- `backend/agent/session.py` — `AgentSession` dataclass + `ContextVar` for thread-safe per-run isolation.
- `backend/agent/model_loader.py` — `resolve_model_path()` returns the best checkpoint and its source label.
- `backend/agent/vllm_server.py` — Manages vLLM as a child process. Handles LoRA loading for SFT/GRPO checkpoints.
- `backend/agent/prompts.py` — The system prompt that instructs the agent's workflow.
- `backend/agent/reward.py` — Pure function. Violation → -1.0. Otherwise reward based on test pass/fail deltas and step cost.

### Sandbox
- `backend/sandbox/runner.py` — `SandboxRunner` class. Snapshots repo, hashes tests/, runs baseline, executes in-loop tests, runs final evaluation in a fresh container, detects tampering (file hash diffs + AST skip marker counting).

### Watcher
- `backend/watcher/pypi.py` — Polls PyPI JSON API (fallback: RSS) for latest stable version.
- `backend/watcher/npm.py` — Polls npm dist-tags endpoint.
- `backend/watcher/scheduler.py` — `AsyncIOScheduler` on a configurable interval. Auto-creates `AgentRun` rows when upgrades are detected.

### Database
- `backend/db/models.py` — Three models: `Project`, `Dependency`, `AgentRun`. Three enums: `Language`, `Ecosystem`, `RunStatus`.
- `backend/db/schemas.py` — Pydantic v2 schemas for API I/O.
- `backend/db/session.py` — Async engine + session factory. FastAPI dependency yields sessions with auto-commit/rollback.

## Testing

```bash
cd apps/agent
pip install -e ".[dev]"
pytest
```

## Running locally

```bash
# Full stack
docker compose up --build

# Backend only
cd apps/agent && uvicorn backend.main:app --reload

# Frontend only
cd apps/web && npm run dev
```

## Environment variables

See `.env.example` at the repo root. All config is managed through `backend/config.py` using `pydantic-settings`. The `Settings` class fails fast if required values are missing.

## Common pitfalls

1. **vLLM requires a GPU.** Without one, set `FORCE_MODEL_SOURCE=base` and expect the vLLM boot to fail gracefully (the backend still starts but agent runs will error).
2. **Docker socket mount.** The backend container needs `/var/run/docker.sock` mounted to spawn sandbox containers.
3. **Test files are immutable.** Any agent edit to `tests/`, `test/`, `spec/`, `__tests__/`, or test config files triggers a tampering violation and reward = -1.0.
4. **Alembic migrations** are in `apps/agent/backend/db/migrations/`. Run `alembic upgrade head` before starting the backend for the first time.
