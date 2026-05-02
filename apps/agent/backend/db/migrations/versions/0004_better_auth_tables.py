"""create Better Auth tables: user, session, account, verification

Revision ID: 0004_better_auth_tables
Revises: 0003_merge_heads
Create Date: 2026-05-02 20:30:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0004_better_auth_tables"
down_revision: str = "0003_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS "user" (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            email VARCHAR NOT NULL UNIQUE,
            "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
            image VARCHAR,
            linked_github_repos VARCHAR DEFAULT '[]',
            "createdAt" TIMESTAMPTZ NOT NULL,
            "updatedAt" TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS session (
            id VARCHAR PRIMARY KEY,
            "userId" VARCHAR NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            token VARCHAR NOT NULL UNIQUE,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "ipAddress" VARCHAR,
            "userAgent" VARCHAR,
            "createdAt" TIMESTAMPTZ NOT NULL,
            "updatedAt" TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS account (
            id VARCHAR PRIMARY KEY,
            "userId" VARCHAR NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            "accountId" VARCHAR NOT NULL,
            "providerId" VARCHAR NOT NULL,
            "accessToken" TEXT,
            "refreshToken" TEXT,
            "idToken" TEXT,
            "accessTokenExpiresAt" TIMESTAMPTZ,
            "refreshTokenExpiresAt" TIMESTAMPTZ,
            scope VARCHAR,
            password VARCHAR,
            "createdAt" TIMESTAMPTZ NOT NULL,
            "updatedAt" TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS verification (
            id VARCHAR PRIMARY KEY,
            identifier VARCHAR NOT NULL,
            value VARCHAR NOT NULL,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "createdAt" TIMESTAMPTZ,
            "updatedAt" TIMESTAMPTZ
        )
    """))


def downgrade() -> None:
    op.drop_table("verification")
    op.drop_table("account")
    op.drop_table("session")
    op.drop_table("user")
