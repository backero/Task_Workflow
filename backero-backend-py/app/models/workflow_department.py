"""
WorkflowDepartment — org-scoped. Kept lean for Phase 1 (name/code/color/
description only) — Task_Workflow's real Department also carries KPIs,
automation rules, and a WhatsApp group id; those are added as additive
columns by whichever later phase actually needs them (Marketing/automation).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class WorkflowDepartment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "workflow_departments"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_workflow_departments_org_name"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#3b82f6")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
