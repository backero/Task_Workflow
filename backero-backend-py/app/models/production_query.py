"""ProductionQuery — ported from Task_Workflow's Mongoose `ProductionQuery`
model (Phase 2 core, alongside Lead — the CRM "Q&A Inbox"). Phase 2b adds
`linked_product_link_id`/`converted_to`, stamped by `linkQuery` once the
Q&A tab's convert-to-action creates/links something for a query (a new
formula, a product link, a versioned sample). `linked_product_link_id` is a
loose string ref to `LeadProductLink.product_id` (matches the source's own
unvalidated subdocument-array ref, not a real FK). Deliberately still NOT
included: `linkedCatalogProductId` (Product Catalog is Phase 3), file
attachments (Cloudinary, deferred like every other upload endpoint)."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class QueryUrgency(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class QueryStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    ANSWERED = "answered"
    CLOSED = "closed"


class ProductionQuery(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "production_queries"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Denormalized so the Q&A inbox list doesn't need a join just to show
    # who the query is about — matches the source's own denormalization.
    lead_name: Mapped[str] = mapped_column(String(255), nullable=False)

    raised_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    asked_via: Mapped[str] = mapped_column(String(64), nullable=False, default="Phone Call")
    urgency: Mapped[QueryUrgency] = mapped_column(
        SAEnum(QueryUrgency, name="query_urgency", native_enum=True), nullable=False, default=QueryUrgency.MEDIUM
    )
    topic: Mapped[str] = mapped_column(String(128), nullable=False, default="General")
    status: Mapped[QueryStatus] = mapped_column(
        SAEnum(QueryStatus, name="query_status", native_enum=True),
        nullable=False,
        default=QueryStatus.PENDING,
        index=True,
    )

    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_price: Mapped[float | None] = mapped_column(nullable=True)
    benchmark_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    packaging_intent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshot of the lead's pipeline stage at the moment this query was
    # raised — used to restore the lead's status once answered.
    pre_query_status: Mapped[str | None] = mapped_column(String(64), nullable=True)

    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    linked_product_link_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    converted_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
