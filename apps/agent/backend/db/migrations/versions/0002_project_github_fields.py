"""add github fields to projects

Revision ID: 0002_project_github_fields
Revises: 0001_initial
Create Date: 2026-05-02 00:30:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0002_project_github_fields"
down_revision: str | None = "0001_initial"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_connected BOOLEAN NOT NULL DEFAULT FALSE"))
    conn.execute(sa.text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_username VARCHAR(255)"))
    conn.execute(sa.text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_access_token VARCHAR(2048)"))
    conn.execute(sa.text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_full_name VARCHAR(512)"))


def downgrade() -> None:
    op.drop_column("projects", "github_repo_full_name")
    op.drop_column("projects", "github_access_token")
    op.drop_column("projects", "github_username")
    op.drop_column("projects", "github_connected")
