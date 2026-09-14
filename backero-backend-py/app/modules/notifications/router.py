from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import PageParams
from app.models.notification import NotificationPriority, NotificationType
from app.models.workflow_user import WorkflowUser
from app.modules.notifications import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.notification import NotificationPageResponse, NotificationResponse, UnreadCountResponse

router = APIRouter(prefix="/workflow/notifications", tags=["workflow-notifications"])


@router.get("", response_model=NotificationPageResponse)
def list_notifications(
    type: NotificationType | None = Query(default=None),
    priority: NotificationPriority | None = Query(default=None),
    is_read: bool | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> NotificationPageResponse:
    return service.list_notifications(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        page_params=page_params,
        type_=type,
        priority=priority,
        is_read=is_read,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> UnreadCountResponse:
    count = service.get_unread_count(db, org_id=current_user.organization_id, actor=current_user)
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> NotificationResponse:
    notif = service.mark_read(
        db, org_id=current_user.organization_id, actor=current_user, notification_id=notification_id
    )
    return NotificationResponse.model_validate(notif)


@router.patch("/read-all", status_code=204)
def mark_all_read(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> None:
    service.mark_all_read(db, org_id=current_user.organization_id, actor=current_user)


@router.delete("/{notification_id}", status_code=204)
def delete_notification(
    notification_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.delete_notification(
        db, org_id=current_user.organization_id, actor=current_user, notification_id=notification_id
    )


@router.delete("", status_code=204)
def delete_all_notifications(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> None:
    service.delete_all_notifications(db, org_id=current_user.organization_id, actor=current_user)
