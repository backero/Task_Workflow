"""Request/response schemas for notifications (Phase 6)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationPriority, NotificationType


class NotificationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    recipient_id: uuid.UUID
    title: str
    message: str
    type: NotificationType
    priority: NotificationPriority
    is_read: bool
    read_at: datetime | None
    action_url: str | None
    reference_type: str | None
    reference_id: uuid.UUID | None
    channel_in_app: bool
    channel_whatsapp: bool
    channel_email: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationPageResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int
