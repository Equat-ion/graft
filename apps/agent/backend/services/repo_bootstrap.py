"""Bootstrap a run workspace by cloning a GitHub repo and creating a run branch."""

from __future__ import annotations

import json
import logging
import re
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

_SAFE_BRANCH_RE = re.compile(r"[^A-Za-z0-9._/-]+")


@dataclass(slots=True)
class RepoBootstrapResult:
    repo_path: Path
    branch_name: str
    workspace_root: Path


def _sanitize_branch(name: str) -> str:
    cleaned = _SAFE_BRANCH_RE.sub("-", name).strip("-")
    cleaned = cleaned.replace("..", "-")
    return cleaned[:120] or "graft-run"


def _docker_available() -> bool:
    try:
        import docker  # noqa: F401
    except ImportError:
        return False
    try:
        import docker as _d

        client = _d.from_env()
        client.ping()
        return True
    except Exception:
        return False


def bootstrap_github_repo(
    *,
    repo_full_name: str,
    run_id: uuid.UUID,
    access_token: str | None,
    image: str = "alpine/git:2.47.2",
    timeout_seconds: int = 180,
) -> RepoBootstrapResult:
    """Clone a GitHub repo in Docker and create a run branch.

    Returns a host path to the checked-out repository plus the new branch name.
    """
    if not _docker_available():
        raise RuntimeError("Docker is required for repo bootstrap but is unavailable")

    try:
        import docker
    except ImportError as exc:
        raise RuntimeError("docker SDK not installed") from exc

    workspace_root = Path(tempfile.mkdtemp(prefix=f"graft-bootstrap-{run_id.hex[:8]}-"))
    target_repo = workspace_root / "repo"
    branch_name = _sanitize_branch(f"graft/{run_id}")
    remote_url = f"https://github.com/{repo_full_name}.git"
    escaped_repo = json.dumps(remote_url)
    escaped_branch = json.dumps(branch_name)
    if access_token:
        escaped_header = json.dumps(f"Authorization: Bearer {access_token}")
        clone_cmd = (
            "git "
            "-c http.https://github.com/.extraheader="
            f"{escaped_header} "
            f"clone --depth 1 {escaped_repo} /workspace/repo"
        )
    else:
        clone_cmd = f"git clone --depth 1 {escaped_repo} /workspace/repo"
    script = (
        "set -euo pipefail; "
        f"{clone_cmd}; "
        "cd /workspace/repo; "
        "git config user.name graft-bot; "
        "git config user.email graft-bot@local; "
        f"git checkout -b {escaped_branch}"
    )

    client = docker.from_env()
    try:
        client.images.get(image)
    except docker.errors.ImageNotFound:
        logger.info("Pulling bootstrap image %s", image)
        client.images.pull(image)

    container = client.containers.run(
        image=image,
        command=["sh", "-lc", script],
        volumes={str(workspace_root): {"bind": "/workspace", "mode": "rw"}},
        working_dir="/workspace",
        detach=True,
        auto_remove=False,
        network_mode="bridge",
        name=f"graft-bootstrap-{run_id.hex[:8]}",
        stdout=True,
        stderr=True,
    )
    try:
        wait_result = container.wait(timeout=timeout_seconds)
        status = int(wait_result.get("StatusCode", 1))
        logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
    except Exception:
        container.kill()
        logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        status = 1
    finally:
        try:
            container.remove(force=True)
        except Exception:
            pass

    if status != 0 or not target_repo.exists():
        shutil.rmtree(workspace_root, ignore_errors=True)
        raise RuntimeError(f"repo bootstrap failed for {repo_full_name}: {logs[:1200]}")

    return RepoBootstrapResult(
        repo_path=target_repo,
        branch_name=branch_name,
        workspace_root=workspace_root,
    )
