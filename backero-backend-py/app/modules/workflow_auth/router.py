from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowUser
from app.modules.workflow_auth import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.workflow_auth import (
    CurrentWorkflowUserResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenPairResponse,
    WorkflowOrganizationResponse,
    WorkflowUserResponse,
)

router = APIRouter(prefix="/workflow/auth", tags=["workflow-auth"])


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register_endpoint(body: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    pair, user, org = service.register(
        db,
        organization_name=body.organization_name,
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        phone=body.phone,
        password=body.password,
    )
    return RegisterResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
        user=WorkflowUserResponse.model_validate(user),
        organization=WorkflowOrganizationResponse.model_validate(org),
    )


@router.post("/login", response_model=TokenPairResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    pair = service.authenticate(db, email=body.email, password=body.password)
    return TokenPairResponse(
        access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in
    )


@router.post("/refresh", response_model=TokenPairResponse)
def refresh_token_endpoint(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    pair = service.refresh(db, raw_refresh_token=body.refresh_token)
    return TokenPairResponse(
        access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in
    )


@router.post("/logout", status_code=204, response_model=None)
def logout(body: LogoutRequest, db: Session = Depends(get_db)) -> None:
    service.logout(db, raw_refresh_token=body.refresh_token)


@router.get("/me", response_model=CurrentWorkflowUserResponse)
def get_me(current_user: WorkflowUser = Depends(get_current_workflow_user)) -> CurrentWorkflowUserResponse:
    return CurrentWorkflowUserResponse.model_validate(current_user)
