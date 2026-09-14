from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.task import TaskPriority, TaskStatus
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.tasks import dependency_service, service
from app.modules.workflow_auth.dependencies import (
    get_current_workflow_user,
    require_workflow_role,
)
from app.schemas.task import (
    ActiveTimerResponse,
    CompletionEligibilityResponse,
    DailyUpdateRequest,
    ExtensionRequestCreate,
    ExtensionRequestResponse,
    ExtensionReviewRequest,
    ReopenRequest,
    RequestCompletionRequest,
    SubtaskCreateRequest,
    TaskAnalyticsResponse,
    TaskCommentCreateRequest,
    TaskCommentResponse,
    TaskCreateRequest,
    TaskResponse,
    TaskTreeResponse,
    TaskUpdateRequest,
    TaskWithExtensionsResponse,
    TimerSessionResponse,
    UpdateNodePositionsRequest,
)
from app.schemas.task_approval import TaskApprovalResponse
from app.schemas.task_dependency import DependencyCreateRequest, DependencyResponse, TaskDependenciesResponse

router = APIRouter(prefix="/workflow/tasks", tags=["workflow-tasks"])


@router.get("", response_model=Page[TaskResponse])
def list_tasks(
    status: TaskStatus | None = Query(default=None),
    priority: TaskPriority | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
    assigned_to_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    archived: bool = Query(default=False),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[TaskResponse]:
    return service.list_tasks(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        page_params=page_params,
        status=status,
        priority=priority.value if priority else None,
        department_id=department_id,
        assigned_to_id=assigned_to_id,
        search=search,
        include_archived=archived,
    )


@router.get("/analytics", response_model=TaskAnalyticsResponse)
def get_analytics(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskAnalyticsResponse:
    return service.get_analytics(db, org_id=current_user.organization_id, actor=current_user)


@router.get(
    "/extension-requests",
    response_model=list[TaskWithExtensionsResponse],
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def list_extension_requests(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[TaskWithExtensionsResponse]:
    return service.list_extension_requests(db, org_id=current_user.organization_id, actor=current_user)


@router.get("/timer/active", response_model=ActiveTimerResponse | None)
def get_active_timer(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> ActiveTimerResponse | None:
    return service.get_active_timer(db, org_id=current_user.organization_id, actor=current_user)


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskResponse:
    task = service.get_task(db, org_id=current_user.organization_id, task_id=task_id)
    return TaskResponse.model_validate(task)


@router.post(
    "",
    response_model=TaskResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def create_task(
    body: TaskCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskResponse:
    task = service.create_task(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return TaskResponse.model_validate(task)


@router.put(
    "/{task_id}",
    response_model=TaskResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def update_task(
    task_id: uuid.UUID,
    body: TaskUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskResponse:
    task = service.update_task(db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, data=body)
    return TaskResponse.model_validate(task)


@router.post("/{task_id}/comment", response_model=TaskCommentResponse, status_code=201)
def add_comment(
    task_id: uuid.UUID,
    body: TaskCommentCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskCommentResponse:
    comment = service.add_comment(
        db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, data=body
    )
    return TaskCommentResponse.model_validate(comment)


@router.post("/{task_id}/request-completion", response_model=TaskApprovalResponse, status_code=201)
def request_completion(
    task_id: uuid.UUID,
    body: RequestCompletionRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskApprovalResponse:
    approval = service.request_completion(
        db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, notes=body.notes
    )
    return TaskApprovalResponse.model_validate(approval)


@router.get("/{task_id}/approvals", response_model=list[TaskApprovalResponse])
def get_task_approvals(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[TaskApprovalResponse]:
    return service.get_task_approvals(db, org_id=current_user.organization_id, task_id=task_id)


@router.post("/{task_id}/daily-update", response_model=TaskCommentResponse, status_code=201)
def add_daily_update(
    task_id: uuid.UUID,
    body: DailyUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskCommentResponse:
    comment = service.add_daily_update(
        db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, data=body
    )
    return TaskCommentResponse.model_validate(comment)


@router.post("/{task_id}/start", response_model=TaskResponse)
def start_task(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskResponse:
    task = service.start_task(db, org_id=current_user.organization_id, actor=current_user, task_id=task_id)
    return TaskResponse.model_validate(task)


@router.patch(
    "/{task_id}/archive",
    response_model=TaskResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def archive_task(
    task_id: uuid.UUID,
    undo: bool = Query(default=False),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskResponse:
    task = service.archive_task(db, org_id=current_user.organization_id, task_id=task_id, unarchive=undo)
    return TaskResponse.model_validate(task)


@router.delete(
    "/{task_id}",
    status_code=204,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def delete_task(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> None:
    service.delete_task(db, org_id=current_user.organization_id, task_id=task_id)


@router.post("/{task_id}/timer/start", response_model=TaskResponse)
def start_timer(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskResponse:
    task = service.start_timer(db, org_id=current_user.organization_id, actor=current_user, task_id=task_id)
    return TaskResponse.model_validate(task)


@router.post("/{task_id}/timer/stop", response_model=TimerSessionResponse)
def stop_timer(
    task_id: uuid.UUID,
    note: str | None = None,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TimerSessionResponse:
    session = service.stop_timer(
        db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, note=note
    )
    return TimerSessionResponse.model_validate(session)


@router.post("/{task_id}/extension-request", response_model=ExtensionRequestResponse, status_code=201)
def request_extension(
    task_id: uuid.UUID,
    body: ExtensionRequestCreate,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ExtensionRequestResponse:
    request = service.request_extension(
        db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, data=body
    )
    return ExtensionRequestResponse.model_validate(request)


@router.patch(
    "/{task_id}/extension-request/{request_id}",
    response_model=ExtensionRequestResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def review_extension_request(
    task_id: uuid.UUID,
    request_id: uuid.UUID,
    body: ExtensionReviewRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ExtensionRequestResponse:
    request = service.review_extension_request(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        task_id=task_id,
        request_id=request_id,
        status=body.status,
    )
    return ExtensionRequestResponse.model_validate(request)


# ── Phase 1d: subtask trees, dependencies, completion gating, reopen/achieve ──


@router.get("/{task_id}/tree", response_model=TaskTreeResponse)
def get_task_tree(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskTreeResponse:
    return service.get_task_tree(db, org_id=current_user.organization_id, task_id=task_id)


@router.post(
    "/{task_id}/subtask",
    response_model=TaskResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def add_subtask(
    task_id: uuid.UUID,
    body: SubtaskCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskResponse:
    subtask = service.add_subtask(
        db, org_id=current_user.organization_id, actor=current_user, parent_task_id=task_id, data=body
    )
    return TaskResponse.model_validate(subtask)


@router.get("/{task_id}/dependencies", response_model=TaskDependenciesResponse)
def get_task_dependencies(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskDependenciesResponse:
    incoming, outgoing = service.get_task_dependencies(db, org_id=current_user.organization_id, task_id=task_id)
    return TaskDependenciesResponse(
        incoming=[DependencyResponse.model_validate(d) for d in incoming],
        outgoing=[DependencyResponse.model_validate(d) for d in outgoing],
    )


@router.post("/dependencies", response_model=DependencyResponse, status_code=201)
def add_dependency(
    body: DependencyCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DependencyResponse:
    dep = dependency_service.add_dependency(
        db,
        org_id=current_user.organization_id,
        actor_id=current_user.id,
        from_task_id=body.from_task_id,
        to_task_id=body.to_task_id,
        dep_type=body.type,
    )
    return DependencyResponse.model_validate(dep)


@router.delete(
    "/dependencies/{dependency_id}",
    response_model=DependencyResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def remove_dependency(
    dependency_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DependencyResponse:
    dep = dependency_service.remove_dependency(
        db, org_id=current_user.organization_id, actor_id=current_user.id, dependency_id=dependency_id
    )
    return DependencyResponse.model_validate(dep)


@router.get("/{task_id}/completion-check", response_model=CompletionEligibilityResponse)
def check_completion(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> CompletionEligibilityResponse:
    eligible, reasons = service.get_completion_eligibility(db, org_id=current_user.organization_id, task_id=task_id)
    return CompletionEligibilityResponse(eligible=eligible, reasons=reasons)


@router.post(
    "/{task_id}/reopen",
    response_model=TaskResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def reopen_task(
    task_id: uuid.UUID,
    body: ReopenRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TaskResponse:
    task = service.reopen_task(
        db, org_id=current_user.organization_id, actor=current_user, task_id=task_id, reason=body.reason
    )
    return TaskResponse.model_validate(task)


@router.post(
    "/{task_id}/achieve",
    response_model=TaskResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def achieve_task(
    task_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> TaskResponse:
    task = service.achieve_task(db, org_id=current_user.organization_id, actor=current_user, task_id=task_id)
    return TaskResponse.model_validate(task)


@router.put("/nodes/positions", status_code=204)
def update_node_positions(
    body: UpdateNodePositionsRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.update_node_positions(db, org_id=current_user.organization_id, data=body)
