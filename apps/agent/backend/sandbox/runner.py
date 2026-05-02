"""SandboxRunner: snapshots the repo, runs tests in Docker, detects tampering.

Usage from the orchestrator:

    runner = SandboxRunner(repo_path=..., language=...)
    runner.prepare()                           # snapshot + baseline test run
    # ... agent edits files inside runner.workspace ...
    final = runner.run_final_evaluation()      # fresh container, authoritative
    reward = compute_reward(...)
    runner.cleanup()

The sandbox is responsible for: workspace isolation, baseline test counts, in-loop
test executions (run_tests tool), tampering detection, and the final independent
evaluation that produces the reward signal.
"""

from __future__ import annotations

import ast as _ast
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Files outside `tests/` that influence which tests run.
_TEST_CONFIG_FILES = (
    "pytest.ini",
    "conftest.py",
    "tox.ini",
    ".coveragerc",
    "setup.cfg",
    "pyproject.toml",
    "jest.config.js",
    "jest.config.ts",
    "jest.config.mjs",
    "vitest.config.ts",
    "vitest.config.js",
    "package.json",
)

_TEST_DIR_NAMES = ("tests", "test", "spec", "__tests__")


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _hash_tree(root: Path, dir_names: tuple[str, ...]) -> dict[str, str]:
    out: dict[str, str] = {}
    for name in dir_names:
        d = root / name
        if not d.exists():
            continue
        for path in d.rglob("*"):
            if path.is_file():
                rel = path.relative_to(root).as_posix()
                # Pytest creates __pycache__/*.pyc during test runs — not tampering
                if "__pycache__" in rel or rel.endswith(".pyc"):
                    continue
                out[rel] = _sha256_file(path)
    return out


def _hash_files(root: Path, names: tuple[str, ...]) -> dict[str, str]:
    return {n: _sha256_file(root / n) for n in names if (root / n).is_file()}


def _count_skip_markers_python(root: Path) -> int:
    """Count @pytest.mark.skip / pytest.skip() / xfail / skipif markers across tests/."""
    count = 0
    skip_words = ("skip", "skipif", "xfail")
    for name in _TEST_DIR_NAMES:
        d = root / name
        if not d.exists():
            continue
        for path in d.rglob("*.py"):
            try:
                tree = _ast.parse(path.read_text(encoding="utf-8", errors="replace"))
            except SyntaxError:
                continue
            for node in _ast.walk(tree):
                if isinstance(node, _ast.Attribute) and node.attr in skip_words:
                    count += 1
                elif isinstance(node, _ast.Name) and node.id in skip_words:
                    count += 1
                elif isinstance(node, _ast.Call):
                    func = node.func
                    name_node = (
                        func.attr if isinstance(func, _ast.Attribute)
                        else getattr(func, "id", "")
                    )
                    if name_node in skip_words:
                        count += 1
    return count


@dataclass
class TestResult:
    passed: int = 0
    failed: int = 0
    errors: int = 0
    tracebacks: list[str] = field(default_factory=list)
    raw_stdout: str = ""
    timed_out: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "failed": self.failed,
            "errors": self.errors,
            "tracebacks": self.tracebacks[:5],
            "timed_out": self.timed_out,
        }


# Regexes for parsing pytest output (works on -q and default).
_PYTEST_SUMMARY = re.compile(
    r"(?:^|\s)(?:=+ )?(?P<failed>\d+)\s+failed.*?(?P<passed>\d+)\s+passed",
    re.IGNORECASE,
)
_PYTEST_PASSED_ONLY = re.compile(r"(?P<passed>\d+)\s+passed", re.IGNORECASE)
_PYTEST_FAILED = re.compile(r"(?P<failed>\d+)\s+failed", re.IGNORECASE)
_PYTEST_ERRORS = re.compile(r"(?P<errors>\d+)\s+error", re.IGNORECASE)
_JEST_SUMMARY = re.compile(
    r"Tests:\s+(?:(?P<failed>\d+)\s+failed,\s+)?(?P<passed>\d+)\s+passed", re.IGNORECASE
)


