"""phase 3 inventory + production core

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'inventory_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('sku', sa.String(length=64), nullable=False),
        sa.Column('barcode', sa.String(length=128), nullable=True),
        sa.Column('category', sa.String(length=128), nullable=False),
        sa.Column('sub_category', sa.String(length=128), nullable=True),
        sa.Column('unit', sa.String(length=32), nullable=False, server_default='pcs'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('images', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('cost_price', sa.Float(), nullable=False, server_default='0'),
        sa.Column('selling_price', sa.Float(), nullable=False, server_default='0'),
        sa.Column('mrp', sa.Float(), nullable=False, server_default='0'),
        sa.Column('gst_rate', sa.Float(), nullable=False, server_default='18'),
        sa.Column('hsn_code', sa.String(length=32), nullable=True),
        sa.Column('batch_number', sa.String(length=128), nullable=True),
        sa.Column('last_stock_in', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_stock', sa.Float(), nullable=False, server_default='0'),
        sa.Column('min_stock_level', sa.Float(), nullable=False, server_default='0'),
        sa.Column('max_stock_level', sa.Float(), nullable=True),
        sa.Column('reorder_point', sa.Float(), nullable=False, server_default='0'),
        sa.Column('reorder_quantity', sa.Float(), nullable=False, server_default='0'),
        sa.Column('warehouse_location', sa.String(length=128), nullable=True),
        sa.Column('shelf', sa.String(length=64), nullable=True),
        sa.Column('supplier', sa.String(length=255), nullable=True),
        sa.Column('enable_min_stock', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('batches', postgresql.JSONB(), nullable=True),
        sa.Column('qc_checker', sa.String(length=255), nullable=True),
        sa.Column('qc_number', sa.String(length=128), nullable=True),
        sa.Column('ref_check_number', sa.String(length=128), nullable=True),
        sa.Column('qc_passed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('qc_notes', sa.Text(), nullable=True),
        sa.Column('product_type', sa.String(length=128), nullable=True),
        sa.Column('shelf_life', sa.Float(), nullable=True),
        sa.Column('certifications', sa.Text(), nullable=True),
        sa.Column('storage_conditions', sa.Text(), nullable=True),
        sa.Column('variants', postgresql.JSONB(), nullable=True),
        sa.Column('is_raw_material', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_finished_good', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_sellable', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('marketplace_listings', postgresql.JSONB(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_inventory_items_organization_id', 'inventory_items', ['organization_id'])
    op.create_index('ix_inventory_items_sku', 'inventory_items', ['sku'])
    op.create_index('ix_inventory_items_category', 'inventory_items', ['category'])
    op.create_index('ix_inventory_items_current_stock', 'inventory_items', ['current_stock'])
    op.create_index('ix_inventory_items_is_raw_material', 'inventory_items', ['is_raw_material'])
    op.create_index('ix_inventory_items_is_active', 'inventory_items', ['is_active'])

    op.create_table(
        'stock_movements',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('product_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_items.id'), nullable=False),
        sa.Column(
            'type',
            sa.Enum('IN', 'OUT', 'ADJUSTMENT', 'SALE', 'PRODUCTION_USE', 'PRODUCTION_OUTPUT', 'QUALITY_TEST', 'RETURN', name='stock_movement_type'),
            nullable=False,
        ),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('previous_stock', sa.Float(), nullable=False),
        sa.Column('new_stock', sa.Float(), nullable=False),
        sa.Column('unit_price', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_value', sa.Float(), nullable=False, server_default='0'),
        sa.Column('reference_type', sa.String(length=64), nullable=True),
        sa.Column('reference_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('reference_number', sa.String(length=128), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('batch', sa.String(length=128), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('warehouse', sa.String(length=128), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_stock_movements_organization_id', 'stock_movements', ['organization_id'])
    op.create_index('ix_stock_movements_product_id', 'stock_movements', ['product_id'])
    op.create_index('ix_stock_movements_type', 'stock_movements', ['type'])

    op.create_table(
        'catalog_products',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=128), nullable=False),
        sa.Column('sub_category', sa.String(length=128), nullable=True),
        sa.Column('type', sa.String(length=64), nullable=True),
        sa.Column('unit', sa.String(length=32), nullable=False, server_default='ml'),
        sa.Column('weight', sa.Float(), nullable=False, server_default='0'),
        sa.Column('gst_rate', sa.Float(), nullable=False, server_default='18'),
        sa.Column('hsn_code', sa.String(length=32), nullable=True),
        sa.Column('shelf_life', sa.Float(), nullable=False, server_default='0'),
        sa.Column('status', sa.Enum('ACTIVE', 'DISCONTINUED', name='catalog_product_status'), nullable=False, server_default='ACTIVE'),
        sa.Column('discontinued_date', sa.Date(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('storage', sa.Text(), nullable=True),
        sa.Column('certifications', sa.Text(), nullable=True),
        sa.Column('barcode', sa.String(length=128), nullable=True),
        sa.Column('image', sa.String(length=1024), nullable=True),
        sa.Column('formulation', postgresql.JSONB(), nullable=True),
        sa.Column('variants', postgresql.JSONB(), nullable=True),
        sa.Column('standard_assumptions', postgresql.JSONB(), nullable=True),
        sa.Column('rnd', postgresql.JSONB(), nullable=True),
        sa.Column('rnd_doc', postgresql.JSONB(), nullable=True),
        sa.Column('research_guide', postgresql.JSONB(), nullable=True),
        sa.Column('procedure', postgresql.JSONB(), nullable=True),
        sa.Column('documents', postgresql.JSONB(), nullable=True),
        sa.Column('production_overhead', postgresql.JSONB(), nullable=True),
        sa.Column('packaging', postgresql.JSONB(), nullable=True),
        sa.Column('costing', postgresql.JSONB(), nullable=True),
        sa.Column('marketplace', postgresql.JSONB(), nullable=True),
        sa.Column('history', postgresql.JSONB(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_catalog_products_organization_id', 'catalog_products', ['organization_id'])
    op.create_index('ix_catalog_products_code', 'catalog_products', ['code'])
    op.create_index('ix_catalog_products_category', 'catalog_products', ['category'])
    op.create_index('ix_catalog_products_status', 'catalog_products', ['status'])

    op.create_table(
        'catalog_formulation_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'catalog_product_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('catalog_products.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('version_label', sa.String(length=32), nullable=False),
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'TESTING', 'LOCKED', 'ARCHIVED', name='catalog_formulation_version_status'),
            nullable=False,
            server_default='DRAFT',
        ),
        sa.Column('ref_weight', sa.Float(), nullable=False, server_default='100'),
        sa.Column('ref_unit', sa.String(length=16), nullable=False, server_default='ml'),
        sa.Column('rows', postgresql.JSONB(), nullable=True),
        sa.Column('change_notes', sa.Text(), nullable=True),
        sa.Column('rnd_doc_text', sa.Text(), nullable=True),
        sa.Column('research_guide_text', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('activated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_catalog_formulation_versions_catalog_product_id', 'catalog_formulation_versions', ['catalog_product_id'])

    op.create_table(
        'production_customers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('contact', sa.String(length=255), nullable=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='SET NULL'), nullable=True),
        sa.Column('default_container', sa.String(length=255), nullable=True),
        sa.Column('saved_crm_spec', postgresql.JSONB(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_production_customers_organization_id', 'production_customers', ['organization_id'])

    op.create_table(
        'production_orders',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('order_number', sa.String(length=64), nullable=False),
        sa.Column('procurement_id', sa.String(length=64), nullable=True),
        sa.Column('weighing_id', sa.String(length=64), nullable=True),
        sa.Column('bulk_qc_id', sa.String(length=64), nullable=True),
        sa.Column('packaging_id', sa.String(length=64), nullable=True),
        sa.Column('final_qc_id', sa.String(length=64), nullable=True),
        sa.Column('finished_product_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_items.id'), nullable=True),
        sa.Column('planned_quantity', sa.Float(), nullable=False, server_default='0'),
        sa.Column('completed_quantity', sa.Float(), nullable=False, server_default='0'),
        sa.Column('rejected_quantity', sa.Float(), nullable=False, server_default='0'),
        sa.Column('unit', sa.String(length=32), nullable=False, server_default='pcs'),
        sa.Column('batch', sa.String(length=128), nullable=False),
        sa.Column(
            'status',
            sa.Enum(
                'PLANNED', 'MATERIAL_ALLOCATED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'PACKAGING', 'COMPLETED', 'CANCELLED',
                name='production_order_status',
            ),
            nullable=False,
            server_default='PLANNED',
        ),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='SET NULL'), nullable=True),
        sa.Column('catalog_product_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('catalog_products.id'), nullable=True),
        sa.Column('batch_size_kg', sa.Float(), nullable=True),
        sa.Column('stage', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('customer', sa.String(length=255), nullable=True),
        sa.Column('contact', sa.String(length=255), nullable=True),
        sa.Column('container', sa.String(length=255), nullable=True),
        sa.Column('priority', sa.Enum('LOW', 'NORMAL', 'HIGH', 'URGENT', name='production_order_priority'), nullable=False, server_default='NORMAL'),
        sa.Column('delivery_date', sa.String(length=32), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('crm_spec', postgresql.JSONB(), nullable=True),
        sa.Column('ingredients', postgresql.JSONB(), nullable=True),
        sa.Column('work_assignment', postgresql.JSONB(), nullable=True),
        sa.Column('process_steps', postgresql.JSONB(), nullable=True),
        sa.Column('bulk_qc', postgresql.JSONB(), nullable=True),
        sa.Column('packaging', postgresql.JSONB(), nullable=True),
        sa.Column('final_qc', postgresql.JSONB(), nullable=True),
        sa.Column('dispatch_record', postgresql.JSONB(), nullable=True),
        sa.Column('bom', postgresql.JSONB(), nullable=True),
        sa.Column('planned_start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('planned_end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('assigned_to_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('supervised_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('quality_checks', postgresql.JSONB(), nullable=True),
        sa.Column(
            'quality_status',
            sa.Enum('PENDING', 'PASSED', 'FAILED', 'CONDITIONAL', name='production_quality_status'),
            nullable=False,
            server_default='PENDING',
        ),
        sa.Column('lab_notes', sa.Text(), nullable=True),
        sa.Column('formula_version', sa.String(length=32), nullable=True),
        sa.Column('packaging_notes', sa.Text(), nullable=True),
        sa.Column('packaging_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('estimated_cost', sa.Float(), nullable=False, server_default='0'),
        sa.Column('actual_cost', sa.Float(), nullable=False, server_default='0'),
        sa.Column('attachments', postgresql.JSONB(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_production_orders_organization_id', 'production_orders', ['organization_id'])
    op.create_index('ix_production_orders_status', 'production_orders', ['status'])
    op.create_index('ix_production_orders_lead_id', 'production_orders', ['lead_id'])
    op.create_index('ix_production_orders_stage', 'production_orders', ['stage'])

    op.create_table(
        'production_usages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False),
        sa.Column('issue_number', sa.String(length=32), nullable=False),
        sa.Column('type', sa.Enum('ISSUE', 'RETURN', name='production_usage_type'), nullable=False),
        sa.Column('material_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_items.id'), nullable=False),
        sa.Column('material_code', sa.String(length=64), nullable=True),
        sa.Column('material_name', sa.String(length=255), nullable=True),
        sa.Column('unit', sa.String(length=32), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('purpose', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('taken_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('return_of_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('production_usages.id'), nullable=True),
        sa.Column('production_order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('production_orders.id'), nullable=True),
        sa.Column('batch_deductions', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_production_usages_organization_id', 'production_usages', ['organization_id'])
    op.create_index('ix_production_usages_material_id', 'production_usages', ['material_id'])


def downgrade() -> None:
    op.drop_index('ix_production_usages_material_id', table_name='production_usages')
    op.drop_index('ix_production_usages_organization_id', table_name='production_usages')
    op.drop_table('production_usages')
    postgresql.ENUM(name='production_usage_type').drop(op.get_bind())

    op.drop_index('ix_production_orders_stage', table_name='production_orders')
    op.drop_index('ix_production_orders_lead_id', table_name='production_orders')
    op.drop_index('ix_production_orders_status', table_name='production_orders')
    op.drop_index('ix_production_orders_organization_id', table_name='production_orders')
    op.drop_table('production_orders')
    postgresql.ENUM(name='production_quality_status').drop(op.get_bind())
    postgresql.ENUM(name='production_order_priority').drop(op.get_bind())
    postgresql.ENUM(name='production_order_status').drop(op.get_bind())

    op.drop_index('ix_production_customers_organization_id', table_name='production_customers')
    op.drop_table('production_customers')

    op.drop_index('ix_catalog_formulation_versions_catalog_product_id', table_name='catalog_formulation_versions')
    op.drop_table('catalog_formulation_versions')
    postgresql.ENUM(name='catalog_formulation_version_status').drop(op.get_bind())

    op.drop_index('ix_catalog_products_status', table_name='catalog_products')
    op.drop_index('ix_catalog_products_category', table_name='catalog_products')
    op.drop_index('ix_catalog_products_code', table_name='catalog_products')
    op.drop_index('ix_catalog_products_organization_id', table_name='catalog_products')
    op.drop_table('catalog_products')
    postgresql.ENUM(name='catalog_product_status').drop(op.get_bind())

    op.drop_index('ix_stock_movements_type', table_name='stock_movements')
    op.drop_index('ix_stock_movements_product_id', table_name='stock_movements')
    op.drop_index('ix_stock_movements_organization_id', table_name='stock_movements')
    op.drop_table('stock_movements')
    postgresql.ENUM(name='stock_movement_type').drop(op.get_bind())

    op.drop_index('ix_inventory_items_is_active', table_name='inventory_items')
    op.drop_index('ix_inventory_items_is_raw_material', table_name='inventory_items')
    op.drop_index('ix_inventory_items_current_stock', table_name='inventory_items')
    op.drop_index('ix_inventory_items_category', table_name='inventory_items')
    op.drop_index('ix_inventory_items_sku', table_name='inventory_items')
    op.drop_index('ix_inventory_items_organization_id', table_name='inventory_items')
    op.drop_table('inventory_items')
