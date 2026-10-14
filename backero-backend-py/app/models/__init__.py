"""Importing this package registers every model class on Base.metadata —
required for Alembic autogenerate/env.py to see all tables."""

from app.models.document import Document, DocumentFile, DocumentTrashEntry, DocumentVersion  # noqa: F401
from app.models.finance import Invoice, Transaction  # noqa: F401
from app.models.inventory import InventoryItem, StockMovement  # noqa: F401
from app.models.lead import (  # noqa: F401
    Lead,
    LeadCommunicationLog,
    LeadCustomFormula,
    LeadFollowUp,
    LeadFormulaVersion,
    LeadProductLink,
    LeadSample,
    LeadStageHistoryEntry,
)
from app.models.notification import Notification  # noqa: F401
from app.models.production import (  # noqa: F401
    CatalogFormulationVersion,
    CatalogProduct,
    ProductionCustomer,
    ProductionOrder,
    ProductionUsage,
)
from app.models.production_query import ProductionQuery  # noqa: F401
from app.models.task import (  # noqa: F401
    Task,
    TaskActivityLogEntry,
    TaskComment,
    TaskDependency,
    TaskExtensionRequest,
    TaskTimerSession,
)
from app.models.task_approval import TaskApproval  # noqa: F401
from app.models.team_reward import TeamReward  # noqa: F401
from app.models.workflow_department import WorkflowDepartment  # noqa: F401
from app.models.workflow_organization import WorkflowOrganization  # noqa: F401
from app.models.workflow_user import WorkflowRefreshToken, WorkflowUser  # noqa: F401