def parse_pytest_output(text: str) -> TestResult:
    res = TestResult(raw_stdout=text)
    if m := _PYTEST_SUMMARY.search(text):
        res.passed = int(m.group("passed"))
        res.failed = int(m.group("failed"))
    elif m := _PYTEST_PASSED_ONLY.search(text):
        res.passed = int(m.group("passed"))
    if m := _PYTEST_FAILED.search(text):
        res.failed = int(m.group("failed"))
    if m := _PYTEST_ERRORS.search(text):
        res.errors = int(m.group("errors"))

    tb_blocks: list[str] = []
    in_tb = False
    cur: list[str] = []
    for line in text.splitlines():
        if line.startswith("_______") and "test" in line.lower():
            if cur:
                tb_blocks.append("\n".join(cur).strip())
            cur = [line]
            in_tb = True
        elif in_tb:
            if line.startswith("=") and "passed" in line:
                if cur:
                    tb_blocks.append("\n".join(cur).strip())
                cur = []
                in_tb = False
            else:
                cur.append(line)
    if cur:
        tb_blocks.append("\n".join(cur).strip())
    res.tracebacks = [b for b in tb_blocks if b][:10]
    return res


def parse_jest_output(text: str) -> TestResult:
    res = TestResult(raw_stdout=text)
    if m := _JEST_SUMMARY.search(text):
        res.passed = int(m.group("passed"))
        res.failed = int(m.group("failed") or 0)
    return res


