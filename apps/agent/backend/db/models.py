"""SQLAlchemy 2.0 async models for Graft."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Base(DeclarativeBase):
    pass


class Language(str, enum.Enum):
    python = "python"
    javascript = "javascript"
    typescript = "typescript"
    rust = "rust"


class Ecosystem(str, enum.Enum):
    pypi = "pypi"
    npm = "npm"
    crates = "crates"


class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"
    tamper_detected = "tamper_detected"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    repo_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    language: Mapped[Language] = mapped_column(
        Enum(Language, name="language_enum"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    github_connected: Mapped[bool] = mapped_column(default=False, nullable=False)
    github_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_access_token: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    github_repo_full_name: Mapped[str | None] = mapped_column(String(512), nullable=True)

    organization: Mapped["Organization | None"] = relationship(back_populates="projects")
    dependencies: Mapped[list["Dependency"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    runs: Mapped[list["AgentRun"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="select",
    )


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    members: Mapped[list["OrgMember"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    projects: Mapped[list[Project]] = relationship(
        back_populates="organization",
        lazy="selectin",
    )


class OrgMember(Base):
    __tablename__ = "org_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    organization: Mapped[Organization] = relationship(back_populates="members")


class Dependency(Base):
    __tablename__ = "dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    current_version: Mapped[str] = mapped_column(String(64), nullable=False)
    target_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ecosystem: Mapped[Ecosystem] = mapped_column(
        Enum(Ecosystem, name="ecosystem_enum"), nullable=False
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped[Project] = relationship(back_populates="dependencies")
    runs: Mapped[list["AgentRun"]] = relationship(
        back_populates="dependency",
        cascade="all, delete-orphan",
        lazy="select",
    )


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dependencies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status_enum"),
        nullable=False,
        default=RunStatus.pending,
        index=True,
    )
    steps: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    reward: Mapped[float | None] = mapped_column(Float, nullable=True)
    from_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    baseline_passed: Mapped[int | None] = mapped_column(nullable=True)
    baseline_failed: Mapped[int | None] = mapped_column(nullable=True)
    final_passed: Mapped[int | None] = mapped_column(nullable=True)
    final_failed: Mapped[int | None] = mapped_column(nullable=True)
    violation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped[Project] = relationship(back_populates="runs")
    dependency: Mapped[Dependency] = relationship(back_populates="runs")


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True)
    emailVerified: Mapped[bool] = mapped_column(nullable=False)
    image: Mapped[str | None] = mapped_column(String, nullable=True)
    linked_github_repos: Mapped[str | None] = mapped_column(String, nullable=True, default="[]")
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Session(Base):
    __tablename__ = "session"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(String, ForeignKey("user.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String, unique=True)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ipAddress: Mapped[str | None] = mapped_column(String, nullable=True)
    userAgent: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
