"""Per-run agent session — pinned via contextvar so tools can find the workspace.

The orchestrator constructs an AgentSession before invoking the graph and binds
it via `set_active_session(session)`. The tool functions read it back with
`current_session()`. This keeps the tool signatures clean (no need to thread
the workspace through every call) and avoids cross-run leakage thanks to
ContextVar's per-task isolation.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

from backend.sandbox.runner import SandboxRunner


@dataclass
class AgentSession:
    run_id: uuid.UUID
    workspace: Path
    language: str
    dep_name: str
    from_version: str
    to_version: str
    sandbox: SandboxRunner
    step_log: list[dict] = field(default_factory=list)
    on_step: object = None  # callable (step_record: dict) -> None, set by orchestrator


_active: ContextVar[AgentSession | None] = ContextVar("graft_active_session", default=None)


def set_active_session(session: AgentSession | None) -> None:
    _active.set(session)


def current_session() -> AgentSession:
    s = _active.get()
    if s is None:
        raise RuntimeError(
            "No active AgentSession bound. Tools must be invoked inside a Graft run."
        )
    return s
