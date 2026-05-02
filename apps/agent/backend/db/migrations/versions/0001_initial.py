"""initial schema: projects, dependencies, agent_runs

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-02 00:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    language_enum = sa.Enum(
        "python", "javascript", "typescript", "rust", name="language_enum"
    )
    ecosystem_enum = sa.Enum("pypi", "npm", "crates", name="ecosystem_enum")
    run_status_enum = sa.Enum(
        "pending", "running", "success", "failed", "tamper_detected",
        name="run_status_enum",
    )

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("repo_path", sa.String(2048), nullable=False),
        sa.Column("language", language_enum, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_projects_name", "projects", ["name"])

    op.create_table(
        "dependencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("current_version", sa.String(64), nullable=False),
        sa.Column("target_version", sa.String(64), nullable=True),
        sa.Column("ecosystem", ecosystem_enum, nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_dependencies_project_id", "dependencies", ["project_id"])
    op.create_index("ix_dependencies_name", "dependencies", ["name"])

    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "dependency_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dependencies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", run_status_enum, nullable=False),
        sa.Column("steps", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("reward", sa.Float(), nullable=True),
        sa.Column("from_version", sa.String(64), nullable=True),
        sa.Column("to_version", sa.String(64), nullable=True),
        sa.Column("baseline_passed", sa.Integer(), nullable=True),
        sa.Column("baseline_failed", sa.Integer(), nullable=True),
        sa.Column("final_passed", sa.Integer(), nullable=True),
        sa.Column("final_failed", sa.Integer(), nullable=True),
        sa.Column("violation", sa.String(255), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_agent_runs_project_id", "agent_runs", ["project_id"])
    op.create_index("ix_agent_runs_dependency_id", "agent_runs", ["dependency_id"])
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_agent_runs_status", table_name="agent_runs")
    op.drop_index("ix_agent_runs_dependency_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_project_id", table_name="agent_runs")
    op.drop_table("agent_runs")

    op.drop_index("ix_dependencies_name", table_name="dependencies")
    op.drop_index("ix_dependencies_project_id", table_name="dependencies")
    op.drop_table("dependencies")

    op.drop_index("ix_projects_name", table_name="projects")
    op.drop_table("projects")

    sa.Enum(name="run_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="ecosystem_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="language_enum").drop(op.get_bind(), checkfirst=True)
