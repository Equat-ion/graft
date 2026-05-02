"""PyPI release watcher.

Polls the per-project RSS feed and returns the latest stable version found.
"""

from __future__ import annotations

import logging
from typing import Any

import feedparser
import httpx
from packaging.version import InvalidVersion, Version

logger = logging.getLogger(__name__)

RSS_URL = "https://pypi.org/rss/project/{name}/releases.xml"
JSON_URL = "https://pypi.org/pypi/{name}/json"


def _parse_version(raw: str) -> Version | None:
    try:
        v = Version(raw.strip())
    except InvalidVersion:
        return None
    if v.is_prerelease or v.is_devrelease:
        return None
    return v


async def latest_pypi_version(name: str, *, client: httpx.AsyncClient | None = None) -> str | None:
    """Return the highest stable version on PyPI, or None on lookup failure.

    Tries the JSON API first (authoritative), falls back to RSS if that fails.
    """
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "graft-watcher/0.1"})
    assert client is not None
    try:
        try:
            r = await client.get(JSON_URL.format(name=name))
            if r.status_code == 200:
                data: dict[str, Any] = r.json()
                releases = data.get("releases", {})
                versions = [v for raw in releases for v in [_parse_version(raw)] if v]
                if versions:
                    return str(max(versions))
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("PyPI JSON lookup failed for %s: %s", name, e)

        try:
            r = await client.get(RSS_URL.format(name=name))
            if r.status_code == 200:
                feed = feedparser.parse(r.text)
                versions = [
                    v for entry in feed.entries
                    for v in [_parse_version(entry.get("title", ""))] if v
                ]
                if versions:
                    return str(max(versions))
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("PyPI RSS lookup failed for %s: %s", name, e)
    finally:
        if owns_client:
            await client.aclose()
    return None


def is_newer(current: str, candidate: str) -> bool:
    """True iff candidate is a strictly newer stable version than current."""
    try:
        return Version(candidate) > Version(current)
    except InvalidVersion:
        return False
