"""
WorkflowUser — the workflow realm's login identity. Role model is a 7-level
hierarchy (ported verbatim from Task_Workflow's ROLES/ROLE_HIERARCHY in
backero-backend/src/utils/constants.js), not a fine-grained permission-string
system — deliberately faithful to the source's actual authorization model
(numeric "at least this level" checks).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class WorkflowRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    CHAIRMAN = "chairman"
    FOUNDER = "founder"
    ADMIN = "admin"
    MANAGER = "manager"
    TEAM_LEAD = "team_lead"
    MEMBER = "member"


WORKFLOW_ROLE_HIERARCHY: dict[WorkflowRole, int] = {
    WorkflowRole.SUPER_ADMIN: 7,
    WorkflowRole.CHAIRMAN: 6,
    WorkflowRole.FOUNDER: 5,
    WorkflowRole.ADMIN: 4,
    WorkflowRole.MANAGER: 3,
    WorkflowRole.TEAM_LEAD: 2,
    WorkflowRole.MEMBER: 1,
}


class WorkflowUser(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "workflow_users"
    __table_args__ = (UniqueConstraint("organization_id", "email", name="uq_workflow_users_org_email"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    last_name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[WorkflowRole] = mapped_column(
        SAEnum(WorkflowRole, name="workflow_role", native_enum=True), nullable=False, default=WorkflowRole.MEMBER
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_departments.id"), nullable=True
    )
    designation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reports_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    avatar: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class WorkflowRefreshToken(Base, UUIDPrimaryKeyMixin):
    """Mirrors the Attendance Tracker reference's refresh-token
    rotation/theft-detection shape — a deliberate reimplementation, not a
    shared import, since this is a separate codebase/auth realm."""

    __tablename__ = "workflow_refresh_tokens"

    workflow_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    device_label: Mapped[str] = mapped_column(String(255), default="")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_refresh_tokens.id"), nullable=True
    )
