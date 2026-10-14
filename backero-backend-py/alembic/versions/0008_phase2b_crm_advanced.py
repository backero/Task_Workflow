"""phase 2b crm advanced: product links, versioned formulas, versioned samples

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'lead_product_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column(
            'basis',
            sa.Enum("CUSTOMER_FORMULA", "HOUSE_FORMULA", "TO_BE_DEVELOPED", name='product_link_basis'),
            nullable=False,
            server_default='HOUSE_FORMULA',
        ),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('approx_price', sa.Float(), nullable=False, server_default='0'),
        sa.Column(
            'price_status',
            sa.Enum("NOT_QUOTED", "QUOTED", "ACCEPTED", name='product_link_price_status'),
            nullable=False,
            server_default='NOT_QUOTED',
        ),
        sa.Column(
            'payment_status',
            sa.Enum("PENDING", "FULL_PAID", name='product_payment_status'),
            nullable=False,
            server_default='PENDING',
        ),
        sa.Column('charge_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column(
            'payment_mode',
            sa.Enum("CASH", "UPI", "BANK_TRANSFER", name='product_payment_mode'),
            nullable=False,
            server_default='UPI',
        ),
        sa.Column('payment_txn_ref', sa.String(length=255), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('received_by', sa.String(length=255), nullable=True),
        sa.Column('payment_notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_lead_product_links_lead_id', 'lead_product_links', ['lead_id'])

    op.create_table(
        'lead_custom_formulas',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('formula_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('product_id', sa.String(length=64), nullable=True),
        sa.Column('product_link', sa.String(length=255), nullable=True),
        sa.Column('ref_weight', sa.Float(), nullable=False, server_default='100'),
        sa.Column('ref_unit', sa.Enum("GRAM", "KILOGRAM", "MILLILITER", "LITER", name='formula_ref_unit'), nullable=False, server_default='GRAM'),
        sa.Column('current_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('research_notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_lead_custom_formulas_lead_id', 'lead_custom_formulas', ['lead_id'])

    op.create_table(
        'lead_formula_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'formula_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('lead_custom_formulas.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum("DRAFT", "IN_TESTING", "ACCEPTED", "REJECTED", "ARCHIVED", name='formula_version_status'),
            nullable=False,
            server_default='IN_TESTING',
        ),
        sa.Column('cost_per_unit', sa.Float(), nullable=False, server_default='0'),
        sa.Column('procedure', sa.Text(), nullable=True),
        sa.Column('change_note', sa.Text(), nullable=True),
        sa.Column('rows', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_lead_formula_versions_formula_id', 'lead_formula_versions', ['formula_id'])

    op.create_table(
        'lead_samples',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sample_id', sa.String(length=64), nullable=False),
        sa.Column('formula_id', sa.String(length=64), nullable=True),
        sa.Column('formula_version_no', sa.Integer(), nullable=True),
        sa.Column('product_id', sa.String(length=64), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('chained_from', sa.String(length=64), nullable=True),
        sa.Column(
            'status',
            sa.Enum("REQUESTED", "IN_LAB", "SENT", "FEEDBACK", "APPROVED", "REJECTED", name='sample_status'),
            nullable=False,
            server_default='REQUESTED',
        ),
        sa.Column('courier', sa.String(length=128), nullable=True),
        sa.Column('awb', sa.String(length=128), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('packaging_confirmed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('approved_by_contact', sa.String(length=255), nullable=True),
        sa.Column('rejected_by_contact', sa.String(length=255), nullable=True),
        sa.Column('query_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('production_queries.id'), nullable=True),
        sa.Column('feedback_log', postgresql.JSONB(), nullable=True),
        sa.Column('timeline', postgresql.JSONB(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_lead_samples_lead_id', 'lead_samples', ['lead_id'])

    op.add_column('production_queries', sa.Column('linked_product_link_id', sa.String(length=64), nullable=True))
    op.add_column('production_queries', sa.Column('converted_to', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('production_queries', 'converted_to')
    op.drop_column('production_queries', 'linked_product_link_id')

    op.drop_index('ix_lead_samples_lead_id', table_name='lead_samples')
    op.drop_table('lead_samples')
    postgresql.ENUM(name='sample_status').drop(op.get_bind())

    op.drop_index('ix_lead_formula_versions_formula_id', table_name='lead_formula_versions')
    op.drop_table('lead_formula_versions')
    postgresql.ENUM(name='formula_version_status').drop(op.get_bind())

    op.drop_index('ix_lead_custom_formulas_lead_id', table_name='lead_custom_formulas')
    op.drop_table('lead_custom_formulas')
    postgresql.ENUM(name='formula_ref_unit').drop(op.get_bind())

    op.drop_index('ix_lead_product_links_lead_id', table_name='lead_product_links')
    op.drop_table('lead_product_links')
    postgresql.ENUM(name='product_payment_mode').drop(op.get_bind())
    postgresql.ENUM(name='product_payment_status').drop(op.get_bind())
    postgresql.ENUM(name='product_link_price_status').drop(op.get_bind())
    postgresql.ENUM(name='product_link_basis').drop(op.get_bind())
