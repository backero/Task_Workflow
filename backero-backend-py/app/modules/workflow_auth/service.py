"""
Workflow auth business logic: register (org + first admin), login, refresh
rotation with reuse/theft detection, logout, logout-all. Mirrors the
Attendance Tracker reference repo's app/modules/auth/service.py pattern,
reimplemented standalone for the workflow_users/workflow_organizations
realm. `register` ports Task_Workflow's auth.controller.js#register (create
org -> create ADMIN-role user -> link org.created_by_id).
"""

from __future__ import annotations

import re
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.models.workflow_organization import WorkflowOrganization
from app.models.workflow_user import WorkflowRefreshToken, WorkflowRole, WorkflowUser


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return f"{slug or 'org'}-{int(time.time() * 1000)}"


class TokenPair:
    def __init__(self, access_token: str, refresh_token: str, expires_in: int) -> None:
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.expires_in = expires_in


def _issue_token_pair(
    db: Session, user: WorkflowUser, device_label: str = ""
) -> tuple[TokenPair, WorkflowRefreshToken]:
    from app.core.config import get_settings

    settings = get_settings()
    raw_refresh = generate_refresh_token()
    now = datetime.now(UTC)
    new_row = WorkflowRefreshToken(
        workflow_user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        device_label=device_label,
        issued_at=now,
        expires_at=refresh_token_expiry(),
    )
    db.add(new_row)
    db.flush()
    access_token = create_access_token(
        subject=str(user.id), extra_claims={"organization_id": str(user.organization_id), "role": user.role.value}
    )
    pair = TokenPair(
        access_token=access_token, refresh_token=raw_refresh, expires_in=settings.access_token_ttl_minutes * 60
    )
    return pair, new_row


def register(
    db: Session,
    *,
    organization_name: str,
    first_name: str,
    last_name: str,
    email: str,
    phone: str | None,
    password: str,
) -> tuple[TokenPair, WorkflowUser, WorkflowOrganization]:
    existing = db.execute(
        select(WorkflowOrganization).where(WorkflowOrganization.email == email.lower())
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("organization_exists", "An organization with this email already exists.", status_code=409)

    org = WorkflowOrganization(
        name=organization_name, slug=_slugify(organization_name), email=email.lower(), phone=phone
    )
    db.add(org)
    db.flush()

    user = WorkflowUser(
        organization_id=org.id,
        first_name=first_name,
        last_name=last_name,
        email=email.lower(),
        phone=phone,
        hashed_password=hash_password(password),
        role=WorkflowRole.ADMIN,
    )
    db.add(user)
    db.flush()

    org.created_by_id = user.id
    pair, _ = _issue_token_pair(db, user)
    user.last_login_at = datetime.now(UTC)
    db.commit()
    db.refresh(user)
    db.refresh(org)
    return pair, user, org


def authenticate(db: Session, *, email: str, password: str) -> TokenPair:
    user = db.execute(
        select(WorkflowUser).where(WorkflowUser.email == email.lower(), WorkflowUser.deleted_at.is_(None))
    ).scalar_one_or_none()

    if user is None or not user.is_active or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password.")

    pair, _ = _issue_token_pair(db, user)
    user.last_login_at = datetime.now(UTC)
    db.commit()
    return pair


def refresh(db: Session, *, raw_refresh_token: str) -> TokenPair:
    token_hash = hash_refresh_token(raw_refresh_token)
    token_row = db.execute(
        select(WorkflowRefreshToken).where(WorkflowRefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()

    if token_row is None:
        raise UnauthorizedError("Invalid refresh token.")

    now = datetime.now(UTC)

    if token_row.revoked_at is not None:
        _revoke_token_family(db, token_row)
        db.commit()
        raise UnauthorizedError("Session has been revoked. Please log in again.")

    expires_at = token_row.expires_at if token_row.expires_at.tzinfo else token_row.expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        raise UnauthorizedError("Refresh token has expired. Please log in again.")

    user = db.get(WorkflowUser, token_row.workflow_user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise UnauthorizedError("Account is no longer active.")

    new_pair, new_row = _issue_token_pair(db, user, device_label=token_row.device_label)

    token_row.revoked_at = now
    token_row.replaced_by_id = new_row.id
    db.commit()
    return new_pair


def _revoke_token_family(db: Session, token_row: WorkflowRefreshToken) -> None:
    visited: set[uuid.UUID] = set()
    queue = [token_row]
    while queue:
        current = queue.pop()
        if current.id in visited:
            continue
        visited.add(current.id)
        current.revoked_at = current.revoked_at or datetime.now(UTC)

        if current.replaced_by_id:
            successor = db.get(WorkflowRefreshToken, current.replaced_by_id)
            if successor:
                queue.append(successor)

        predecessor = db.execute(
            select(WorkflowRefreshToken).where(WorkflowRefreshToken.replaced_by_id == current.id)
        ).scalar_one_or_none()
        if predecessor:
            queue.append(predecessor)


def logout(db: Session, *, raw_refresh_token: str) -> None:
    token_hash = hash_refresh_token(raw_refresh_token)
    token_row = db.execute(
        select(WorkflowRefreshToken).where(WorkflowRefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    if token_row is not None and token_row.revoked_at is None:
        token_row.revoked_at = datetime.now(UTC)
    db.commit()
