"""Request/response schemas for the CRM Q&A Inbox (ProductionQuery, Phase 2 core)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.production_query import QueryStatus, QueryUrgency


class QueryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=255)
    description: str = Field(min_length=1)
    asked_via: str | None = Field(default=None, max_length=64)
    urgency: QueryUrgency = QueryUrgency.MEDIUM
    topic: str | None = Field(default=None, max_length=128)
    assigned_to_id: uuid.UUID | None = None
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    target_price: float | None = None
    benchmark_notes: str | None = None
    packaging_intent: str | None = Field(default=None, max_length=255)
    internal_notes: str | None = None
    # Logging the answer in the same step resolves the query immediately
    # instead of leaving it open for a separate reply (matches the source).
    answer: str | None = None


class QueryUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    topic: str | None = Field(default=None, max_length=128)
    asked_via: str | None = Field(default=None, max_length=64)


class QueryAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1)


class QueryStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: QueryStatus


class QuerySetDeletedRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deleted: bool


class QueryLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_link_id: str | None = Field(default=None, max_length=64)
    converted_to: str | None = Field(default=None, max_length=64)


class QueryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    lead_id: uuid.UUID
    lead_name: str
    raised_by_id: uuid.UUID | None
    assigned_to_id: uuid.UUID | None
    title: str
    description: str
    asked_via: str
    urgency: QueryUrgency
    topic: str
    status: QueryStatus
    contact_name: str | None
    contact_email: str | None
    target_price: float | None
    benchmark_notes: str | None
    packaging_intent: str | None
    internal_notes: str | None
    pre_query_status: str | None
    answer: str | None
    answered_by_id: uuid.UUID | None
    answered_at: datetime | None
    edited_at: datetime | None
    deleted: bool
    linked_product_link_id: str | None
    converted_to: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
