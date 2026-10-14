"""Organization settings business logic — ported from organization.routes.js
core endpoints (GET/PUT /me). Deliberately NOT ported: the social-automation
API-key generate/status/callback-url endpoints — those belong with Marketing
(Phase 5), since they're meaningless without the webhook consumer that also
lives there."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.workflow_organization import WorkflowOrganization
from app.schemas.workflow_organization import OrganizationUpdateRequest


def get_organization(db: Session, *, org_id: uuid.UUID) -> WorkflowOrganization:
    org = db.get(WorkflowOrganization, org_id)
    if org is None:
        raise NotFoundError("Organization not found.")
    return org


def update_organization(db: Session, *, org_id: uuid.UUID, data: OrganizationUpdateRequest) -> WorkflowOrganization:
    org = get_organization(db, org_id=org_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(org, field, value)
    db.commit()
    db.refresh(org)
    return org
