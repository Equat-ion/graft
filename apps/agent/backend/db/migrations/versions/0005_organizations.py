"""organizations table

Revision ID: 0005_organizations
Revises: 0004_better_auth_tables
Create Date: 2026-05-03 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0005_organizations"
down_revision: str = "0004_better_auth_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS organization (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            slug VARCHAR NOT NULL UNIQUE,
            logo VARCHAR,
            metadata TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL,
            "updatedAt" TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS member (
            id VARCHAR PRIMARY KEY,
            "organizationId" VARCHAR NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
            "userId" VARCHAR NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            role VARCHAR NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS invitation (
            id VARCHAR PRIMARY KEY,
            "organizationId" VARCHAR NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
            email VARCHAR NOT NULL,
            role VARCHAR,
            status VARCHAR NOT NULL,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "inviterId" VARCHAR NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
        )
    """))


def downgrade() -> None:
    op.drop_table("invitation")
    op.drop_table("member")
    op.drop_table("organization")
