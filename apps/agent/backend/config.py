"""Centralised env config. Fails fast at startup if anything required is missing."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://graft:graft@localhost:5432/graft",
        alias="DATABASE_URL",
    )

    # Local inference
    vllm_port: int = Field(default=8001, alias="VLLM_PORT")
    vllm_gpu_util: float = Field(default=0.85, alias="VLLM_GPU_UTIL")

    # Model checkpoints
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
    force_model_source: str | None = Field(default=None, alias="FORCE_MODEL_SOURCE")

    # Watcher
    dep_poll_interval_minutes: int = Field(default=15, alias="DEP_POLL_INTERVAL_MINUTES")

    # Sandbox
    sandbox_cpu_count: int = Field(default=2, alias="SANDBOX_CPU_COUNT")
    sandbox_memory_mb: int = Field(default=2048, alias="SANDBOX_MEMORY_MB")
    sandbox_test_timeout_seconds: int = Field(default=120, alias="SANDBOX_TEST_TIMEOUT_SECONDS")

    # Optional, for training notebooks only
    hf_token: str | None = Field(default=None, alias="HF_TOKEN")

    # Agent
    agent_max_steps: int = Field(default=50, alias="AGENT_MAX_STEPS")

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
