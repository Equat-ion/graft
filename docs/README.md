# Graft Documentation

Detailed documentation for the Graft autonomous dependency upgrade agent.

## Contents

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System design, data model, component deep dives, sequence diagrams, security model |
| [API Reference](api.md) | Full REST API reference with request/response examples and error codes |
| [Training Pipeline](training.md) | Data mining → SFT → GRPO training pipeline, reward function, checkpoint management |
| [Environment Variables](environment.md) | Complete env var reference with defaults and docker-compose overrides |
| [Agent Tools](tools.md) | How tools are implemented, validated, and wired into the agent |
| [Sandbox Internals](sandbox.md) | Workspace isolation, test execution, and tampering detection |
| [Reward Function](reward.md) | Reward computation rules with examples |
| [LangGraph State Machine](state-machine.md) | State schema, routing logic, and step logging |
| [Deployment Guide](deployment.md) | Local docker-compose and runtime requirements |
| [Frontend Architecture](frontend.md) | Next.js app structure, data flow, and key components |

## Quick links

- **Root README** — [`../README.md`](../README.md) — project overview, quick start, tech stack
- **Agent guide** — [`../AGENTS.md`](../AGENTS.md) — instructions for AI agents working in this codebase
- **Backend README** — [`../apps/agent/README.md`](../apps/agent/README.md) — backend-specific setup
- **Frontend README** — [`../apps/web/README.md`](../apps/web/README.md) — frontend-specific setup
- **Environment config** — [`../.env.example`](../.env.example) — all configuration knobs with defaults
