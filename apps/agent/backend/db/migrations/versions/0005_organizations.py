"""Add organizations table and org_id to projects.

Revision ID: 0005_organizations
Revises: c3b0cede9aa9
Create Date: 2026-05-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_organizations"
down_revision = "0004_better_auth_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS organizations (
            id UUID NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            owner_id VARCHAR(255) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations (slug)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_organizations_owner_id ON organizations (owner_id)"
    ))

    # Org membership table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS org_members (
            id UUID NOT NULL PRIMARY KEY,
            org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id VARCHAR(255) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            role VARCHAR(50) NOT NULL DEFAULT 'member',
            joined_at TIMESTAMPTZ NOT NULL
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_org_members_org_id ON org_members (org_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_org_members_user_id ON org_members (user_id)"
    ))

    # Add org_id to projects (nullable for now — existing projects have no org)
    conn.execute(sa.text(
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_projects_org_id ON projects (org_id)"
    ))


def downgrade() -> None:
    op.drop_index("ix_projects_org_id", "projects")
    op.drop_column("projects", "org_id")
    op.drop_table("org_members")
    op.drop_table("organizations")
