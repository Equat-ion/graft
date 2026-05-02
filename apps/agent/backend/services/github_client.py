from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(slots=True)
class GithubClient:
    token: str

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_authenticated_user(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get("https://api.github.com/user", headers=self._headers)
            res.raise_for_status()
            return res.json()

    async def list_repos(self) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                "https://api.github.com/user/repos?per_page=100&sort=updated",
                headers=self._headers,
            )
            res.raise_for_status()
            return res.json()

    async def get_repo_tree(self, full_name: str, ref: str = "HEAD") -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"https://api.github.com/repos/{full_name}/git/trees/{ref}?recursive=1",
                headers=self._headers,
            )
            res.raise_for_status()
            return res.json()

    async def get_file(self, full_name: str, path: str, ref: str = "HEAD") -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"https://api.github.com/repos/{full_name}/contents/{path}?ref={ref}",
                headers=self._headers,
            )
            res.raise_for_status()
            return res.json()

    async def create_branch(self, full_name: str, new_branch: str, sha: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"https://api.github.com/repos/{full_name}/git/refs",
                headers=self._headers,
                json={"ref": f"refs/heads/{new_branch}", "sha": sha},
            )
            res.raise_for_status()
            return res.json()

    async def create_commit(
        self,
        full_name: str,
        message: str,
        tree: str,
        parents: list[str],
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"https://api.github.com/repos/{full_name}/git/commits",
                headers=self._headers,
                json={"message": message, "tree": tree, "parents": parents},
            )
            res.raise_for_status()
            return res.json()

    async def create_pull_request(
        self,
        full_name: str,
        title: str,
        head: str,
        base: str,
        body: str | None = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"https://api.github.com/repos/{full_name}/pulls",
                headers=self._headers,
                json={"title": title, "head": head, "base": base, "body": body},
            )
            res.raise_for_status()
            return res.json()
