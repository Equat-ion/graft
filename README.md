---
title: Graft
emoji: 🌿
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

<p align="center">
  <strong>🌿 Graft</strong><br>
  <em>Autonomous dependency upgrade agent — watches, patches, verifies</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-blue?logo=python&logoColor=white" alt="Python 3.11+" />
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/LangGraph-agent-green" alt="LangGraph" />
  <img src="https://img.shields.io/badge/inference-local%20vLLM-orange" alt="Local vLLM" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT" />
</p>

---

## What is Graft?

Graft is an autonomous AI agent that:

1. **Watches** your project's dependencies for new releases (PyPI, npm)
2. **Detects** breaking changes by reading changelogs and release notes
3. **Patches** your application code to handle API migrations
4. **Verifies** the result against your project's own test suite in a sandboxed Docker container
5. **Scores** every attempt with a deterministic reward signal — no frontier-model judge

All inference runs locally via [vLLM](https://github.com/vllm-project/vllm) serving a fine-tuned [Qwen 2.5 Coder 3B](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct) model. The training pipeline (SFT → GRPO) is included and fully reproducible from mined open-source git history.

---

## Architecture

```
graft/
├── apps/
│   ├── agent/              # FastAPI + LangGraph backend (Python 3.11+)
│   │   └── backend/
│   │       ├── api/        # REST routes: projects, runs, deps
│   │       ├── agent/      # LangGraph state machine, tools, model loader, vLLM
│   │       ├── sandbox/    # Docker-backed test runner + tampering detection
│   │       ├── watcher/    # PyPI/npm pollers (APScheduler)
│   │       └── db/         # SQLAlchemy 2.0 async models + Alembic migrations
│   └── web/                # Next.js 15 dashboard (TypeScript, Tailwind, shadcn/ui)
├── training/               # Jupyter notebooks: data mining → SFT → GRPO
├── docker-compose.yml      # Local dev: db, backend, frontend, jupyter
├── .env.example            # All configuration knobs
└── docs/                   # Detailed documentation
```

> See [`docs/architecture.md`](docs/architecture.md) for the full system design.

---

## Quick start

### Prerequisites

| Tool | Version |
|------|---------|
| Docker + Docker Compose | v2+ |
| NVIDIA GPU (optional) | For local vLLM inference |
| Node.js | 20+ (only if running frontend outside Docker) |
| Python | 3.11+ (only if running backend outside Docker) |

### 1. Clone and configure

```bash
git clone https://github.com/Equat-ion/graft.git
cd graft
cp .env.example .env
# Edit .env — defaults work for local dev
```

### 2. Launch everything

```bash
docker compose up --build
```

This starts four services:

| Service | URL | Purpose |
|---------|-----|---------|
| **Dashboard** | http://localhost:3000 | Next.js frontend |
| **API** | http://localhost:8000 | FastAPI backend + Swagger at `/docs` |
| **Jupyter** | http://localhost:8888 | Training notebooks |
| **PostgreSQL** | `localhost:5432` | Database |

### 3. Register a project

1. Open the dashboard at http://localhost:3000
2. Click **Register Project**
3. Enter the project name, path to the local clone, and language
4. Graft will start watching dependencies immediately

### Running without Docker

```bash
# Backend
cd apps/agent
pip install -e ".[dev]"
alembic upgrade head
uvicorn backend.main:app --reload

# Frontend (separate terminal)
cd apps/web
npm install
npm run dev
```

> **Note:** You need a running PostgreSQL instance and the `DATABASE_URL` env var set.

---

## How it works

### The upgrade loop

```mermaid
graph LR
    A[Watcher detects<br>new version] --> B[Create AgentRun<br>status: pending]
    B --> C[Worker claims run]
    C --> D[Snapshot repo +<br>baseline tests]
    D --> E[LangGraph agent<br>reads changelog → patches code]
    E --> F{submit()}
    F --> G[Fresh container<br>runs tests]
    G --> H[Compute reward]
    H --> I[Persist result]
```

1. **Watchers** poll PyPI RSS and npm dist-tags on a configurable interval
2. When a newer version is found, an **AgentRun** is queued
3. The **background worker** claims the run, snapshots the repo, and runs the baseline test suite
4. The **LangGraph agent** reads the changelog, greps for affected call sites, applies edits, and iterates against the test suite
5. On `submit()`, a **fresh Docker container** runs the authoritative evaluation
6. **Reward** is computed purely from test counts — no LLM judge

### Tampering detection

The sandbox detects and penalises any attempt to:
- Modify test files or directories (`tests/`, `test/`, `spec/`, `__tests__/`)
- Edit test configuration files (`pytest.ini`, `conftest.py`, etc.)
- Add `@pytest.mark.skip` or similar markers
- Modify `[tool.pytest.*]` sections in `pyproject.toml`

### Reward function

```
R = 1.0                        if all baseline-passing tests still pass
  + 0.05 × newly_passing       bonus for fixing previously-broken tests
  - 0.10 × regressions         penalty per test that newly fails
  - 0.01 × steps_taken         efficiency pressure
  = -1.0                       if any violation detected
```

---

## Agent tools

| Tool | Description |
|------|-------------|
| `read_file(path)` | Read a file from the workspace |
| `edit_file(path, old_str, new_str)` | Unique string replacement (rejects test edits) |
| `grep_repo(pattern, file_glob)` | Regex search across the workspace |
| `ast_query(language, query)` | Tree-sitter S-expression query |
| `read_changelog(dep, from, to)` | Fetch release notes between two versions |
| `run_tests(timeout)` | Observational test run in sandbox |
| `submit()` | Trigger authoritative final evaluation |

> See [`docs/api.md`](docs/api.md) for the full REST API reference.

---

## Model & inference

Graft uses a **checkpoint priority chain** for model selection:

| Priority | Source | Env var |
|----------|--------|---------|
| 1st | GRPO checkpoint (latest `batch_*/`) | `GRPO_CHECKPOINT_DIR` |
| 2nd | SFT checkpoint | `SFT_CHECKPOINT_DIR` |
| 3rd | Base model from HuggingFace Hub | `TRAINING_BASE_MODEL` |

Override with `FORCE_MODEL_SOURCE=base|sft|grpo`.

The selected model is served via vLLM as an OpenAI-compatible endpoint on port 8001. The agent communicates with it through `langchain-openai`'s `ChatOpenAI` client. **No external API calls are made at inference time.**

---

## Training pipeline

Three Jupyter notebooks in `training/`, each runnable top-to-bottom:

| Notebook | Purpose |
|----------|---------|
| `01_data_mining.ipynb` | Mine git history from 10 popular OSS repos to produce SFT training trajectories |
| `02_sft_warmup.ipynb` | Fine-tune Qwen 2.5 Coder 3B with LoRA on the mined trajectories |
| `03_grpo_training.ipynb` | RL fine-tuning with Group Relative Policy Optimisation (GRPO) using the Graft sandbox as the environment |

All training is local. The only data source for `01_data_mining.ipynb` is real human commits from public OSS repos.

> See [`docs/training.md`](docs/training.md) for details.

---

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example) for the complete reference:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://graft:graft@localhost:5432/graft` | Async database connection |
| `VLLM_PORT` | `8001` | vLLM OpenAI-compatible server port |
| `VLLM_GPU_UTIL` | `0.85` | GPU memory fraction for vLLM |
| `TRAINING_BASE_MODEL` | `Qwen/Qwen2.5-Coder-3B-Instruct` | Base model ID |
| `SFT_CHECKPOINT_DIR` | `training/checkpoints/sft` | SFT adapter weights |
| `GRPO_CHECKPOINT_DIR` | `training/checkpoints/grpo` | GRPO checkpoint batches |
| `FORCE_MODEL_SOURCE` | *(unset)* | Force `base`, `sft`, or `grpo` |
| `DEP_POLL_INTERVAL_MINUTES` | `15` | Watcher polling interval |
| `SANDBOX_CPU_COUNT` | `2` | CPU cores per sandbox container |
| `SANDBOX_MEMORY_MB` | `2048` | Memory limit per sandbox container |
| `SANDBOX_TEST_TIMEOUT_SECONDS` | `120` | Max test suite runtime |
| `AGENT_MAX_STEPS` | `50` | Tool call budget per episode |
| `HF_TOKEN` | *(unset)* | HuggingFace token (training only) |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, SWR |
| Backend | FastAPI, Python 3.11+, Pydantic v2, SQLAlchemy 2.0 async |
| Agent | LangGraph (StateGraph), LangChain tools |
| Database | PostgreSQL 16 via asyncpg + Alembic |
| Sandbox | Docker SDK for Python |
| Dep watching | PyPI RSS/JSON + npm dist-tags, APScheduler |
| Inference | vLLM (OpenAI-compatible, local) |
| Training | Jupyter, TRL (SFT + GRPO), LoRA, Transformers |
| Monorepo | npm workspaces + Turborepo |

