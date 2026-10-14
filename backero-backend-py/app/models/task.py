"""
Task (+ TaskComment, TaskActivityLogEntry, TaskTimerSession,
TaskExtensionRequest, TaskDependency) — ported from Task_Workflow's Mongoose
`Task`/`TaskDependency` models. Embedded Mongo subdocuments (comments,
activity log, timer sessions, extension requests) become real child tables
with FKs here, not JSON blobs — a genuine relational redesign, not a
mechanical copy.

Phase 1 shipped the core CRUD/approval slice; Phase 1b completed timers/
extension-requests; Phase 1d (this file's subtask-tree + dependency
additions) is the Workflow Builder. Still deliberately NOT included:
isDeptHub/pendingHubApproval/hubApproval, pendingManagerAssignment (Phase 1b
approval-routing variants that depend on the dept-hub concept, not yet
built), relatedTo (polymorphic Lead/ProductionOrder/Campaign link — none of
those domains exist yet), isRecurring/recurringConfig, attachments/
proofOfWork, WorkflowTemplate (save/apply — deferred, layered on top of a
working tree+dependency system), the React-Flow auto-layout graph builder
(presentation-layer positioning, belongs in the frontend not the API).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import ARRAY, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class TaskStatus(StrEnum):
    """Ported verbatim from TASK_STATUS (backero-backend/src/utils/
    constants.js) — kept as the full 10-value set even though Phase 1's
    endpoints only ever assign a subset, so a Phase 1b feature (e.g.
    REOPENED) never needs a migration to add a missing enum value."""

    PENDING = "Pending"
    ASSIGNED = "Assigned"
    IN_PROGRESS = "In Progress"
    UNDER_REVIEW = "Under Review"
    CHANGES_REQUESTED = "Changes Requested"
    APPROVAL_PENDING = "Approval Pending"
    COMPLETED = "Completed"
    ACHIEVED = "Achieved"
    REOPENED = "Reopened"
    CANCELLED = "Cancelled"


class TaskPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
    URGENT = "urgent"


class Task(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tasks"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_departments.id"), nullable=True, index=True
    )
    task_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    platform: Mapped[str | None] = mapped_column(String(64), nullable=True)

    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True, index=True
    )
    assigned_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=False
    )
    reporting_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )

    # Subtask tree (Phase 1d / Workflow Builder) — mirrors the source's
    # parentTask/subTasks[]/level/autoProgress/completionLocked/
    # completionLockReasons/workflowData{x,y}. `subTasks[]` isn't stored
    # separately here — it's just the reverse FK query on parent_task_id.
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True, index=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    auto_progress: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    completion_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completion_lock_reasons: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    workflow_x: Mapped[float | None] = mapped_column(nullable=True)
    workflow_y: Mapped[float | None] = mapped_column(nullable=True)

    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus, name="task_status", native_enum=True), nullable=False, default=TaskStatus.PENDING, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        SAEnum(TaskPriority, name="task_priority", native_enum=True),
        nullable=False,
        default=TaskPriority.MEDIUM,
        index=True,
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    due_date: Mapped[date | None] = mapped_column(nullable=True, index=True)
    start_date: Mapped[date | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_hours: Mapped[float | None] = mapped_column(nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(nullable=True)

    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    rejection_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=False
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )

    # Timer (Phase 1b) — mirrors the source's embedded `activeTimer{startedAt,
    # user}` + `totalTrackedMs`; individual sessions live in TaskTimerSession
    # below rather than an embedded array.
    active_timer_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active_timer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    total_tracked_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class TaskCommentType(StrEnum):
    COMMENT = "comment"
    DAILY_UPDATE = "daily_update"


class TaskComment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "task_comments"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    comment_type: Mapped[TaskCommentType] = mapped_column(
        SAEnum(TaskCommentType, name="task_comment_type", native_enum=True),
        nullable=False,
        default=TaskCommentType.COMMENT,
    )
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hours_worked: Mapped[float | None] = mapped_column(nullable=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TaskActivityLogEntry(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "task_activity_log"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    performed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TaskTimerSession(Base, UUIDPrimaryKeyMixin):
    """A single completed start/stop timer session — the source's
    `Task.timerSessions[]` embedded array becomes this child table."""

    __tablename__ = "task_timer_sessions"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stopped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class TaskExtensionStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TaskExtensionRequest(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "task_extension_requests"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=False
    )
    original_due_date: Mapped[date | None] = mapped_column(nullable=True)
    requested_due_date: Mapped[date] = mapped_column(nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskExtensionStatus] = mapped_column(
        SAEnum(TaskExtensionStatus, name="task_extension_status", native_enum=True),
        nullable=False,
        default=TaskExtensionStatus.PENDING,
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskDependencyType(StrEnum):
    FINISH_TO_START = "finish_to_start"
    START_TO_START = "start_to_start"
    FINISH_TO_FINISH = "finish_to_finish"
    START_TO_FINISH = "start_to_finish"


class TaskDependencyStatus(StrEnum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    WAIVED = "waived"


class TaskDependency(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """fromTask must finish before toTask can be completed (or the
    start/finish variant per `type`) — ported from TaskDependency.js."""

    __tablename__ = "task_dependencies"
    __table_args__ = (UniqueConstraint("from_task_id", "to_task_id", name="uq_task_dependencies_from_to"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    from_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[TaskDependencyType] = mapped_column(
        SAEnum(TaskDependencyType, name="task_dependency_type", native_enum=True),
        nullable=False,
        default=TaskDependencyType.FINISH_TO_START,
    )
    status: Mapped[TaskDependencyStatus] = mapped_column(
        SAEnum(TaskDependencyStatus, name="task_dependency_status", native_enum=True),
        nullable=False,
        default=TaskDependencyStatus.ACTIVE,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
