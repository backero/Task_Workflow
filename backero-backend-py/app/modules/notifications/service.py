"""Notifications business logic — ported from notification.routes.js +
notification.service.js's markAsRead/markAllAsRead/getUnreadCount helpers.

`create_notification` is a reusable helper for other modules to call once
they reach a point that should notify someone (task assignment, lead
assignment, approval requests, ...) — mirrors the source's
`createNotification()` service function. Nothing calls it yet: those trigger
points live in domains not yet ported (Phase 2+). It's shipped now so this
phase's read/manage endpoints have a real table to operate on as soon as the
first caller shows up, instead of adding the notification "shelf" and its
creation helper in two separate migrations later."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.pagination import PageParams
from app.models.notification import Notification, NotificationPriority, NotificationType
from app.models.workflow_user import WorkflowUser
from app.schemas.notification import NotificationPageResponse, NotificationResponse


def _unread_count(db: Session, *, org_id: uuid.UUID, recipient_id: uuid.UUID) -> int:
    return db.execute(
        select(func.count(Notification.id)).where(
            Notification.organization_id == org_id,
            Notification.recipient_id == recipient_id,
            Notification.is_read.is_(False),
        )
    ).scalar_one()


def list_notifications(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: WorkflowUser,
    page_params: PageParams,
    type_: NotificationType | None,
    priority: NotificationPriority | None,
    is_read: bool | None,
) -> NotificationPageResponse:
    conditions = [Notification.organization_id == org_id, Notification.recipient_id == actor.id]
    if type_ is not None:
        conditions.append(Notification.type == type_)
    if priority is not None:
        conditions.append(Notification.priority == priority)
    if is_read is not None:
        conditions.append(Notification.is_read == is_read)

    total = db.execute(select(func.count(Notification.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return NotificationPageResponse(
        items=[NotificationResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        unread_count=_unread_count(db, org_id=org_id, recipient_id=actor.id),
    )


def _get_own_notification_or_404(
    db: Session, *, org_id: uuid.UUID, actor_id: uuid.UUID, notification_id: uuid.UUID
) -> Notification:
    notif = db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.organization_id == org_id,
            Notification.recipient_id == actor_id,
        )
    ).scalar_one_or_none()
    if notif is None:
        raise NotFoundError("Notification not found.")
    return notif


def mark_read(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, notification_id: uuid.UUID) -> Notification:
    notif = _get_own_notification_or_404(db, org_id=org_id, actor_id=actor.id, notification_id=notification_id)
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(UTC)
        db.commit()
        db.refresh(notif)
    return notif


def mark_all_read(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> None:
    unread = (
        db.execute(
            select(Notification).where(
                Notification.organization_id == org_id,
                Notification.recipient_id == actor.id,
                Notification.is_read.is_(False),
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    for notif in unread:
        notif.is_read = True
        notif.read_at = now
    db.commit()


def get_unread_count(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> int:
    return _unread_count(db, org_id=org_id, recipient_id=actor.id)


def delete_notification(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, notification_id: uuid.UUID) -> None:
    notif = _get_own_notification_or_404(db, org_id=org_id, actor_id=actor.id, notification_id=notification_id)
    db.delete(notif)
    db.commit()


def delete_all_notifications(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> None:
    rows = (
        db.execute(
            select(Notification).where(Notification.organization_id == org_id, Notification.recipient_id == actor.id)
        )
        .scalars()
        .all()
    )
    for row in rows:
        db.delete(row)
    db.commit()


def create_notification(
    db: Session,
    *,
    org_id: uuid.UUID,
    recipient_id: uuid.UUID,
    title: str,
    message: str,
    type_: NotificationType = NotificationType.SYSTEM,
    priority: NotificationPriority = NotificationPriority.MEDIUM,
    action_url: str | None = None,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    channel_whatsapp: bool = False,
    channel_email: bool = False,
    created_by_id: uuid.UUID | None = None,
) -> Notification:
    notif = Notification(
        organization_id=org_id,
        recipient_id=recipient_id,
        title=title,
        message=message,
        type=type_,
        priority=priority,
        action_url=action_url,
        reference_type=reference_type,
        reference_id=reference_id,
        channel_whatsapp=channel_whatsapp,
        channel_email=channel_email,
        created_by_id=created_by_id,
    )
    db.add(notif)
    db.flush()
    return notif
