"""merge diverged heads

Revision ID: 0003_merge_heads
Revises: 0002_project_github_fields, c3b0cede9aa9
Create Date: 2026-05-02 20:00:00.000000

"""

from __future__ import annotations

revision: str = "0003_merge_heads"
down_revision: tuple = ("0002_project_github_fields", "c3b0cede9aa9")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