class SandboxRunner:
    """One sandbox per agent run. Owns a workspace dir + integrity baseline."""

    def __init__(
        self,
        *,
        repo_path: Path,
        language: str,
        cpu_count: int = 2,
        memory_mb: int = 2048,
        test_timeout_seconds: int = 120,
        use_docker: bool | None = None,
    ) -> None:
        self.repo_path = repo_path
        self.language = language
        self.cpu_count = cpu_count
        self.memory_mb = memory_mb
        self.test_timeout_seconds = test_timeout_seconds
        self.use_docker = use_docker if use_docker is not None else self._docker_available()

        self.workspace: Path = Path(tempfile.mkdtemp(prefix=f"graft-ws-{uuid.uuid4().hex[:8]}-"))
        self._baseline: TestResult | None = None
        self._test_hashes: dict[str, str] = {}
        self._config_hashes: dict[str, str] = {}
        self._skip_marker_count: int = 0
        self.violation: str | None = None
        self.submitted: bool = False

    @staticmethod
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

    # ---------- lifecycle ----------

    def prepare(self) -> TestResult:
        """Snapshot repo into workspace, hash test invariants, run baseline."""
        if not self.repo_path.exists():
            raise FileNotFoundError(f"repo_path does not exist: {self.repo_path}")

        if self.workspace.exists():
            shutil.rmtree(self.workspace)
        shutil.copytree(
            self.repo_path,
            self.workspace,
            ignore=shutil.ignore_patterns(
                ".git", "__pycache__", ".venv", "venv", "node_modules",
                ".next", ".pytest_cache", ".mypy_cache", "dist", "build",
            ),
        )

        self._test_hashes = _hash_tree(self.workspace, _TEST_DIR_NAMES)
        self._config_hashes = _hash_files(self.workspace, _TEST_CONFIG_FILES)
        if self.language == "python":
            self._skip_marker_count = _count_skip_markers_python(self.workspace)

        self._baseline = self._run_tests(timeout_seconds=self.test_timeout_seconds)
        logger.info(
            "Baseline tests: passed=%d failed=%d errors=%d",
            self._baseline.passed, self._baseline.failed, self._baseline.errors,
        )
        return self._baseline

    def cleanup(self) -> None:
        if self.workspace.exists():
            shutil.rmtree(self.workspace, ignore_errors=True)

    # ---------- agent-facing API ----------

    def run_tests(self, *, timeout_seconds: int = 120) -> dict[str, Any]:
        """Observational test run for the agent's run_tests tool."""
        self._check_tampering()
        if self.violation:
            return {
                "passed": 0, "failed": 0, "errors": 0,
                "tracebacks": [f"VIOLATION: {self.violation}"], "timed_out": False,
            }
        result = self._run_tests(timeout_seconds=timeout_seconds)
        return result.to_dict()

    def mark_submitted(self) -> None:
        self.submitted = True

    def flag_violation(self, reason: str) -> None:
        if not self.violation:
            self.violation = reason
            logger.warning("Violation flagged: %s", reason)

    def baseline(self) -> TestResult:
        if self._baseline is None:
            raise RuntimeError("prepare() not called")
        return self._baseline

    # ---------- final evaluation ----------

    def run_final_evaluation(self) -> tuple[TestResult, str | None]:
        """Authoritative final test run. Restores tests/ from snapshot first."""
        self._check_tampering(strict=True)
        if self.violation:
            return TestResult(), self.violation
        self._restore_test_invariants()
        result = self._run_tests(
            timeout_seconds=self.test_timeout_seconds, fresh_container=True
        )
        return result, None

    # ---------- internals ----------

    def _check_tampering(self, strict: bool = False) -> None:
        if self.violation:
            return
        cur_tests = _hash_tree(self.workspace, _TEST_DIR_NAMES)
        if cur_tests != self._test_hashes:
            diff = sorted(set(cur_tests) ^ set(self._test_hashes))[:5]
            mod = [k for k in cur_tests if cur_tests.get(k) != self._test_hashes.get(k)][:5]
            self.flag_violation(
                f"test files modified (added/removed: {diff}, modified: {mod})"
            )
            return
        cur_cfg = _hash_files(self.workspace, _TEST_CONFIG_FILES)
        if cur_cfg != self._config_hashes:
            modified = [k for k in cur_cfg if cur_cfg.get(k) != self._config_hashes.get(k)]
            for n in modified:
                if n == "pyproject.toml" and not strict:
                    if not self._pyproject_test_section_changed(n):
                        continue
                self.flag_violation(f"test config file modified: {n}")
                return
        if self.language == "python":
            new_skips = _count_skip_markers_python(self.workspace)
            if new_skips > self._skip_marker_count:
                self.flag_violation(
                    f"new skip markers introduced ({self._skip_marker_count} -> {new_skips})"
                )

    def _pyproject_test_section_changed(self, name: str) -> bool:
        """Conservative check: only flag pyproject.toml if a [tool.pytest*] table changed."""
        try:
            current = (self.workspace / name).read_text(encoding="utf-8")
            original = (self.repo_path / name).read_text(encoding="utf-8")
        except OSError:
            return True

        def _extract(text: str) -> str:
            keep, in_section = [], False
            for line in text.splitlines():
                stripped = line.strip()
                if stripped.startswith("["):
                    in_section = stripped.startswith("[tool.pytest")
                if in_section:
                    keep.append(line)
            return "\n".join(keep)

        return _extract(current) != _extract(original)

    def _restore_test_invariants(self) -> None:
        """Wipe agent-touched test files and config; copy originals back in."""
        for name in _TEST_DIR_NAMES:
            target = self.workspace / name
            source = self.repo_path / name
            if source.exists():
                if target.exists():
                    shutil.rmtree(target, ignore_errors=True)
                shutil.copytree(source, target)
        for name in _TEST_CONFIG_FILES:
            source = self.repo_path / name
            target = self.workspace / name
            if source.is_file():
                shutil.copy2(source, target)

    def _detect_test_command(self) -> list[str]:
        if self.language == "python":
            return ["pytest", "-q", "--no-header", "--tb=short"]
        if self.language in ("javascript", "typescript"):
            pkg = self.workspace / "package.json"
            if pkg.exists():
                try:
                    data = json.loads(pkg.read_text(encoding="utf-8"))
                    if "test" in (data.get("scripts") or {}):
                        return ["npm", "test", "--silent", "--", "--ci"]
                except json.JSONDecodeError:
                    pass
            return ["npx", "--yes", "jest", "--ci"]
        if self.language == "rust":
            return ["cargo", "test", "--quiet"]
        raise RuntimeError(f"No default test command for language {self.language}")

    def _docker_image(self) -> str:
        return {
            "python": "python:3.11-slim",
            "javascript": "node:20-slim",
            "typescript": "node:20-slim",
            "rust": "rust:1-slim",
        }.get(self.language, "python:3.11-slim")

    def _bootstrap_command(self) -> str:
        if self.language == "python":
            installs = []
            for marker, cmd in (
                ("pyproject.toml", "pip install -q -e .[test] 2>/dev/null || pip install -q -e . 2>/dev/null || true"),
                ("requirements.txt", "pip install -q -r requirements.txt 2>/dev/null || true"),
                ("requirements-dev.txt", "pip install -q -r requirements-dev.txt 2>/dev/null || true"),
                ("requirements-test.txt", "pip install -q -r requirements-test.txt 2>/dev/null || true"),
            ):
                if (self.workspace / marker).exists():
                    installs.append(cmd)
            installs.append("pip install -q pytest 2>/dev/null || true")
            return " && ".join(installs) if installs else "true"
        if self.language in ("javascript", "typescript"):
            if (self.workspace / "package-lock.json").exists():
                return "npm ci --silent --no-audit --no-fund || npm install --silent --no-audit --no-fund"
            return "npm install --silent --no-audit --no-fund"
        if self.language == "rust":
            return "true"
        return "true"

    def _run_tests(
        self, *, timeout_seconds: int, fresh_container: bool = False
    ) -> TestResult:
        cmd = self._detect_test_command()
        bootstrap = self._bootstrap_command()
        full = f"{bootstrap} && {' '.join(cmd)}"

        if not self.use_docker:
            return self._run_local(full, timeout_seconds)

        return self._run_in_docker(full, timeout_seconds, fresh_container)

    def _run_local(self, full_cmd: str, timeout_seconds: int) -> TestResult:
        logger.info("Running tests locally (no docker): %s", full_cmd)
        try:
            proc = subprocess.run(
                full_cmd, shell=True, cwd=str(self.workspace),
                capture_output=True, text=True, timeout=timeout_seconds,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        except subprocess.TimeoutExpired as e:
            output = (e.stdout or "") + "\n" + (e.stderr or "")
            res = self._parse_output(output)
            res.timed_out = True
            return res
        return self._parse_output(output)

    def _run_in_docker(
        self, full_cmd: str, timeout_seconds: int, fresh_container: bool
    ) -> TestResult:
        try:
            import docker
        except ImportError:
            logger.warning("docker SDK unavailable, falling back to local run")
            return self._run_local(full_cmd, timeout_seconds)

        client = docker.from_env()
        image = self._docker_image()
        try:
            client.images.get(image)
        except docker.errors.ImageNotFound:
            logger.info("Pulling image %s", image)
            client.images.pull(image)

        volumes: dict[str, dict[str, str]] = {
            str(self.workspace): {"bind": "/workspace", "mode": "rw"},
        }
        wrapped = (
            f"set -e; cd /workspace; "
            f"timeout {timeout_seconds}s bash -lc {json.dumps(full_cmd)}"
        )

        try:
            container = client.containers.run(
                image=image,
                command=["bash", "-lc", wrapped],
                volumes=volumes,
                working_dir="/workspace",
                detach=True,
                mem_limit=f"{self.memory_mb}m",
                nano_cpus=int(self.cpu_count * 1_000_000_000),
                network_mode="bridge",
                stdout=True, stderr=True,
                auto_remove=False,
                name=f"graft-test-{uuid.uuid4().hex[:8]}" if fresh_container else None,
            )
        except Exception as e:
            logger.exception("Failed to start container")
            return TestResult(raw_stdout=f"docker error: {e}")

        try:
            try:
                container.wait(timeout=timeout_seconds + 30)
            except Exception:
                container.kill()
            output = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        finally:
            try:
                container.remove(force=True)
            except Exception:
                pass

        return self._parse_output(output)

    def _parse_output(self, text: str) -> TestResult:
        if self.language == "python":
            return parse_pytest_output(text)
        if self.language in ("javascript", "typescript"):
            return parse_jest_output(text)
        return TestResult(raw_stdout=text)
