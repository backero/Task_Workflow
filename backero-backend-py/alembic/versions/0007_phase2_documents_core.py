"""phase 2 documents core: documents, versions, files, trash

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False
        ),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=128), nullable=False),
        sa.Column('doc_no', sa.String(length=128), nullable=True),
        sa.Column('issue_date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('issuer', sa.String(length=255), nullable=True),
        sa.Column('keeper', sa.String(length=255), nullable=True),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('custom_fields', postgresql.JSONB(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_documents_organization_id', 'documents', ['organization_id'])
    op.create_index('ix_documents_category', 'documents', ['category'])
    op.create_index('ix_documents_expiry_date', 'documents', ['expiry_date'])

    op.create_table(
        'document_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column('v', sa.String(length=32), nullable=False, server_default='v1.0'),
        sa.Column('version_date', sa.String(length=64), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_document_versions_document_id', 'document_versions', ['document_id'])

    op.create_table(
        'document_files',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'version_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('document_versions.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('size', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('type', sa.String(length=128), nullable=True),
        sa.Column('url', sa.String(length=1024), nullable=True),
        sa.Column('drive_id', sa.String(length=255), nullable=True),
        sa.Column('drive_link', sa.String(length=1024), nullable=True),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_document_files_version_id', 'document_files', ['version_id'])

    op.create_table(
        'document_trash',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False
        ),
        sa.Column('type', sa.Enum('DOC', 'FILE', name='document_trash_type'), nullable=False),
        sa.Column('doc_snapshot', postgresql.JSONB(), nullable=True),
        sa.Column('doc_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id'), nullable=True),
        sa.Column('doc_name', sa.String(length=255), nullable=True),
        sa.Column('version_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('version_label', sa.String(length=32), nullable=True),
        sa.Column('file_snapshot', postgresql.JSONB(), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_document_trash_organization_id', 'document_trash', ['organization_id'])
    op.create_index('ix_document_trash_deleted_at', 'document_trash', ['deleted_at'])


def downgrade() -> None:
    op.drop_index('ix_document_trash_deleted_at', table_name='document_trash')
    op.drop_index('ix_document_trash_organization_id', table_name='document_trash')
    op.drop_table('document_trash')
    postgresql.ENUM(name='document_trash_type').drop(op.get_bind())

    op.drop_index('ix_document_files_version_id', table_name='document_files')
    op.drop_table('document_files')

    op.drop_index('ix_document_versions_document_id', table_name='document_versions')
    op.drop_table('document_versions')

    op.drop_index('ix_documents_expiry_date', table_name='documents')
    op.drop_index('ix_documents_category', table_name='documents')
    op.drop_index('ix_documents_organization_id', table_name='documents')
    op.drop_table('documents')
