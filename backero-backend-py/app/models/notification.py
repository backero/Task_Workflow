"""Notification — ported from Task_Workflow's Mongoose `Notification` model
(Phase 6). `reference{model,id}` becomes a plain (reference_type, reference_id)
pair with no FK constraint (the polymorphic-ref cross-cutting pattern).
`channels{inApp,whatsapp,email}` becomes three plain booleans — Phase 6 only
tracks which channels were *requested*, since no WhatsApp/email dispatcher
exists yet (that's Phase 5); there's no `sent`/`delivered` status to track
until a real sender is wired up. The source's Mongo TTL index on
`expiresAt` has no Postgres equivalent — `expires_at` is stored but nothing
sweeps it yet; a real cleanup job is a follow-up once background-job infra
(APScheduler) is introduced for something that actually needs it."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class NotificationType(StrEnum):
    TASK = "task"
    APPROVAL = "approval"
    CRM = "crm"
    INVENTORY = "inventory"
    PRODUCTION = "production"
    FINANCE = "finance"
    SYSTEM = "system"
    ESCALATION = "escalation"
    REMINDER = "reminder"
    REWARD = "reward"


class NotificationPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[NotificationType] = mapped_column(
        SAEnum(NotificationType, name="notification_type", native_enum=True),
        nullable=False,
        default=NotificationType.SYSTEM,
    )
    priority: Mapped[NotificationPriority] = mapped_column(
        SAEnum(NotificationPriority, name="notification_priority", native_enum=True),
        nullable=False,
        default=NotificationPriority.MEDIUM,
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reference_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    channel_in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    channel_whatsapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    channel_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notification_metadata: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
