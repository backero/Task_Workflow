"""Dashboard aggregation — ported from dashboard.controller.js's 4 read-only
composite views. Every sub-section here is already independently available
through another module's own list/analytics endpoint (tasks, leads
pipeline/analytics, inventory analytics, production stats, notifications);
this module just re-composes the same underlying tables into the single
combined payload the source's dashboard pages expect, so the frontend
doesn't have to fire a dozen separate requests on load.

Response shape is deliberately `dict[str, object]` rather than an
exhaustively-typed Pydantic model — the source's own payload is a large,
UI-shaped composite of five-plus domains with no independent consumers
beyond the dashboard page itself (unlike Invoice/Transaction, nothing else
in this port reads a dashboard response back), so a fully typed schema
would mostly restate field names without adding real safety. `Invoice` is
imported by the source's dashboard.controller.js but never actually used
in any query there (dead import) — not reproduced here."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.finance import Transaction, TransactionType
from app.models.inventory import InventoryItem
from app.models.lead import Lead
from app.models.notification import Notification, NotificationPriority
from app.models.production import CatalogProduct, ProductionOrder
from app.models.production_query import ProductionQuery, QueryStatus
from app.models.task import Task, TaskStatus
from app.models.task_approval import ApprovalStatus, TaskApproval
from app.models.workflow_department import WorkflowDepartment
from app.models.workflow_user import WorkflowUser

_OPEN_TASK_STATUSES = (TaskStatus.COMPLETED, TaskStatus.ACHIEVED)


def _user_name(user: WorkflowUser | None) -> str:
    return f"{user.first_name} {user.last_name}" if user is not None else "Unknown"


def _finance_section(db: Session, *, org_id: uuid.UUID) -> dict[str, object]:
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).date()
    month_start = now.replace(day=1).date()
    six_months_ago = (now - timedelta(days=182)).date()

    def _totals(start: object) -> dict[str, float]:
        rows = db.execute(
            select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.organization_id == org_id, Transaction.date >= start)
            .group_by(Transaction.type)
        ).all()
        by_type = {t.value: float(total or 0) for t, total in rows}
        return {"income": by_type.get("income", 0.0), "expense": by_type.get("expense", 0.0)}

    today_totals = _totals(today_start)
    month_totals = _totals(month_start)

    total_revenue = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.organization_id == org_id, Transaction.type == TransactionType.INCOME
        )
    ).scalar_one()

    trend_rows = db.execute(
        select(
            func.extract("year", Transaction.date),
            func.extract("month", Transaction.date),
            func.sum(Transaction.amount),
        )
        .where(
            Transaction.organization_id == org_id,
            Transaction.type == TransactionType.INCOME,
            Transaction.date >= six_months_ago,
        )
        .group_by(func.extract("year", Transaction.date), func.extract("month", Transaction.date))
        .order_by(func.extract("year", Transaction.date), func.extract("month", Transaction.date))
    ).all()
    month_names = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]  # fmt: skip
    revenue_chart = [{"month": month_names[int(m) - 1], "revenue": float(total or 0)} for _, m, total in trend_rows]

    return {
        "today_income": today_totals["income"],
        "today_expense": today_totals["expense"],
        "today_net": today_totals["income"] - today_totals["expense"],
        "month_income": month_totals["income"],
        "month_expense": month_totals["expense"],
        "month_net": month_totals["income"] - month_totals["expense"],
        "total_revenue": float(total_revenue or 0),
        "revenue_chart": revenue_chart,
    }


def get_founder_dashboard(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> dict[str, object]:
    tasks = db.execute(select(Task).where(Task.organization_id == org_id, Task.is_archived.is_(False))).scalars().all()
    today = datetime.now(UTC).date()

    status_counts: dict[str, int] = {}
    overdue = 0
    for task in tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1
        if task.due_date is not None and task.due_date < today and task.status not in _OPEN_TASK_STATUSES:
            overdue += 1

    leads = db.execute(select(Lead).where(Lead.organization_id == org_id)).scalars().all()
    lead_status_counts: dict[str, int] = {}
    for lead in leads:
        lead_status_counts[lead.status.value] = lead_status_counts.get(lead.status.value, 0) + 1

    low_stock_count = db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.organization_id == org_id,
            InventoryItem.is_active.is_(True),
            InventoryItem.current_stock <= InventoryItem.min_stock_level,
        )
    ).scalar_one()
    total_products = db.execute(
        select(func.count(InventoryItem.id)).where(InventoryItem.organization_id == org_id)
    ).scalar_one()
    active_products = db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True)
        )
    ).scalar_one()
    catalog_product_count = db.execute(
        select(func.count(CatalogProduct.id)).where(CatalogProduct.organization_id == org_id)
    ).scalar_one()
    inventory_value = db.execute(
        select(func.coalesce(func.sum(InventoryItem.current_stock * InventoryItem.cost_price), 0)).where(
            InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True)
        )
    ).scalar_one()

    active_order_count = db.execute(
        select(func.count(ProductionOrder.id)).where(
            ProductionOrder.organization_id == org_id, ProductionOrder.stage < 7
        )
    ).scalar_one()
    stage_rows = db.execute(
        select(ProductionOrder.stage, func.count(ProductionOrder.id))
        .where(ProductionOrder.organization_id == org_id, ProductionOrder.stage.between(2, 7))
        .group_by(ProductionOrder.stage)
    ).all()

    departments = (
        db.execute(select(WorkflowDepartment).where(WorkflowDepartment.organization_id == org_id)).scalars().all()
    )
    dept_stats = []
    for dept in departments:
        dept_tasks = [t for t in tasks if t.department_id == dept.id]
        completed = sum(1 for t in dept_tasks if t.status in _OPEN_TASK_STATUSES)
        dept_stats.append({"department": dept.name, "total": len(dept_tasks), "completed": completed})

    completed_by_user: dict[uuid.UUID, int] = {}
    for task in tasks:
        if task.status in _OPEN_TASK_STATUSES and task.assigned_to_id is not None:
            completed_by_user[task.assigned_to_id] = completed_by_user.get(task.assigned_to_id, 0) + 1
    top_employees = []
    for user_id, count in sorted(completed_by_user.items(), key=lambda kv: kv[1], reverse=True)[:6]:
        user = db.get(WorkflowUser, user_id)
        top_employees.append({"user_id": str(user_id), "name": _user_name(user), "completed": count})

    pending_approvals = (
        db.execute(
            select(TaskApproval)
            .where(TaskApproval.organization_id == org_id, TaskApproval.status == ApprovalStatus.PENDING)
            .order_by(TaskApproval.created_at.desc())
            .limit(20)
        )
        .scalars()
        .all()
    )

    recent_alerts = (
        db.execute(
            select(Notification)
            .where(
                Notification.organization_id == org_id,
                Notification.recipient_id == actor.id,
                Notification.is_read.is_(False),
                Notification.priority.in_([NotificationPriority.HIGH]),
            )
            .order_by(Notification.created_at.desc())
            .limit(10)
        )
        .scalars()
        .all()
    )

    recent_tasks = (
        db.execute(select(Task).where(Task.organization_id == org_id).order_by(Task.created_at.desc()).limit(8))
        .scalars()
        .all()
    )

    active_employee_count = db.execute(
        select(func.count(WorkflowUser.id)).where(
            WorkflowUser.organization_id == org_id, WorkflowUser.is_active.is_(True)
        )
    ).scalar_one()

    technical_queries = (
        db.execute(
            select(ProductionQuery)
            .where(ProductionQuery.organization_id == org_id, ProductionQuery.status == QueryStatus.PENDING)
            .order_by(ProductionQuery.created_at.desc())
            .limit(6)
        )
        .scalars()
        .all()
    )
    pending_query_count = db.execute(
        select(func.count(ProductionQuery.id)).where(
            ProductionQuery.organization_id == org_id, ProductionQuery.status == QueryStatus.PENDING
        )
    ).scalar_one()

    return {
        "finance": _finance_section(db, org_id=org_id),
        "company": {
            "task_status_counts": status_counts,
            "overdue_tasks": overdue,
            "active_employees": active_employee_count,
        },
        "crm": {"total_leads": len(leads), "lead_status_counts": lead_status_counts},
        "inventory": {
            "low_stock_count": low_stock_count,
            "total_products": total_products,
            "active_products": active_products,
            "catalog_product_count": catalog_product_count,
            "inventory_value": float(inventory_value or 0),
        },
        "production": {
            "active_order_count": active_order_count,
            "stage_counts": {str(stage): count for stage, count in stage_rows},
        },
        "departments": dept_stats,
        "top_employees": top_employees,
        "pending_approvals": [
            {"id": str(a.id), "task_id": str(a.task_id), "requested_by_id": str(a.requested_by_id)}
            for a in pending_approvals
        ],
        "recent_alerts": [{"id": str(n.id), "title": n.title, "message": n.message} for n in recent_alerts],
        "recent_tasks": [{"id": str(t.id), "title": t.title, "status": t.status.value} for t in recent_tasks],
        "technical_queries": {
            "items": [{"id": str(q.id), "title": q.title, "lead_name": q.lead_name} for q in technical_queries],
            "pending_count": pending_query_count,
        },
    }


def get_manager_dashboard(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> dict[str, object]:
    conditions = [Task.organization_id == org_id, Task.is_archived.is_(False)]
    if actor.department_id is not None:
        conditions.append(Task.department_id == actor.department_id)
    tasks = db.execute(select(Task).where(*conditions)).scalars().all()

    status_counts: dict[str, int] = {}
    for task in tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1

    pending_approvals = db.execute(
        select(func.count(TaskApproval.id)).where(
            TaskApproval.organization_id == org_id, TaskApproval.status == ApprovalStatus.PENDING
        )
    ).scalar_one()

    low_stock_count = db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.organization_id == org_id,
            InventoryItem.is_active.is_(True),
            InventoryItem.current_stock <= InventoryItem.min_stock_level,
        )
    ).scalar_one()

    team_conditions = [WorkflowUser.organization_id == org_id, WorkflowUser.is_active.is_(True)]
    if actor.department_id is not None:
        team_conditions.append(WorkflowUser.department_id == actor.department_id)
    team_size = db.execute(select(func.count(WorkflowUser.id)).where(*team_conditions)).scalar_one()

    pending_query_count = db.execute(
        select(func.count(ProductionQuery.id)).where(
            ProductionQuery.organization_id == org_id, ProductionQuery.status == QueryStatus.PENDING
        )
    ).scalar_one()

    return {
        "task_status_counts": status_counts,
        "pending_approvals": pending_approvals,
        "low_stock_count": low_stock_count,
        "team_size": team_size,
        "pending_query_count": pending_query_count,
    }


def get_employee_dashboard(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> dict[str, object]:
    tasks = (
        db.execute(select(Task).where(Task.organization_id == org_id, Task.assigned_to_id == actor.id)).scalars().all()
    )
    status_counts: dict[str, int] = {}
    for task in tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1

    unread_notifications = db.execute(
        select(func.count(Notification.id)).where(
            Notification.recipient_id == actor.id, Notification.is_read.is_(False)
        )
    ).scalar_one()

    my_queries = (
        db.execute(
            select(ProductionQuery)
            .where(ProductionQuery.organization_id == org_id, ProductionQuery.raised_by_id == actor.id)
            .order_by(ProductionQuery.created_at.desc())
            .limit(10)
        )
        .scalars()
        .all()
    )

    return {
        "task_status_counts": status_counts,
        "total_tasks": len(tasks),
        "unread_notifications": unread_notifications,
        "my_queries": [{"id": str(q.id), "title": q.title, "status": q.status.value} for q in my_queries],
    }


def get_department_dashboard(db: Session, *, org_id: uuid.UUID, department_id: uuid.UUID) -> dict[str, object]:
    tasks = (
        db.execute(select(Task).where(Task.organization_id == org_id, Task.department_id == department_id))
        .scalars()
        .all()
    )
    status_counts: dict[str, int] = {}
    for task in tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1

    member_count = db.execute(
        select(func.count(WorkflowUser.id)).where(
            WorkflowUser.organization_id == org_id,
            WorkflowUser.department_id == department_id,
            WorkflowUser.is_active.is_(True),
        )
    ).scalar_one()

    return {"task_status_counts": status_counts, "total_tasks": len(tasks), "member_count": member_count}
