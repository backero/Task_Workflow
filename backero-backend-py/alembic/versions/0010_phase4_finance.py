"""phase 4 finance: invoices, transactions

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-14 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0010'
down_revision: str | None = '0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'invoices',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('invoice_number', sa.String(length=64), nullable=False),
        sa.Column(
            'type',
            sa.Enum('INVOICE', 'QUOTATION', 'PROFORMA', 'CREDIT_NOTE', 'DEBIT_NOTE', name='invoice_type'),
            nullable=False,
            server_default='INVOICE',
        ),
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED', name='invoice_status'),
            nullable=False,
            server_default='DRAFT',
        ),
        sa.Column('client_name', sa.String(length=255), nullable=False),
        sa.Column('client_email', sa.String(length=255), nullable=True),
        sa.Column('client_phone', sa.String(length=32), nullable=True),
        sa.Column('client_address', sa.Text(), nullable=True),
        sa.Column('client_gstin', sa.String(length=32), nullable=True),
        sa.Column('client_state', sa.String(length=128), nullable=True),
        sa.Column('client_state_code', sa.String(length=16), nullable=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='SET NULL'), nullable=True),
        sa.Column(
            'sample_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('lead_samples.id', ondelete='SET NULL'), nullable=True
        ),
        sa.Column('line_items', postgresql.JSONB(), nullable=True),
        sa.Column('subtotal', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_discount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_gst', sa.Float(), nullable=False, server_default='0'),
        sa.Column('round_off', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('paid_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('balance_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=8), nullable=False, server_default='INR'),
        sa.Column('issue_date', sa.Date(), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('paid_date', sa.Date(), nullable=True),
        sa.Column('payment_terms', sa.String(length=64), nullable=False, server_default='Net 30'),
        sa.Column('payment_history', postgresql.JSONB(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms', sa.Text(), nullable=True),
        sa.Column('signatory_name', sa.String(length=255), nullable=True),
        sa.Column('pdf_url', sa.String(length=1024), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_invoices_organization_id', 'invoices', ['organization_id'])
    op.create_index('ix_invoices_status', 'invoices', ['status'])
    op.create_index('ix_invoices_lead_id', 'invoices', ['lead_id'])

    op.create_table(
        'transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('type', sa.Enum('INCOME', 'EXPENSE', 'TRANSFER', name='transaction_type'), nullable=False),
        sa.Column('category', sa.String(length=128), nullable=False),
        sa.Column('sub_category', sa.String(length=128), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False, server_default='INR'),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column(
            'payment_method',
            sa.Enum('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER', name='payment_method'),
            nullable=False,
            server_default='BANK_TRANSFER',
        ),
        sa.Column('reference', sa.String(length=255), nullable=True),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('vendor_name', sa.String(length=255), nullable=True),
        sa.Column('vendor_contact', sa.String(length=255), nullable=True),
        sa.Column('vendor_gstin', sa.String(length=32), nullable=True),
        sa.Column('gst_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('tds_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('attachments', postgresql.JSONB(), nullable=True),
        sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('recurring_frequency', sa.String(length=32), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('approved_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_transactions_organization_id', 'transactions', ['organization_id'])
    op.create_index('ix_transactions_type', 'transactions', ['type'])
    op.create_index('ix_transactions_category', 'transactions', ['category'])
    op.create_index('ix_transactions_date', 'transactions', ['date'])


def downgrade() -> None:
    op.drop_index('ix_transactions_date', table_name='transactions')
    op.drop_index('ix_transactions_category', table_name='transactions')
    op.drop_index('ix_transactions_type', table_name='transactions')
    op.drop_index('ix_transactions_organization_id', table_name='transactions')
    op.drop_table('transactions')
    postgresql.ENUM(name='payment_method').drop(op.get_bind())
    postgresql.ENUM(name='transaction_type').drop(op.get_bind())

    op.drop_index('ix_invoices_lead_id', table_name='invoices')
    op.drop_index('ix_invoices_status', table_name='invoices')
    op.drop_index('ix_invoices_organization_id', table_name='invoices')
    op.drop_table('invoices')
    postgresql.ENUM(name='invoice_status').drop(op.get_bind())
    postgresql.ENUM(name='invoice_type').drop(op.get_bind())
