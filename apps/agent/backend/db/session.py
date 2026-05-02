"""Async engine + session factory. One engine per process."""

from __future__ import annotations

import ssl as _ssl
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.config import get_settings

_settings = get_settings()

# asyncpg needs SSL passed via connect_args, not via the DSN query string.
# Neon's connection pooler (PgBouncer) requires prepared_statement_cache_size=0
# because PgBouncer in transaction mode doesn't support prepared statements.
_connect_args: dict = {"prepared_statement_cache_size": 0}
if _settings.database_requires_ssl:
    _connect_args["ssl"] = _ssl.create_default_context()

engine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,  # Recycle connections every 5 min (Neon may drop idle ones)
    connect_args=_connect_args,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
