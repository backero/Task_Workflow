"""
WorkflowOrganization — multi-tenant root, ported from Task_Workflow's
Mongoose `Organization` model. Kept intentionally lean for Phase 1
(name/slug/email/phone/active only); Phase 6 (general org settings — GET/PUT
/organizations/me) added the profile/settings fields below. Still
deliberately excluded: WhatsApp session state, Google Sheets sync config
(→ CRM/Phase 2), bank details/invoice prefix (→ Finance/Phase 4), and
social-automation API keys (→ Marketing/Phase 5) — those belong to whichever
phase actually ports that domain, added as additive columns then.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class OrganizationPlan(StrEnum):
    TRIAL = "trial"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class WorkflowOrganization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "workflow_organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Deliberately no FK constraint: workflow_users.organization_id already
    # FKs the other way, and this field is set post-creation (mirrors the
    # source's register() sequencing: create org -> create admin user ->
    # update org.createdBy) — a real FK here would be circular at
    # table-creation time for a field that's never joined on.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Phase 6: general profile/settings.
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    plan: Mapped[OrganizationPlan] = mapped_column(
        SAEnum(OrganizationPlan, name="organization_plan", native_enum=True),
        nullable=False,
        default=OrganizationPlan.TRIAL,
    )
    plan_expiry: Mapped[date | None] = mapped_column(nullable=True)
    # {street, city, state, country, pincode} — kept as JSONB rather than
    # flat columns since it's a simple display-only address block, never
    # queried/filtered on (see the plan's cross-cutting JSONB decision).
    address: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    # {currency, timezone, dateFormat, workingDays[], workingHours{start,end},
    # enableWhatsApp, enableEmailNotifications, maxTasksPerEmployee, ...} —
    # same JSONB reasoning as address.
    settings: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    document_categories: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
