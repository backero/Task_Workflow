"""Request/response schemas for the Document Wallet (Phase 2 core)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import DocumentTrashType


class DocumentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=128)
    doc_no: str | None = Field(default=None, max_length=128)
    issue_date: date | None = None
    expiry_date: date | None = None
    issuer: str | None = Field(default=None, max_length=255)
    keeper: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    custom_fields: list[dict[str, object]] | None = None


class DocumentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, min_length=1, max_length=128)
    doc_no: str | None = Field(default=None, max_length=128)
    issue_date: date | None = None
    expiry_date: date | None = None
    issuer: str | None = Field(default=None, max_length=255)
    keeper: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    custom_fields: list[dict[str, object]] | None = None


class DocumentFileResponse(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    name: str
    size: int
    type: str | None
    url: str | None
    drive_id: str | None
    drive_link: str | None
    label: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentVersionResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    v: str
    version_date: str | None
    note: str | None
    files: list[DocumentFileResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentVersionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    v: str | None = Field(default=None, max_length=32)
    version_date: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=500)
    expiry_date: date | None = None


class DocumentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    category: str
    doc_no: str | None
    issue_date: date | None
    expiry_date: date | None
    issuer: str | None
    keeper: str | None
    location: str | None
    notes: str | None
    custom_fields: list[dict[str, object]] | None
    versions: list[DocumentVersionResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryItem(BaseModel):
    id: str
    name: str


class CategoryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)


class TrashEntryResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    type: DocumentTrashType
    doc_snapshot: dict[str, object] | None
    doc_id: uuid.UUID | None
    doc_name: str | None
    version_id: uuid.UUID | None
    version_label: str | None
    file_snapshot: dict[str, object] | None
    deleted_by_id: uuid.UUID | None
    deleted_at: datetime

    model_config = ConfigDict(from_attributes=True)
