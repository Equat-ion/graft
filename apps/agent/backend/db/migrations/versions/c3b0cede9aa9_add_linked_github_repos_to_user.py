"""add_linked_github_repos_to_user

Revision ID: c3b0cede9aa9
Revises: a6371ba885b4
Create Date: 2026-05-02 18:34:04.455607

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c3b0cede9aa9'
down_revision: Union[str, None] = 'a6371ba885b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sync SQLAlchemy TEXT -> String (no-op in Postgres, TEXT and VARCHAR are equivalent)
    # The meaningful change here is the linked_github_repos column, already added by Better Auth CLI
    pass


def downgrade() -> None:
    pass
