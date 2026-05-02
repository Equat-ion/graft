"""npm registry watcher.

Hits the dist-tags endpoint to discover the current `latest` tag for a package.
"""

from __future__ import annotations

import logging

import httpx
from packaging.version import InvalidVersion, Version

logger = logging.getLogger(__name__)

DIST_TAGS_URL = "https://registry.npmjs.org/-/package/{name}/dist-tags"


async def latest_npm_version(name: str, *, client: httpx.AsyncClient | None = None) -> str | None:
    """Return the version published under the `latest` dist-tag, or None on failure."""
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "graft-watcher/0.1"})
    assert client is not None
    try:
        try:
            r = await client.get(DIST_TAGS_URL.format(name=name))
            if r.status_code != 200:
                logger.warning("npm dist-tags lookup for %s returned %s", name, r.status_code)
                return None
            data = r.json()
            return data.get("latest")
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("npm dist-tags lookup failed for %s: %s", name, e)
            return None
    finally:
        if owns_client:
            await client.aclose()


def is_newer(current: str, candidate: str) -> bool:
    """True iff candidate is strictly newer than current.

    npm versions are semver; the `packaging` library's Version handles standard
    semver fine for the comparisons we care about (major.minor.patch).
    """
    try:
        return Version(candidate) > Version(current)
    except InvalidVersion:
        return current != candidate
