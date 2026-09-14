"""Document Wallet business logic — ported from documentWallet.controller.js's
core endpoints (documents CRUD, categories, trash/restore/purge, version
metadata). Deliberately NOT ported: file upload/streaming, the Google Drive
OAuth connect flow, and the expiry-reminder digest — see app/models/document.py.

`Document.custom_fields`/version `files[]` are real relational reads here,
so responses are built by hand (`_build_document_response`) rather than via
a bare `DocumentResponse.model_validate(document)` — there's no SQLAlchemy
`relationship()` wired up (deliberately, to keep the ORM layer simple; every
other module in this port also fetches children with explicit queries
rather than relationships)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.models.document import (
    Document,
    DocumentFile,
    DocumentTrashEntry,
    DocumentTrashType,
    DocumentVersion,
)
from app.models.workflow_organization import WorkflowOrganization
from app.models.workflow_user import WorkflowUser
from app.schemas.document import (
    CategoryItem,
    DocumentCreateRequest,
    DocumentFileResponse,
    DocumentResponse,
    DocumentUpdateRequest,
    DocumentVersionCreateRequest,
    DocumentVersionResponse,
)


def _parse_snapshot_date(value: object) -> date | None:
    if not value:
        return None
    return date.fromisoformat(str(value))


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "category"


def _get_categories(org: WorkflowOrganization) -> list[dict[str, object]]:
    raw = org.document_categories or []
    return list(raw)


def get_categories(db: Session, *, org_id: uuid.UUID) -> list[CategoryItem]:
    org = db.get(WorkflowOrganization, org_id)
    if org is None:
        raise NotFoundError("Organization not found.")
    return [CategoryItem(id=str(c["id"]), name=str(c["name"])) for c in _get_categories(org)]


def add_category(db: Session, *, org_id: uuid.UUID, name: str) -> list[CategoryItem]:
    org = db.get(WorkflowOrganization, org_id)
    if org is None:
        raise NotFoundError("Organization not found.")

    categories = _get_categories(org)
    existing_ids = {str(c["id"]) for c in categories}
    base = _slugify(name)
    cat_id = base
    suffix = 2
    while cat_id in existing_ids:
        cat_id = f"{base}-{suffix}"
        suffix += 1

    categories.append({"id": cat_id, "name": name.strip()})
    org.document_categories = categories
    db.commit()
    return [CategoryItem(id=str(c["id"]), name=str(c["name"])) for c in categories]


def delete_category(db: Session, *, org_id: uuid.UUID, category_id: str) -> list[CategoryItem]:
    org = db.get(WorkflowOrganization, org_id)
    if org is None:
        raise NotFoundError("Organization not found.")

    org.document_categories = [c for c in _get_categories(org) if str(c["id"]) != category_id]
    db.commit()
    return [CategoryItem(id=str(c["id"]), name=str(c["name"])) for c in org.document_categories or []]


def _build_document_response(db: Session, *, document: Document) -> DocumentResponse:
    versions = (
        db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document.id)
            .order_by(DocumentVersion.created_at.asc())
        )
        .scalars()
        .all()
    )
    version_responses = []
    for version in versions:
        files = db.execute(select(DocumentFile).where(DocumentFile.version_id == version.id)).scalars().all()
        version_responses.append(
            DocumentVersionResponse(
                id=version.id,
                document_id=version.document_id,
                v=version.v,
                version_date=version.version_date,
                note=version.note,
                files=[DocumentFileResponse.model_validate(f) for f in files],
                created_at=version.created_at,
            )
        )

    return DocumentResponse(
        id=document.id,
        organization_id=document.organization_id,
        name=document.name,
        category=document.category,
        doc_no=document.doc_no,
        issue_date=document.issue_date,
        expiry_date=document.expiry_date,
        issuer=document.issuer,
        keeper=document.keeper,
        location=document.location,
        notes=document.notes,
        custom_fields=document.custom_fields,
        versions=version_responses,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def _get_document_or_404(db: Session, *, org_id: uuid.UUID, document_id: uuid.UUID) -> Document:
    document = db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    ).scalar_one_or_none()
    if document is None:
        raise NotFoundError("Document not found.")
    return document


def list_documents(db: Session, *, org_id: uuid.UUID) -> list[DocumentResponse]:
    documents = (
        db.execute(select(Document).where(Document.organization_id == org_id).order_by(Document.name.asc()))
        .scalars()
        .all()
    )
    return [_build_document_response(db, document=d) for d in documents]


def get_document(db: Session, *, org_id: uuid.UUID, document_id: uuid.UUID) -> DocumentResponse:
    document = _get_document_or_404(db, org_id=org_id, document_id=document_id)
    return _build_document_response(db, document=document)


def create_document(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: DocumentCreateRequest
) -> DocumentResponse:
    document = Document(
        organization_id=org_id,
        name=data.name,
        category=data.category,
        doc_no=data.doc_no,
        issue_date=data.issue_date,
        expiry_date=data.expiry_date,
        issuer=data.issuer,
        keeper=data.keeper,
        location=data.location,
        notes=data.notes,
        custom_fields=data.custom_fields,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return _build_document_response(db, document=document)


def update_document(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, document_id: uuid.UUID, data: DocumentUpdateRequest
) -> DocumentResponse:
    document = _get_document_or_404(db, org_id=org_id, document_id=document_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(document, field, value)
    document.updated_by_id = actor.id
    db.commit()
    db.refresh(document)
    return _build_document_response(db, document=document)


def _snapshot_document(db: Session, *, document: Document) -> dict[str, object]:
    versions = db.execute(select(DocumentVersion).where(DocumentVersion.document_id == document.id)).scalars().all()
    version_snapshots = []
    for version in versions:
        files = db.execute(select(DocumentFile).where(DocumentFile.version_id == version.id)).scalars().all()
        version_snapshots.append(
            {
                "v": version.v,
                "version_date": version.version_date,
                "note": version.note,
                "files": [
                    {
                        "name": f.name,
                        "size": f.size,
                        "type": f.type,
                        "url": f.url,
                        "drive_id": f.drive_id,
                        "drive_link": f.drive_link,
                        "label": f.label,
                    }
                    for f in files
                ],
            }
        )
    return {
        "name": document.name,
        "category": document.category,
        "doc_no": document.doc_no,
        "issue_date": document.issue_date.isoformat() if document.issue_date else None,
        "expiry_date": document.expiry_date.isoformat() if document.expiry_date else None,
        "issuer": document.issuer,
        "keeper": document.keeper,
        "location": document.location,
        "notes": document.notes,
        "custom_fields": document.custom_fields,
        "versions": version_snapshots,
    }


def soft_delete_document(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, document_id: uuid.UUID) -> None:
    document = _get_document_or_404(db, org_id=org_id, document_id=document_id)
    snapshot = _snapshot_document(db, document=document)

    db.add(
        DocumentTrashEntry(
            organization_id=org_id,
            type=DocumentTrashType.DOC,
            doc_snapshot=snapshot,
            deleted_by_id=actor.id,
            deleted_at=datetime.now(UTC),
        )
    )
    db.delete(document)  # cascades to document_versions/document_files
    db.commit()


def list_trash(db: Session, *, org_id: uuid.UUID) -> list[DocumentTrashEntry]:
    return list(
        db.execute(
            select(DocumentTrashEntry)
            .where(DocumentTrashEntry.organization_id == org_id)
            .order_by(DocumentTrashEntry.deleted_at.desc())
        )
        .scalars()
        .all()
    )


def _get_trash_or_404(db: Session, *, org_id: uuid.UUID, trash_id: uuid.UUID) -> DocumentTrashEntry:
    item = db.execute(
        select(DocumentTrashEntry).where(
            DocumentTrashEntry.id == trash_id, DocumentTrashEntry.organization_id == org_id
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Trash item not found.")
    return item


def restore_trash(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, trash_id: uuid.UUID) -> DocumentResponse:
    item = _get_trash_or_404(db, org_id=org_id, trash_id=trash_id)

    if item.type == DocumentTrashType.DOC:
        snapshot = item.doc_snapshot or {}
        document = Document(
            organization_id=org_id,
            name=str(snapshot.get("name", "Restored document")),
            category=str(snapshot.get("category", "")),
            doc_no=snapshot.get("doc_no"),
            issue_date=_parse_snapshot_date(snapshot.get("issue_date")),
            expiry_date=_parse_snapshot_date(snapshot.get("expiry_date")),
            issuer=snapshot.get("issuer"),
            keeper=snapshot.get("keeper"),
            location=snapshot.get("location"),
            notes=snapshot.get("notes"),
            custom_fields=snapshot.get("custom_fields"),
            updated_by_id=actor.id,
        )
        db.add(document)
        db.flush()

        version_snapshots = cast("list[dict[str, object]]", snapshot.get("versions") or [])
        for version_snapshot in version_snapshots:
            new_version = DocumentVersion(
                document_id=document.id,
                v=str(version_snapshot.get("v", "v1.0")),
                version_date=cast("str | None", version_snapshot.get("version_date")),
                note=cast("str | None", version_snapshot.get("note")),
            )
            db.add(new_version)
            db.flush()
            file_snapshots = cast("list[dict[str, object]]", version_snapshot.get("files") or [])
            for file_snapshot in file_snapshots:
                db.add(
                    DocumentFile(
                        version_id=new_version.id,
                        name=str(file_snapshot.get("name", "file")),
                        size=int(cast("int | str", file_snapshot.get("size") or 0)),
                        type=cast("str | None", file_snapshot.get("type")),
                        url=cast("str | None", file_snapshot.get("url")),
                        drive_id=cast("str | None", file_snapshot.get("drive_id")),
                        drive_link=cast("str | None", file_snapshot.get("drive_link")),
                        label=cast("str | None", file_snapshot.get("label")),
                    )
                )

        db.delete(item)
        db.commit()
        db.refresh(document)
        return _build_document_response(db, document=document)

    # type == FILE
    if item.doc_id is None:
        raise NotFoundError("Original document no longer exists.")
    document = _get_document_or_404(db, org_id=org_id, document_id=item.doc_id)

    version: DocumentVersion | None = None
    if item.version_id is not None:
        version = db.execute(
            select(DocumentVersion).where(
                DocumentVersion.id == item.version_id, DocumentVersion.document_id == document.id
            )
        ).scalar_one_or_none()
    if version is None:
        version = DocumentVersion(
            document_id=document.id, v=item.version_label or "v1.0", note="Restored from Recycle Bin"
        )
        db.add(version)
        db.flush()

    snapshot = item.file_snapshot or {}
    db.add(
        DocumentFile(
            version_id=version.id,
            name=str(snapshot.get("name", "file")),
            size=int(cast("int | str", snapshot.get("size") or 0)),
            type=cast("str | None", snapshot.get("type")),
            url=cast("str | None", snapshot.get("url")),
            drive_id=cast("str | None", snapshot.get("drive_id")),
            drive_link=cast("str | None", snapshot.get("drive_link")),
            label=cast("str | None", snapshot.get("label")),
        )
    )
    document.updated_by_id = actor.id

    db.delete(item)
    db.commit()
    db.refresh(document)
    return _build_document_response(db, document=document)


def purge_trash(db: Session, *, org_id: uuid.UUID, trash_id: uuid.UUID) -> None:
    # No Drive-file deletion here (unlike the source) since Phase 2 core has
    # no Google Drive integration yet — nothing in trash can have a live
    # drive_id until that lands.
    item = _get_trash_or_404(db, org_id=org_id, trash_id=trash_id)
    db.delete(item)
    db.commit()


def empty_trash(db: Session, *, org_id: uuid.UUID) -> int:
    items = db.execute(select(DocumentTrashEntry).where(DocumentTrashEntry.organization_id == org_id)).scalars().all()
    count = len(items)
    for item in items:
        db.delete(item)
    db.commit()
    return count


def add_version(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, document_id: uuid.UUID, data: DocumentVersionCreateRequest
) -> DocumentResponse:
    document = _get_document_or_404(db, org_id=org_id, document_id=document_id)

    existing_count = db.execute(
        select(func.count(DocumentVersion.id)).where(DocumentVersion.document_id == document.id)
    ).scalar_one()
    version = DocumentVersion(
        document_id=document.id,
        v=data.v or f"v{existing_count + 1}.0",
        version_date=data.version_date or datetime.now(UTC).date().isoformat(),
        note=data.note,
    )
    db.add(version)

    if data.expiry_date is not None:
        document.expiry_date = data.expiry_date
    document.updated_by_id = actor.id

    db.commit()
    db.refresh(document)
    return _build_document_response(db, document=document)


def delete_version(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, document_id: uuid.UUID, version_id: uuid.UUID
) -> DocumentResponse:
    document = _get_document_or_404(db, org_id=org_id, document_id=document_id)
    version = db.execute(
        select(DocumentVersion).where(DocumentVersion.id == version_id, DocumentVersion.document_id == document.id)
    ).scalar_one_or_none()
    if version is None:
        raise NotFoundError("Version not found.")

    has_files = db.execute(
        select(DocumentFile.id).where(DocumentFile.version_id == version.id).limit(1)
    ).scalar_one_or_none()
    if has_files is not None:
        raise AppError("version_has_files", "Version has files — remove them individually first", status_code=400)

    db.delete(version)
    document.updated_by_id = actor.id
    db.commit()
    db.refresh(document)
    return _build_document_response(db, document=document)
