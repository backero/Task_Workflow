from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.documents import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.document import (
    CategoryCreateRequest,
    CategoryItem,
    DocumentCreateRequest,
    DocumentResponse,
    DocumentUpdateRequest,
    DocumentVersionCreateRequest,
    TrashEntryResponse,
)

router = APIRouter(prefix="/workflow/documents", tags=["workflow-documents"])


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[DocumentResponse]:
    return service.list_documents(db, org_id=current_user.organization_id)


@router.get("/categories", response_model=list[CategoryItem])
def get_categories(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[CategoryItem]:
    return service.get_categories(db, org_id=current_user.organization_id)


@router.post(
    "/categories",
    response_model=list[CategoryItem],
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def add_category(
    body: CategoryCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[CategoryItem]:
    return service.add_category(db, org_id=current_user.organization_id, name=body.name)


@router.delete(
    "/categories/{category_id}",
    response_model=list[CategoryItem],
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def delete_category(
    category_id: str,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[CategoryItem]:
    return service.delete_category(db, org_id=current_user.organization_id, category_id=category_id)


@router.get(
    "/trash", response_model=list[TrashEntryResponse], dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))]
)
def list_trash(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[TrashEntryResponse]:
    items = service.list_trash(db, org_id=current_user.organization_id)
    return [TrashEntryResponse.model_validate(i) for i in items]


@router.post(
    "/trash/{trash_id}/restore",
    response_model=DocumentResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def restore_trash(
    trash_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    return service.restore_trash(db, org_id=current_user.organization_id, actor=current_user, trash_id=trash_id)


@router.delete("/trash/{trash_id}", status_code=204, dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))])
def purge_trash(
    trash_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.purge_trash(db, org_id=current_user.organization_id, trash_id=trash_id)


@router.delete("/trash", dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))])
def empty_trash(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> dict[str, int]:
    count = service.empty_trash(db, org_id=current_user.organization_id)
    return {"purged": count}


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    return service.get_document(db, org_id=current_user.organization_id, document_id=document_id)


@router.post("", response_model=DocumentResponse, status_code=201)
def create_document(
    body: DocumentCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    return service.create_document(db, org_id=current_user.organization_id, actor=current_user, data=body)


@router.put("/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    return service.update_document(
        db, org_id=current_user.organization_id, actor=current_user, document_id=document_id, data=body
    )


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.soft_delete_document(db, org_id=current_user.organization_id, actor=current_user, document_id=document_id)


@router.post("/{document_id}/versions", response_model=DocumentResponse, status_code=201)
def add_version(
    document_id: uuid.UUID,
    body: DocumentVersionCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    return service.add_version(
        db, org_id=current_user.organization_id, actor=current_user, document_id=document_id, data=body
    )


@router.delete("/{document_id}/versions/{version_id}", response_model=DocumentResponse)
def delete_version(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    return service.delete_version(
        db, org_id=current_user.organization_id, actor=current_user, document_id=document_id, version_id=version_id
    )
