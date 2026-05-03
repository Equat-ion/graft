"""Add github_installation_id and github_default_branch to projects

Revision ID: 0006_github_installation_field
Revises: 0005_organizations
Create Date: 2026-05-03 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0006_github_installation_field"
down_revision: str = "0005_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS github_installation_id VARCHAR(64),
            ADD COLUMN IF NOT EXISTS github_default_branch VARCHAR(255) DEFAULT 'main'
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        ALTER TABLE projects
            DROP COLUMN IF EXISTS github_installation_id,
            DROP COLUMN IF EXISTS github_default_branch
    """))
