from __future__ import annotations

from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Session, User
from backend.db.session import get_session


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session)
) -> User:
    # Better Auth uses 'better-auth.session_token' cookie by default
    session_token = request.cookies.get("better-auth.session_token")
    if not session_token:
        # Fallback to Authorization header (optional but good for testing)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]

    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    # Better Auth stores the raw token; the cookie value is "token.signature"
    token = session_token.split(".")[0]

    # Query the session from the database
    stmt = (
        select(Session)
        .where(Session.token == token)
        .where(Session.expiresAt > datetime.now(timezone.utc))
    )
    result = await db.execute(stmt)
    session_record = result.scalar_one_or_none()

    if not session_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    # Get the user
    stmt = select(User).where(User.id == session_record.userId)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user
