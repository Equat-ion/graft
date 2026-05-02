# Environment Variables

This reference covers all environment variables read by the backend Settings class and documented in the repo .env.example. All variables have defaults, but most deployments override at least DATABASE_URL.

## Loading and precedence

- Settings loads from .env in the repo root.
- Process environment variables override .env values.
- Variable names are case insensitive.

## Variables

| Variable | Default | Purpose | Notes |
| --- | --- | --- | --- |
| DATABASE_URL | postgresql+asyncpg://graft:graft@localhost:5432/graft | Async SQLAlchemy connection string | Used by the FastAPI backend and worker. |
| VLLM_PORT | 8001 | vLLM server port | vLLM uses /v1 for OpenAI compatible API. |
| VLLM_GPU_UTIL | 0.85 | Fraction of GPU memory vLLM may use | Only used when vLLM is enabled. |
| TRAINING_BASE_MODEL | Qwen/Qwen2.5-Coder-3B-Instruct | Base model ID for vLLM | Used when no local checkpoints are selected. |
| SFT_CHECKPOINT_DIR | training/checkpoints/sft | Path to SFT checkpoint | Used for LoRA if present. |
| GRPO_CHECKPOINT_DIR | training/checkpoints/grpo | Path to GRPO checkpoints | Latest batch_ directory is preferred. |
| FORCE_MODEL_SOURCE | empty | Force checkpoint source | Valid values: base, sft, grpo. |
| DEP_POLL_INTERVAL_MINUTES | 15 | Dependency watcher interval | APScheduler poll cadence. |
| SANDBOX_CPU_COUNT | 2 | CPU cores for sandbox container | Used by the Docker runner. |
| SANDBOX_MEMORY_MB | 2048 | Memory limit for sandbox container | Used by the Docker runner. |
| SANDBOX_TEST_TIMEOUT_SECONDS | 120 | Test run timeout | Applies to run_tests and final evaluation. |
| AGENT_MAX_STEPS | 50 | Maximum tool calls per run | Enforced in the state machine router. |
| HF_TOKEN | empty | HuggingFace token | Only needed for notebooks or gated models. |

## Docker compose defaults

The docker-compose.yml file sets or overrides these values for the backend service:

- DATABASE_URL points at the compose Postgres service.
- VLLM_PORT is set to 8001.
- TRAINING_BASE_MODEL can be overridden by the host env.
- SFT_CHECKPOINT_DIR and GRPO_CHECKPOINT_DIR point to /app/checkpoints/*.
- DEP_POLL_INTERVAL_MINUTES and HF_TOKEN are set from the host env.

The compose file mounts ./training/checkpoints to /app/checkpoints so the backend can load local checkpoints.

## Common scenarios

### CPU only

Set FORCE_MODEL_SOURCE=base so the backend does not try to load LoRA checkpoints. vLLM will still start but may fail if no GPU is available.

### Local checkpoints

Ensure the host has these directories:

- training/checkpoints/sft
- training/checkpoints/grpo/batch_*

Then run with the compose volume mount or bind them into the container at /app/checkpoints.

### Larger test suites

Increase SANDBOX_TEST_TIMEOUT_SECONDS and SANDBOX_MEMORY_MB if sandbox runs time out or crash under load.
