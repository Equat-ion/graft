"""Centralised env config. Fails fast at startup if anything required is missing."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py lives at apps/agent/backend/config.py — go up 4 levels to repo root
_REPO_ROOT = Path(__file__).parent.parent.parent.parent
_ENV_FILE = _REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://graft:graft@localhost:5432/graft",
        alias="DATABASE_URL",
    )

    # LLM — any OpenAI-compatible endpoint
    llm_base_url: str = Field(
        default="https://api.openai.com/v1",
        alias="LLM_BASE_URL",
    )
    llm_api_key: str = Field(
        default="",
        alias="LLM_API_KEY",
    )
    llm_model: str = Field(
        default="gpt-4o-mini",
        alias="LLM_MODEL",
    )
    llm_temperature: float = Field(default=0.2, alias="LLM_TEMPERATURE")
    llm_max_tokens: int = Field(default=2048, alias="LLM_MAX_TOKENS")

    # Watcher
    dep_poll_interval_minutes: int = Field(default=15, alias="DEP_POLL_INTERVAL_MINUTES")

    # Sandbox
    sandbox_cpu_count: int = Field(default=2, alias="SANDBOX_CPU_COUNT")
    sandbox_memory_mb: int = Field(default=2048, alias="SANDBOX_MEMORY_MB")
    sandbox_test_timeout_seconds: int = Field(default=120, alias="SANDBOX_TEST_TIMEOUT_SECONDS")

    # Agent
    agent_max_steps: int = Field(default=50, alias="AGENT_MAX_STEPS")

    # Training notebooks only
    hf_token: str | None = Field(default=None, alias="HF_TOKEN")
    training_base_model: str = Field(
        default="Qwen/Qwen2.5-Coder-3B-Instruct",
        alias="TRAINING_BASE_MODEL",
    )
    sft_checkpoint_dir: Path = Field(
        default=Path("training/checkpoints/sft"),
        alias="SFT_CHECKPOINT_DIR",
    )
    grpo_checkpoint_dir: Path = Field(
        default=Path("training/checkpoints/grpo"),
        alias="GRPO_CHECKPOINT_DIR",
    )

    # GitHub OAuth
    github_client_id: str = Field(default="", alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(default="", alias="GITHUB_CLIENT_SECRET")
    github_oauth_redirect_url: str = Field(
        default="http://localhost:3000/oauth/github/callback",
        alias="GITHUB_OAUTH_REDIRECT_URL",
    )
    github_oauth_scopes: str = Field(default="repo,read:org", alias="GITHUB_OAUTH_SCOPES")


@lru_cache
def get_settings() -> Settings:
    return Settings()
