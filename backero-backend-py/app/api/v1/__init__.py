"""Versioned API router. A future breaking change ships as app/api/v2/
alongside this package; existing v1 clients are unaffected."""

from fastapi import APIRouter

from app.modules.approvals.router import router as approvals_router
from app.modules.catalog.router import router as catalog_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.departments.router import router as departments_router
from app.modules.documents.router import router as documents_router
from app.modules.finance.router import router as finance_router
from app.modules.inventory.router import router as inventory_router
from app.modules.leads.router import router as leads_router
from app.modules.notifications.router import router as notifications_router
from app.modules.organization.router import router as organization_router
from app.modules.production.router import router as production_router
from app.modules.queries.router import router as queries_router
from app.modules.reports.router import router as reports_router
from app.modules.tasks.router import router as tasks_router
from app.modules.team_rewards.router import router as team_rewards_router
from app.modules.users.router import router as users_router
from app.modules.workflow_auth.router import router as workflow_auth_router

api_router = APIRouter()
api_router.include_router(workflow_auth_router)
api_router.include_router(tasks_router)
api_router.include_router(approvals_router)
api_router.include_router(users_router)
api_router.include_router(departments_router)
api_router.include_router(organization_router)
api_router.include_router(notifications_router)
api_router.include_router(team_rewards_router)
api_router.include_router(leads_router)
api_router.include_router(queries_router)
api_router.include_router(documents_router)
api_router.include_router(inventory_router)
api_router.include_router(catalog_router)
api_router.include_router(production_router)
api_router.include_router(finance_router)
api_router.include_router(reports_router)
api_router.include_router(dashboard_router)
