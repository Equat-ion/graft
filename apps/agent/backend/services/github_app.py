"""GitHub App installation token helper.

Generates short-lived (1-hour) installation access tokens using JWT auth.
"""

from __future__ import annotations

import time

import httpx
import jwt


async def get_installation_token(
    app_id: str, private_key_pem: str, installation_id: str
) -> str:
    """Return a GitHub App installation access token for the given installation."""
    now = int(time.time())
    payload = {
        "iat": now - 60,   # issued 60 s ago to allow clock skew
        "exp": now + 540,  # valid for 9 minutes
        "iss": app_id,
    }
    app_jwt = jwt.encode(payload, private_key_pem, algorithm="RS256")

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        res.raise_for_status()
        data = res.json()
        return data["token"]
