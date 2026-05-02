"""Agent tools: read_file, edit_file, grep_repo, ast_query, read_changelog,
run_tests, submit.

Tools resolve the active sandboxed workspace via `backend.agent.session`.
File-system tools operate directly on the host-side workspace snapshot.
`run_tests` and the final-eval at `submit` go through the Docker sandbox.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import httpx
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from backend.agent.session import current_session

logger = logging.getLogger(__name__)


# ---------- arg schemas ----------


class ReadFileArgs(BaseModel):
    path: str = Field(description="Repo-relative file path.")


class EditFileArgs(BaseModel):
    path: str = Field(description="Repo-relative file path.")
    old_str: str = Field(description="Exact substring to replace. Must occur exactly once.")
    new_str: str = Field(description="Replacement substring.")


class GrepArgs(BaseModel):
    pattern: str = Field(description="Python regex.")
    file_glob: str = Field(default="**/*", description="Glob filter for files to search.")


class AstQueryArgs(BaseModel):
    language: str = Field(description="One of: python, javascript, typescript.")
    query: str = Field(description="Tree-sitter S-expression query.")


class ChangelogArgs(BaseModel):
    dep: str
    from_version: str
    to_version: str


class RunTestsArgs(BaseModel):
    timeout_seconds: int = Field(default=120, ge=10, le=600)


class SubmitArgs(BaseModel):
    pass


# ---------- helpers ----------


def _safe_resolve(rel: str) -> Path:
    """Resolve a repo-relative path; reject anything that escapes the workspace."""
    workspace = current_session().workspace
    candidate = (workspace / rel).resolve()
    try:
        candidate.relative_to(workspace.resolve())
    except ValueError as e:
        raise ValueError(f"Path escapes workspace: {rel}") from e
    return candidate


_TEST_DIR_PARTS = {"tests", "test", "spec", "__tests__"}
_TEST_FILE_RE = re.compile(r"(^|/)(test_|.*_test\.|.*\.test\.|.*\.spec\.)")
_TEST_CONFIG_NAMES = {
    "pytest.ini", "conftest.py", "tox.ini", ".coveragerc",
    "jest.config.js", "jest.config.ts", "jest.config.mjs",
    "vitest.config.ts", "vitest.config.js",
}


def _is_test_path(rel: str) -> bool:
    norm = rel.replace("\\", "/").lstrip("./")
    parts = set(norm.split("/"))
    if parts & _TEST_DIR_PARTS:
        return True
    name = norm.rsplit("/", 1)[-1]
    if name in _TEST_CONFIG_NAMES:
        return True
    if _TEST_FILE_RE.search(norm):
        return True
    return False


# ---------- tool impls ----------


def _read_file(path: str) -> str:
    target = _safe_resolve(path)
    if not target.exists():
        return f"ERROR: file not found: {path}"
    if not target.is_file():
        return f"ERROR: not a file: {path}"
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return target.read_bytes()[:4096].decode("utf-8", errors="replace")


def _edit_file(path: str, old_str: str, new_str: str) -> str:
    if _is_test_path(path):
        session = current_session()
        session.sandbox.flag_violation(f"agent attempted to edit test path: {path}")
        return f"ERROR: refusing to edit test path: {path} (violation recorded)"

    target = _safe_resolve(path)
    if not target.exists():
        return f"ERROR: file not found: {path}"
    text = target.read_text(encoding="utf-8")
    occurrences = text.count(old_str)
    if occurrences == 0:
        return f"ERROR: old_str not found in {path}"
    if occurrences > 1:
        return f"ERROR: old_str matches {occurrences} places in {path}; make it unique"
    target.write_text(text.replace(old_str, new_str, 1), encoding="utf-8")
    return f"Applied edit to {path}"


def _grep_repo(pattern: str, file_glob: str = "**/*") -> list[dict[str, Any]]:
    workspace = current_session().workspace
    try:
        compiled = re.compile(pattern)
    except re.error as e:
        return [{"error": f"invalid regex: {e}"}]
    results: list[dict[str, Any]] = []
    for path in workspace.glob(file_glob):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            if compiled.search(line):
                results.append({
                    "file": str(path.relative_to(workspace)).replace("\\", "/"),
                    "line_no": line_no,
                    "snippet": line[:240],
                })
                if len(results) >= 200:
                    return results
    return results


_TS_LANG_LOADERS = {
    "python": "tree_sitter_python",
    "javascript": "tree_sitter_javascript",
    "typescript": "tree_sitter_typescript",
}


def _load_ts_language(lang: str):
    import importlib

    mod_name = _TS_LANG_LOADERS.get(lang)
    if not mod_name:
        return None
    mod = importlib.import_module(mod_name)
    if lang == "typescript":
        # tree_sitter_typescript exposes language_typescript() and language_tsx()
        return mod.language_typescript()
    return mod.language()


def _ast_query(language: str, query: str) -> list[dict[str, Any]]:
    if language not in _TS_LANG_LOADERS:
        return [{"error": f"unsupported language: {language}"}]
    try:
        from tree_sitter import Language, Parser, Query
    except ImportError:
        return [{"error": "tree-sitter not installed in this environment"}]
    try:
        ts_lang = Language(_load_ts_language(language))
    except Exception as e:
        return [{"error": f"failed to load tree-sitter grammar: {e}"}]
    parser = Parser(ts_lang)
    try:
        compiled = Query(ts_lang, query)
    except Exception as e:
        return [{"error": f"invalid tree-sitter query: {e}"}]

    workspace = current_session().workspace
    suffixes = {".py"} if language == "python" else (
        {".js", ".jsx", ".mjs"} if language == "javascript" else {".ts", ".tsx"}
    )
    results: list[dict[str, Any]] = []
    for path in workspace.rglob("*"):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        try:
            src = path.read_bytes()
        except OSError:
            continue
        try:
            tree = parser.parse(src)
        except Exception:
            continue
        try:
            captures = compiled.captures(tree.root_node)
        except Exception:
            continue
        for name, nodes in (captures.items() if isinstance(captures, dict) else []):
            for node in nodes:
                results.append({
                    "file": str(path.relative_to(workspace)).replace("\\", "/"),
                    "node_type": node.type,
                    "capture": name,
                    "text": src[node.start_byte:node.end_byte].decode("utf-8", errors="replace")[:240],
                    "start_line": node.start_point[0] + 1,
                })
                if len(results) >= 200:
                    return results
    return results


def _read_changelog(dep: str, from_version: str, to_version: str) -> str:
    """Best-effort fetch of release notes between two versions.

    Tries the GitHub releases API for known repos first; falls back to PyPI/npm metadata.
    """
    timeout = httpx.Timeout(10.0)
    headers = {"User-Agent": "graft/0.1"}
    chunks: list[str] = []

    def _try_pypi() -> str | None:
        try:
            r = httpx.get(f"https://pypi.org/pypi/{dep}/json", timeout=timeout, headers=headers)
            if r.status_code != 200:
                return None
            data = r.json()
            urls = data.get("info", {}).get("project_urls") or {}
            for k, v in urls.items():
                if "github.com" in (v or "").lower():
                    return v
        except (httpx.HTTPError, ValueError):
            return None
        return None

    def _try_npm() -> str | None:
        try:
            r = httpx.get(f"https://registry.npmjs.org/{dep}", timeout=timeout, headers=headers)
            if r.status_code != 200:
                return None
            data = r.json()
            repo = data.get("repository") or {}
            url = repo.get("url") if isinstance(repo, dict) else repo
            if url and "github.com" in url:
                return url
        except (httpx.HTTPError, ValueError):
            return None
        return None

    repo_url = _try_pypi() or _try_npm()
    if not repo_url:
        return f"No changelog source could be located for {dep}."

    m = re.search(r"github\.com[:/]+([^/]+)/([^/.]+)", repo_url)
    if not m:
        return f"Repository URL not on GitHub: {repo_url}"
    owner, repo = m.group(1), m.group(2)

    try:
        r = httpx.get(
            f"https://api.github.com/repos/{owner}/{repo}/releases?per_page=100",
            timeout=timeout, headers=headers,
        )
        if r.status_code == 200:
            releases = r.json()
            wanted = _versions_between(from_version, to_version, [rel["tag_name"] for rel in releases])
            for rel in releases:
                tag = rel.get("tag_name", "")
                if tag in wanted:
                    body = (rel.get("body") or "").strip()
                    if body:
                        chunks.append(f"## {tag}\n{body}")
            if chunks:
                return "\n\n".join(chunks)[:6000]
    except (httpx.HTTPError, ValueError):
        pass

    for branch in ("main", "master"):
        for fname in ("CHANGELOG.md", "CHANGES.md", "HISTORY.md", "CHANGELOG.rst"):
            try:
                r = httpx.get(
                    f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{fname}",
                    timeout=timeout, headers=headers,
                )
                if r.status_code == 200:
                    return r.text[:6000]
            except httpx.HTTPError:
                continue

    return f"Could not retrieve changelog for {dep} {from_version}->{to_version}."


def _versions_between(low: str, high: str, tags: list[str]) -> set[str]:
    """Return tag names whose version sits in (low, high]."""
    from packaging.version import InvalidVersion, Version

    def _norm(t: str) -> Version | None:
        try:
            return Version(t.lstrip("vV"))
        except InvalidVersion:
            return None

    try:
        lo, hi = Version(low.lstrip("vV")), Version(high.lstrip("vV"))
    except InvalidVersion:
        return set(tags)

    out: set[str] = set()
    for t in tags:
        v = _norm(t)
        if v is not None and lo < v <= hi:
            out.add(t)
    return out


def _run_tests(timeout_seconds: int = 120) -> dict[str, Any]:
    session = current_session()
    return session.sandbox.run_tests(timeout_seconds=timeout_seconds)


def _submit() -> str:
    session = current_session()
    session.sandbox.mark_submitted()
    return "Episode complete; final evaluation pending."


# ---------- exported StructuredTool objects ----------


read_file = StructuredTool.from_function(
    func=_read_file,
    name="read_file",
    description="Read a file from the project workspace. Returns its UTF-8 text contents.",
    args_schema=ReadFileArgs,
)

edit_file = StructuredTool.from_function(
    func=_edit_file,
    name="edit_file",
    description=(
        "Apply a unique substring replacement to a file. old_str must occur exactly once "
        "and must NOT be inside the test suite or test config files."
    ),
    args_schema=EditFileArgs,
)

grep_repo = StructuredTool.from_function(
    func=_grep_repo,
    name="grep_repo",
    description="Regex-search files in the workspace. Returns up to 200 matches.",
    args_schema=GrepArgs,
)

ast_query = StructuredTool.from_function(
    func=_ast_query,
    name="ast_query",
    description=(
        "Run a tree-sitter S-expression query across all source files of the given "
        "language (python|javascript|typescript). Returns up to 200 captured nodes."
    ),
    args_schema=AstQueryArgs,
)

read_changelog = StructuredTool.from_function(
    func=_read_changelog,
    name="read_changelog",
    description=(
        "Fetch release notes / CHANGELOG entries between two versions of a dependency. "
        "Tries GitHub releases first, falls back to CHANGELOG.md."
    ),
    args_schema=ChangelogArgs,
)

run_tests = StructuredTool.from_function(
    func=_run_tests,
    name="run_tests",
    description=(
        "Run the project's test suite inside the Docker sandbox. "
        "Returns {passed, failed, errors, tracebacks}. Note: this is observational; the "
        "authoritative result that drives reward is computed in a fresh container at submit()."
    ),
    args_schema=RunTestsArgs,
)

submit = StructuredTool.from_function(
    func=_submit,
    name="submit",
    description=(
        "Signal that the upgrade is done. Triggers the authoritative final test run "
        "in a fresh sandbox container. Call exactly once when you believe the work is complete."
    ),
    args_schema=SubmitArgs,
)


ALL_TOOLS = [read_file, edit_file, grep_repo, ast_query, read_changelog, run_tests, submit]


def tools_by_name() -> dict[str, StructuredTool]:
    return {t.name: t for t in ALL_TOOLS}


def serialise_args(args: Any) -> dict[str, Any]:
    if isinstance(args, BaseModel):
        return args.model_dump()
    if isinstance(args, dict):
        return args
    try:
        return json.loads(args)
    except (TypeError, ValueError):
        return {"_raw": str(args)}
