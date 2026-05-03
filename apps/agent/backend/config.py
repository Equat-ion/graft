"""Centralised env config. Fails fast at startup if anything required is missing."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# config.py lives at apps/agent/backend/config.py — go up 4 levels to repo root
_REPO_ROOT = Path(__file__).parent.parent.parent.parent
_ENV_FILE = _REPO_ROOT / ".env"

# Query-string params that asyncpg does not accept (libpq / psycopg2 only).
# asyncpg also maps "ssl" in the DSN to its internal sslmode parser, so we
# must strip it too and handle SSL purely via connect_args.
_ASYNCPG_UNSUPPORTED_PARAMS = {"sslmode", "ssl", "channel_binding"}

# sslmode values that mean "use SSL".
_SSL_MODES_REQUIRING_SSL = {"require", "verify-ca", "verify-full", "prefer"}


def _parse_asyncpg_url(raw_url: str) -> tuple[str, bool]:
    """Return (cleaned_url, needs_ssl) for an asyncpg DSN.

    Strips query-string params that asyncpg cannot handle and determines
    whether the original URL requested an SSL connection.
    """
    parts = urlsplit(raw_url)
    if not parts.query:
        return raw_url, False

    qs = parse_qs(parts.query, keep_blank_values=True)
    needs_ssl = any(
        v in _SSL_MODES_REQUIRING_SSL
        for v in qs.get("sslmode", [])
    )
    cleaned = {k: v for k, v in qs.items() if k not in _ASYNCPG_UNSUPPORTED_PARAMS}
    new_query = urlencode(cleaned, doseq=True)
    return urlunsplit(parts._replace(query=new_query)), needs_ssl


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Database (raw value from env; use database_url for connections)
    database_url_raw: str = Field(
        default="postgresql+asyncpg://graft:graft@localhost:5432/graft",
        alias="DATABASE_URL",
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        """Return a DATABASE_URL with asyncpg-incompatible params stripped."""
        url, _ = _parse_asyncpg_url(self.database_url_raw)
        return url

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_requires_ssl(self) -> bool:
        """Whether the original DATABASE_URL requested an SSL connection."""
        _, needs_ssl = _parse_asyncpg_url(self.database_url_raw)
        return needs_ssl

    # LLM — vLLM OpenAI-compatible server (falls back to any OpenAI-compatible endpoint)
    llm_base_url: str = Field(
        default="http://localhost:8001/v1",
        alias="LLM_BASE_URL",
    )
    llm_api_key: str = Field(
        default="",
        alias="LLM_API_KEY",
    )
    llm_model: str = Field(
        default="graft-agent",
        alias="LLM_MODEL",
    )
    llm_temperature: float = Field(default=0.2, alias="LLM_TEMPERATURE")
    llm_max_tokens: int = Field(default=2048, alias="LLM_MAX_TOKENS")

    # Local vLLM server (separate from agent's LLM_BASE_URL so both can coexist)
    vllm_base_url: str = Field(default="http://localhost:8001/v1", alias="VLLM_BASE_URL")
    vllm_model: str = Field(default="graft-agent", alias="VLLM_MODEL")
    # Set VLLM_AUTO_START=true to launch vLLM as a subprocess at startup.
    # Required on HF Spaces where inference and API share the same container.
    vllm_auto_start: bool = Field(default=False, alias="VLLM_AUTO_START")
    # Seconds to wait for vLLM to become healthy (model download on cold start can take >5 min).
    vllm_startup_timeout: int = Field(default=600, alias="VLLM_STARTUP_TIMEOUT")

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
        default="devaanshpa/Qwen2.5-Coder-3B-Instruct-Graft",
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

    # CORS — comma-separated list of allowed origins
    cors_origins_raw: str = Field(
        default="http://localhost:3000,http://localhost:3001",
        alias="CORS_ORIGINS",
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

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
