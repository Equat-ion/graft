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
    op.add_column(
        "projects",
        sa.Column("github_connected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("projects", sa.Column("github_username", sa.String(length=255), nullable=True))
    op.add_column(
        "projects",
        sa.Column("github_access_token", sa.String(length=2048), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("github_repo_full_name", sa.String(length=512), nullable=True),
    )
    op.alter_column("projects", "github_connected", server_default=None)


def downgrade() -> None:
    op.drop_column("projects", "github_repo_full_name")
    op.drop_column("projects", "github_access_token")
    op.drop_column("projects", "github_username")
    op.drop_column("projects", "github_connected")
