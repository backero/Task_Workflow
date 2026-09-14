"""
Identity resolution (from JWT) and role-hierarchy authorization dependencies
for the workflow realm. Mirrors the Attendance Tracker reference's
app/modules/auth/dependencies.py pattern, but authorization here is a
numeric "at least this level" check (WORKFLOW_ROLE_HIERARCHY), not a
permission-string system — faithful to Task_Workflow's own
role.middleware.js (authorizeManagerOrAbove/authorizeAdminOrAbove).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import TokenError, decode_access_token
from app.models.workflow_user import WORKFLOW_ROLE_HIERARCHY, WorkflowRole, WorkflowUser

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_workflow_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> WorkflowUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="token_invalid")

    user = db.get(WorkflowUser, uuid.UUID(user_id))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="user_inactive_or_not_found")

    return user


def require_workflow_role(min_role: WorkflowRole) -> Callable[..., WorkflowUser]:
    """
    FastAPI dependency factory. Usage:
        @router.post(..., dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))])
    Grants access to `min_role` and every role above it in the hierarchy —
    ported from role.middleware.js's authorizeManagerOrAbove/
    authorizeAdminOrAbove (numeric level comparison, never a role-name list).
    """
    min_level = WORKFLOW_ROLE_HIERARCHY[min_role]

    def _dependency(current_user: WorkflowUser = Depends(get_current_workflow_user)) -> WorkflowUser:
        if WORKFLOW_ROLE_HIERARCHY.get(current_user.role, 0) < min_level:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="permission_denied")
        return current_user

    return _dependency
