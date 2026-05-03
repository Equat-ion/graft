"""Organization CRUD endpoints."""

from __future__ import annotations

import re
import unicodedata
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.auth import get_current_user
from backend.db.models import OrgMember, Organization, Project, User
from backend.db.schemas import OrganizationCreate, OrganizationOut, OrganizationUpdate
from backend.db.session import get_session

router = APIRouter()


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "org"


async def _generate_unique_slug(
    session: AsyncSession, base_slug: str, *, exclude_org_id: uuid.UUID | None = None
) -> str:
    candidate = base_slug
    counter = 2
    while True:
        stmt = select(Organization.id).where(Organization.slug == candidate)
        if exclude_org_id is not None:
            stmt = stmt.where(Organization.id != exclude_org_id)
        row = await session.execute(stmt)
        if row.scalar_one_or_none() is None:
            return candidate
        candidate = f"{base_slug}-{counter}"
        counter += 1


async def get_accessible_org(
    session: AsyncSession, user: User, *, slug: str
) -> Organization:
    stmt = (
        select(Organization)
        .options(selectinload(Organization.projects))
        .where(Organization.slug == slug)
        .where(
            or_(
                Organization.owner_id == user.id,
                exists(
                    select(OrgMember.id)
                    .where(OrgMember.org_id == Organization.id)
                    .where(OrgMember.user_id == user.id)
                ),
            )
        )
    )
    row = await session.execute(stmt)
    org = row.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def get_accessible_org_by_id(
    session: AsyncSession, user: User, org_id: uuid.UUID
) -> Organization:
    stmt = (
        select(Organization)
        .options(selectinload(Organization.projects))
        .where(Organization.id == org_id)
        .where(
            or_(
                Organization.owner_id == user.id,
                exists(
                    select(OrgMember.id)
                    .where(OrgMember.org_id == Organization.id)
                    .where(OrgMember.user_id == user.id)
                ),
            )
        )
    )
    row = await session.execute(stmt)
    org = row.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("", response_model=list[OrganizationOut])
async def list_orgs(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[Organization]:
    stmt = (
        select(Organization)
        .options(selectinload(Organization.projects))
        .where(
            or_(
                Organization.owner_id == user.id,
                exists(
                    select(OrgMember.id)
                    .where(OrgMember.org_id == Organization.id)
                    .where(OrgMember.user_id == user.id)
                ),
            )
        )
        .order_by(Organization.created_at.desc())
    )
    rows = await session.execute(stmt)
    return list(rows.scalars().all())


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
async def create_org(
    payload: OrganizationCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Organization:
    slug = _slugify(payload.slug or payload.name)
    slug = await _generate_unique_slug(session, slug)
    org = Organization(name=payload.name, slug=slug, owner_id=user.id)
    session.add(org)
    await session.flush()
    session.add(OrgMember(org_id=org.id, user_id=user.id, role="owner"))
    await session.flush()
    await session.refresh(org, attribute_names=["projects"])
    return org


@router.get("/{slug}", response_model=OrganizationOut)
async def get_org(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Organization:
    return await get_accessible_org(session, user, slug=slug)


@router.patch("/{slug}", response_model=OrganizationOut)
async def update_org(
    slug: str,
    payload: OrganizationUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Organization:
    org = await get_accessible_org(session, user, slug=slug)
    if org.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can update an organization")

    if payload.name is not None:
        org.name = payload.name
    if payload.slug is not None:
        desired = _slugify(payload.slug)
        org.slug = await _generate_unique_slug(session, desired, exclude_org_id=org.id)
    await session.flush()
    await session.refresh(org, attribute_names=["projects"])
    return org


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org(
    slug: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    org = await get_accessible_org(session, user, slug=slug)
    if org.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete an organization")
    await session.delete(org)
