from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.reports import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.finance import (
    DepartmentProductivityRow,
    EmployeePerformanceRow,
    FinancialSummaryResponse,
    SalesConversionResponse,
)

router = APIRouter(
    prefix="/workflow/reports",
    tags=["workflow-reports"],
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)


@router.get("/employee-performance", response_model=list[EmployeePerformanceRow])
def get_employee_performance(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    department: uuid.UUID | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[EmployeePerformanceRow]:
    return service.get_employee_performance(
        db, org_id=current_user.organization_id, date_from=date_from, date_to=date_to, department_id=department
    )


@router.get("/department-productivity", response_model=list[DepartmentProductivityRow])
def get_department_productivity(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[DepartmentProductivityRow]:
    return service.get_department_productivity(db, org_id=current_user.organization_id)


@router.get("/sales-conversion", response_model=SalesConversionResponse)
def get_sales_conversion(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> SalesConversionResponse:
    return service.get_sales_conversion(db, org_id=current_user.organization_id, date_from=date_from, date_to=date_to)


@router.get("/financial-summary", response_model=FinancialSummaryResponse)
def get_financial_summary(
    year: int = Query(default_factory=lambda: datetime.now().year),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> FinancialSummaryResponse:
    return service.get_financial_summary(db, org_id=current_user.organization_id, year=year)