---

## Project structure

```
.
├── apps/
│   ├── agent/                          # Python backend
│   │   ├── backend/
│   │   │   ├── __init__.py
│   │   │   ├── main.py                 # FastAPI app + lifespan
│   │   │   ├── config.py               # pydantic-settings env config
│   │   │   ├── api/
│   │   │   │   ├── projects.py         # CRUD for watched projects
│   │   │   │   ├── runs.py             # Query / cancel agent runs
│   │   │   │   └── deps.py             # List deps, trigger check
│   │   │   ├── agent/
│   │   │   │   ├── graph.py            # LangGraph StateGraph definition
│   │   │   │   ├── tools.py            # 7 agent tools (StructuredTool)
│   │   │   │   ├── reward.py           # Pure reward computation
│   │   │   │   ├── prompts.py          # System prompt
│   │   │   │   ├── session.py          # Per-run context (ContextVar)
│   │   │   │   ├── orchestrator.py     # Background worker loop
│   │   │   │   ├── model_loader.py     # Checkpoint priority chain
│   │   │   │   └── vllm_server.py      # vLLM subprocess lifecycle
│   │   │   ├── sandbox/
│   │   │   │   └── runner.py           # Docker sandbox + tampering detection
│   │   │   ├── watcher/
│   │   │   │   ├── pypi.py             # PyPI RSS/JSON poller
│   │   │   │   ├── npm.py              # npm dist-tags poller
│   │   │   │   └── scheduler.py        # APScheduler + upgrade triggers
│   │   │   └── db/
│   │   │       ├── models.py           # Project, Dependency, AgentRun
│   │   │       ├── schemas.py          # Pydantic v2 request/response models
│   │   │       ├── session.py          # Async engine + session factory
│   │   │       └── migrations/         # Alembic
│   │   ├── pyproject.toml
│   │   ├── alembic.ini
│   │   └── Dockerfile
│   └── web/                            # TypeScript frontend
│       ├── app/
│       │   ├── page.tsx                # Dashboard (summary cards + recent runs)
│       │   ├── projects/[id]/page.tsx  # Project detail + dep table
│       │   └── runs/[id]/page.tsx      # Run detail + step trace timeline
│       ├── components/
│       │   ├── StatusBadge.tsx
│       │   ├── RewardScore.tsx
│       │   ├── StepTrace.tsx
│       │   ├── VersionBadge.tsx
│       │   ├── RegisterProjectForm.tsx
│       │   └── ui/                     # shadcn/ui primitives
│       ├── lib/
│       │   ├── api.ts                  # Typed fetch wrappers
│       │   ├── types.ts                # Shared TypeScript interfaces
│       │   └── utils.ts                # cn() helper
│       └── package.json
├── training/
│   ├── 01_data_mining.ipynb
│   ├── 02_sft_warmup.ipynb
│   ├── 03_grpo_training.ipynb
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
└── docs/
    ├── architecture.md
    ├── api.md
    └── training.md
```

---

## License

MIT
