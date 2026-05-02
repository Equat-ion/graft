# Deployment and Runtime Guide

This guide focuses on local docker-compose and the backend container. Production deployments should add secret management, image pinning, and stricter isolation.

## Local development with docker-compose

From the repo root:

```
docker compose up --build
```

This starts:

- Postgres on 5432
- Backend API on 8000
- vLLM server on 8001 (if GPU is available)
- Frontend on 3000
- Jupyter on 8888

## Backend container

The backend image installs the Python package in editable mode and runs uvicorn. The container expects access to the docker socket for sandbox runs:

- /var/run/docker.sock must be mounted
- The docker SDK must be available in the image

If docker is not available, the sandbox will fall back to local test execution inside the backend container. This is not recommended for production isolation.

## GPU usage

vLLM requires a GPU. To enable GPU access in docker-compose, uncomment the deploy.resources.devices section and ensure NVIDIA Container Toolkit is installed on the host.

If you are CPU only, set FORCE_MODEL_SOURCE=base and expect vLLM to fail to boot. The backend will still start, but agent runs will fail until vLLM is available.

## Checkpoints

Local checkpoints are mounted at /app/checkpoints by docker-compose. Set:

- SFT_CHECKPOINT_DIR=/app/checkpoints/sft
- GRPO_CHECKPOINT_DIR=/app/checkpoints/grpo

The model loader selects the newest batch_ directory in GRPO, then SFT, then the base model.

## Production hardening notes

- Run vLLM on a dedicated GPU node and point the backend to it.
- Pin docker images and base models.
- Use a managed Postgres instance and set DATABASE_URL accordingly.
- Do not mount the host docker socket unless you accept the security implications.
