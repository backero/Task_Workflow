"""phase 2 core: leads, follow-ups, stage history, comm logs, production queries

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'leads',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False
        ),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=32), nullable=False),
        sa.Column('phone2', sa.String(length=32), nullable=True),
        sa.Column('whatsapp', sa.String(length=32), nullable=True),
        sa.Column('company', sa.String(length=255), nullable=True),
        sa.Column('designation', sa.String(length=128), nullable=True),
        sa.Column('city', sa.String(length=128), nullable=True),
        sa.Column('state', sa.String(length=128), nullable=True),
        sa.Column('business_type', sa.String(length=128), nullable=True),
        sa.Column('preferred_name', sa.String(length=128), nullable=True),
        sa.Column('language', sa.String(length=64), nullable=True),
        sa.Column('best_time', sa.String(length=64), nullable=True),
        sa.Column('team_size', sa.String(length=64), nullable=True),
        sa.Column('rapport_note', sa.Text(), nullable=True),
        sa.Column('source', sa.String(length=64), nullable=False, server_default='Manual Entry'),
        sa.Column('source_details', sa.String(length=255), nullable=True),
        sa.Column(
            'status',
            sa.Enum(
                'NEW', 'CONTACTED', 'INTERESTED', 'FOLLOWUP', 'SAMPLE', 'PROPOSAL', 'NEGOTIATION', 'QUERY_PENDING',
                'IN_PROGRESS', 'READY_TO_DISPATCH', 'DISPATCHED', 'WON', 'LOST', name='lead_status',
            ),
            nullable=False,
            server_default='NEW',
        ),
        sa.Column('pipeline', sa.String(length=64), nullable=False, server_default='default'),
        sa.Column(
            'priority',
            sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='lead_priority'),
            nullable=False,
            server_default='MEDIUM',
        ),
        sa.Column('product_interest', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('estimated_value', sa.Float(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=8), nullable=False, server_default='INR'),
        sa.Column('deal_value', sa.Float(), nullable=True),
        sa.Column('assigned_to_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('assigned_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('in_charge_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('campaign', sa.String(length=255), nullable=True),
        sa.Column('ad_set', sa.String(length=255), nullable=True),
        sa.Column('ad_id', sa.String(length=255), nullable=True),
        sa.Column('utm_source', sa.String(length=255), nullable=True),
        sa.Column('utm_medium', sa.String(length=255), nullable=True),
        sa.Column('last_contacted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_follow_up_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('converted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lost_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lost_reason', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('last_update_text', sa.Text(), nullable=True),
        sa.Column('last_update_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lead_time', sa.Integer(), nullable=True),
        sa.Column('in_progress_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('follow_up_reminders', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_reminder_sent', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_stale', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_leads_organization_id', 'leads', ['organization_id'])
    op.create_index('ix_leads_phone', 'leads', ['phone'])
    op.create_index('ix_leads_status', 'leads', ['status'])
    op.create_index('ix_leads_assigned_to_id', 'leads', ['assigned_to_id'])
    op.create_index('ix_leads_in_charge_id', 'leads', ['in_charge_id'])
    op.create_index('ix_leads_next_follow_up_at', 'leads', ['next_follow_up_at'])

    op.create_table(
        'lead_follow_ups',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'type',
            sa.Enum('CALL', 'WHATSAPP', 'MEETING', 'EMAIL', 'DEMO', 'OTHER', name='follow_up_type'),
            nullable=False,
            server_default='CALL',
        ),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('outcome', sa.String(length=255), nullable=True),
        sa.Column('next_action', sa.String(length=500), nullable=True),
        sa.Column('performed_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('is_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_lead_follow_ups_lead_id', 'lead_follow_ups', ['lead_id'])

    op.create_table(
        'lead_stage_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stage', sa.String(length=64), nullable=False),
        sa.Column('entered_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('exited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('moved_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
    )
    op.create_index('ix_lead_stage_history_lead_id', 'lead_stage_history', ['lead_id'])

    op.create_table(
        'lead_communication_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column(
            'type',
            sa.Enum('CALL', 'WHATSAPP', 'MEETING', 'EMAIL', 'OTHER', name='communication_log_type'),
            nullable=False,
            server_default='CALL',
        ),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('happened_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('added_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_lead_communication_logs_lead_id', 'lead_communication_logs', ['lead_id'])

    op.create_table(
        'production_queries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False
        ),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lead_name', sa.String(length=255), nullable=False),
        sa.Column('raised_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('assigned_to_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('asked_via', sa.String(length=64), nullable=False, server_default='Phone Call'),
        sa.Column('urgency', sa.Enum('LOW', 'MEDIUM', 'HIGH', name='query_urgency'), nullable=False, server_default='MEDIUM'),
        sa.Column('topic', sa.String(length=128), nullable=False, server_default='General'),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'IN_PROGRESS', 'ANSWERED', 'CLOSED', name='query_status'),
            nullable=False,
            server_default='PENDING',
        ),
        sa.Column('contact_name', sa.String(length=255), nullable=True),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('target_price', sa.Float(), nullable=True),
        sa.Column('benchmark_notes', sa.Text(), nullable=True),
        sa.Column('packaging_intent', sa.String(length=255), nullable=True),
        sa.Column('internal_notes', sa.Text(), nullable=True),
        sa.Column('pre_query_status', sa.String(length=64), nullable=True),
        sa.Column('answer', sa.Text(), nullable=True),
        sa.Column('answered_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('answered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_production_queries_organization_id', 'production_queries', ['organization_id'])
    op.create_index('ix_production_queries_lead_id', 'production_queries', ['lead_id'])
    op.create_index('ix_production_queries_assigned_to_id', 'production_queries', ['assigned_to_id'])
    op.create_index('ix_production_queries_status', 'production_queries', ['status'])


def downgrade() -> None:
    op.drop_index('ix_production_queries_status', table_name='production_queries')
    op.drop_index('ix_production_queries_assigned_to_id', table_name='production_queries')
    op.drop_index('ix_production_queries_lead_id', table_name='production_queries')
    op.drop_index('ix_production_queries_organization_id', table_name='production_queries')
    op.drop_table('production_queries')
    postgresql.ENUM(name='query_status').drop(op.get_bind())
    postgresql.ENUM(name='query_urgency').drop(op.get_bind())

    op.drop_index('ix_lead_communication_logs_lead_id', table_name='lead_communication_logs')
    op.drop_table('lead_communication_logs')
    postgresql.ENUM(name='communication_log_type').drop(op.get_bind())

    op.drop_index('ix_lead_stage_history_lead_id', table_name='lead_stage_history')
    op.drop_table('lead_stage_history')

    op.drop_index('ix_lead_follow_ups_lead_id', table_name='lead_follow_ups')
    op.drop_table('lead_follow_ups')
    postgresql.ENUM(name='follow_up_type').drop(op.get_bind())

    op.drop_index('ix_leads_next_follow_up_at', table_name='leads')
    op.drop_index('ix_leads_in_charge_id', table_name='leads')
    op.drop_index('ix_leads_assigned_to_id', table_name='leads')
    op.drop_index('ix_leads_status', table_name='leads')
    op.drop_index('ix_leads_phone', table_name='leads')
    op.drop_index('ix_leads_organization_id', table_name='leads')
    op.drop_table('leads')
    postgresql.ENUM(name='lead_priority').drop(op.get_bind())
    postgresql.ENUM(name='lead_status').drop(op.get_bind())
