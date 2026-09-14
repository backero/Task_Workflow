"""Manager-level reports — ported from report.routes.js's 4 read-only
aggregation routes. The whole file was gated `authorizeManagerOrAbove` in
the source; each endpoint carries that same role dependency at the router
level.

`sales-conversion`'s "won"/"converted" proxy hardcodes `LeadStatus.WON`
(the source's `'Payment Pending'` string) — same convention already
established in `leads/service.py`'s analytics, not a new decision here."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.finance import Transaction
from app.models.lead import Lead, LeadStatus
from app.models.task import Task, TaskStatus
from app.models.workflow_department import WorkflowDepartment
from app.models.workflow_user import WorkflowUser
from app.schemas.finance import (
    ConversionByEmployeeRow,
    DepartmentProductivityRow,
    EmployeePerformanceRow,
    FinancialSummaryResponse,
    LeadsBySourceRow,
    LeadsByStatusRow,
    MonthlyFinancialRow,
    SalesConversionResponse,
)

_OPEN_TASK_STATUSES = (TaskStatus.COMPLETED, TaskStatus.ACHIEVED)


def get_employee_performance(
    db: Session, *, org_id: uuid.UUID, date_from: date | None, date_to: date | None, department_id: uuid.UUID | None
) -> list[EmployeePerformanceRow]:
    conditions = [Task.organization_id == org_id, Task.assigned_to_id.isnot(None)]
    if date_from is not None:
        conditions.append(Task.created_at >= date_from)
    if date_to is not None:
        conditions.append(Task.created_at <= date_to)
    if department_id is not None:
        conditions.append(Task.department_id == department_id)

    today = datetime.now(UTC).date()
    tasks = db.execute(select(Task).where(*conditions)).scalars().all()

    by_user: dict[uuid.UUID, dict[str, float]] = {}
    for task in tasks:
        assignee = task.assigned_to_id
        if assignee is None:
            continue
        bucket = by_user.setdefault(
            assignee, {"total": 0, "completed": 0, "overdue": 0, "progress_sum": 0, "rejections": 0}
        )
        bucket["total"] += 1
        if task.status in (TaskStatus.COMPLETED, TaskStatus.ACHIEVED):
            bucket["completed"] += 1
        if task.due_date is not None and task.due_date < today and task.status not in _OPEN_TASK_STATUSES:
            bucket["overdue"] += 1
        bucket["progress_sum"] += task.progress
        bucket["rejections"] += task.rejection_count

    result: list[EmployeePerformanceRow] = []
    for user_id, bucket in sorted(by_user.items(), key=lambda kv: kv[1]["completed"] / kv[1]["total"], reverse=True):
        user = db.get(WorkflowUser, user_id)
        name = f"{user.first_name} {user.last_name}" if user is not None else "Unknown"
        total = int(bucket["total"])
        completed = int(bucket["completed"])
        result.append(
            EmployeePerformanceRow(
                user_id=user_id,
                name=name,
                total_tasks=total,
                completed=completed,
                overdue=int(bucket["overdue"]),
                avg_progress=round(bucket["progress_sum"] / total, 1) if total else 0,
                rejections=int(bucket["rejections"]),
                completion_rate=round(completed / total * 100, 1) if total else 0,
            )
        )
    return result


def get_department_productivity(db: Session, *, org_id: uuid.UUID) -> list[DepartmentProductivityRow]:
    tasks = db.execute(select(Task).where(Task.organization_id == org_id)).scalars().all()
    today = datetime.now(UTC).date()

    by_dept: dict[uuid.UUID | None, dict[str, int]] = {}
    for task in tasks:
        bucket = by_dept.setdefault(task.department_id, {"total": 0, "completed": 0, "overdue": 0, "pending": 0})
        bucket["total"] += 1
        if task.status in (TaskStatus.COMPLETED, TaskStatus.ACHIEVED):
            bucket["completed"] += 1
        if task.due_date is not None and task.due_date < today and task.status not in _OPEN_TASK_STATUSES:
            bucket["overdue"] += 1
        if task.status in (TaskStatus.PENDING, TaskStatus.ASSIGNED):
            bucket["pending"] += 1

    result: list[DepartmentProductivityRow] = []
    for dept_id, bucket in sorted(by_dept.items(), key=lambda kv: kv[1]["completed"] / kv[1]["total"], reverse=True):
        dept_name = None
        if dept_id is not None:
            dept = db.get(WorkflowDepartment, dept_id)
            dept_name = dept.name if dept is not None else None
        total = bucket["total"]
        result.append(
            DepartmentProductivityRow(
                department=dept_name,
                total=total,
                completed=bucket["completed"],
                overdue=bucket["overdue"],
                pending=bucket["pending"],
                completion_rate=round(bucket["completed"] / total * 100, 1) if total else 0,
            )
        )
    return result


def get_sales_conversion(
    db: Session, *, org_id: uuid.UUID, date_from: date | None, date_to: date | None
) -> SalesConversionResponse:
    conditions = [Lead.organization_id == org_id]
    if date_from is not None:
        conditions.append(Lead.created_at >= date_from)
    if date_to is not None:
        conditions.append(Lead.created_at <= date_to)
    leads = db.execute(select(Lead).where(*conditions)).scalars().all()

    by_status: dict[str, dict[str, float]] = {}
    by_source: dict[str, dict[str, int]] = {}
    by_employee: dict[uuid.UUID, dict[str, float]] = {}

    for lead in leads:
        status_bucket = by_status.setdefault(lead.status.value, {"count": 0, "value": 0})
        status_bucket["count"] += 1
        status_bucket["value"] += lead.estimated_value or 0

        source_bucket = by_source.setdefault(lead.source, {"count": 0, "converted": 0})
        source_bucket["count"] += 1
        if lead.status == LeadStatus.WON:
            source_bucket["converted"] += 1

        if lead.assigned_to_id is not None:
            emp_bucket = by_employee.setdefault(lead.assigned_to_id, {"total": 0, "won": 0, "value": 0})
            emp_bucket["total"] += 1
            if lead.status == LeadStatus.WON:
                emp_bucket["won"] += 1
                emp_bucket["value"] += lead.deal_value if lead.deal_value is not None else 0

    conversion_rows = []
    for user_id, bucket in by_employee.items():
        user = db.get(WorkflowUser, user_id)
        name = f"{user.first_name} {user.last_name}" if user is not None else "Unknown"
        conversion_rows.append(
            ConversionByEmployeeRow(
                user_id=user_id, name=name, total=int(bucket["total"]), won=int(bucket["won"]), value=bucket["value"]
            )
        )

    return SalesConversionResponse(
        leads_by_status=[
            LeadsByStatusRow(status=s, count=int(b["count"]), value=b["value"]) for s, b in by_status.items()
        ],
        leads_by_source=[
            LeadsBySourceRow(source=s, count=b["count"], converted=b["converted"]) for s, b in by_source.items()
        ],
        conversion_by_employee=conversion_rows,
    )


def get_financial_summary(db: Session, *, org_id: uuid.UUID, year: int) -> FinancialSummaryResponse:
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    rows = db.execute(
        select(func.extract("month", Transaction.date), Transaction.type, func.sum(Transaction.amount))
        .where(Transaction.organization_id == org_id, Transaction.date >= start, Transaction.date <= end)
        .group_by(func.extract("month", Transaction.date), Transaction.type)
        .order_by(func.extract("month", Transaction.date))
    ).all()
    monthly_data = [MonthlyFinancialRow(month=int(month), type=t, total=float(total or 0)) for month, t, total in rows]
    return FinancialSummaryResponse(monthly_data=monthly_data, year=year)
