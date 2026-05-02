# Graft backend (`apps/agent`)

FastAPI + LangGraph service. Owns the agent state machine, dependency watcher, sandbox executor, and the local vLLM lifecycle.

## Layout

```
backend/
  api/        REST routers (projects, runs, deps)
  agent/      tools, graph, reward, model_loader, orchestrator, vllm_server
  sandbox/    Docker-backed test runner + tampering detection
  watcher/    PyPI/npm pollers + scheduler
  db/         SQLAlchemy 2.0 async models, Alembic migrations
  config.py   pydantic-settings env config
  main.py     FastAPI app + lifespan
```

## Run locally

```
pip install -e .
alembic upgrade head
uvicorn backend.main:app --reload
```

The lifespan handler will:

1. Boot vLLM as a child process serving the best available checkpoint
   (`GRPO_CHECKPOINT_DIR/batch_*` → `SFT_CHECKPOINT_DIR` → `TRAINING_BASE_MODEL`).
2. Start the APScheduler tick that polls PyPI / npm.
3. Start the agent worker that drains pending `AgentRun` rows.

## Tests

```
pytest
```
