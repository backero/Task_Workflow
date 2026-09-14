"""Document (+ DocumentVersion, DocumentFile, DocumentTrashEntry) — ported
from Task_Workflow's Mongoose `Document`/`DocumentTrash` models (Phase 2
core — the "Document Wallet" expiry-tracking feature). Embedded Mongo
subdocuments (versions, files, customFields) become real child tables.

Deliberately NOT included (needs the Google Drive OAuth integration, a
genuinely separate piece of work — uploads run through one admin's
*personal* connected Google account rather than a service account, to avoid
storage-quota limits): actual file upload/streaming (`DocumentFile.drive_id`/
`drive_link` stay nullable here so `add_version`/metadata-only rows work,
but nothing populates them yet), the Drive OAuth connect/callback/status
endpoints, and the expiry-reminder digest (ties into WhatsApp dispatch,
Phase 5). `DocumentTrash`'s Mongo `Mixed` snapshot fields (`doc`/`file`) —
used to fully restore a deleted row — become JSONB, since a snapshot is by
definition an opaque blob captured at delete time, not something queried.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Document(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "documents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Stores a WorkflowOrganization.document_categories[].id slug — free-text
    # by design (categories are org-defined, not a fixed enum), matching the
    # source's own plain-String `category` field.
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    doc_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(nullable=True, index=True)
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    keeper: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{key, value}, ...] free-form metadata — same JSONB reasoning as
    # elsewhere in this port for genuinely dynamic, never-filtered-on shapes.
    custom_fields: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class DocumentVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "document_versions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    v: Mapped[str] = mapped_column(String(32), nullable=False, default="v1.0")
    # Free-text label in the source (e.g. "renewed Jan 2026"), not a real
    # Date — kept as String to match; `Document.issue_date`/`expiry_date`
    # carry the actual queryable dates.
    version_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class DocumentFile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A file attached to a version. `drive_id`/`drive_link` stay nullable
    until the Google Drive integration lands — this table exists now so
    `document_versions` has somewhere real to point uploads once it does,
    rather than adding it in a second migration later."""

    __tablename__ = "document_files"

    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    drive_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    drive_link: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)


class DocumentTrashType(StrEnum):
    DOC = "doc"
    FILE = "file"


class DocumentTrashEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "document_trash"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    type: Mapped[DocumentTrashType] = mapped_column(
        SAEnum(DocumentTrashType, name="document_trash_type", native_enum=True), nullable=False
    )
    # type == DOC: a full document snapshot (incl. versions/files) for restore.
    doc_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    # type == FILE: the source document/version context, plus the file snapshot.
    doc_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    doc_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    version_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    file_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
