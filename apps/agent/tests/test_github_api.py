from __future__ import annotations

import uuid

import pytest

from backend.main import app


def test_github_router_is_registered() -> None:
    paths = {route.path for route in app.routes}
    assert "/api/github/oauth/start" in paths


def test_github_repo_routes_are_registered() -> None:
    paths = {route.path for route in app.routes}
    assert "/api/github/repos" in paths
    assert "/api/github/repos/select" in paths


@pytest.mark.asyncio
async def test_github_oauth_start_builds_authorize_url() -> None:
    from backend.api.github import oauth_start

    payload = await oauth_start(project_id=uuid.uuid4())
    assert "url" in payload
    assert payload["url"].startswith("https://github.com/login/oauth/authorize?")
