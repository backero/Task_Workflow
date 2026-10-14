"""phase 6: organization settings, notifications, team rewards

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('workflow_organizations', sa.Column('logo_url', sa.String(length=1024), nullable=True))
    op.add_column('workflow_organizations', sa.Column('gst_number', sa.String(length=32), nullable=True))
    # add_column doesn't get the same before_create DDL dispatch create_table
    # does, so an inline sa.Enum(...) here never issues its own CREATE TYPE —
    # unlike every earlier migration's enum columns, which were all added via
    # create_table. Create the type explicitly first.
    organization_plan = postgresql.ENUM('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', name='organization_plan')
    organization_plan.create(op.get_bind())
    op.add_column(
        'workflow_organizations',
        sa.Column('plan', organization_plan, nullable=False, server_default='TRIAL'),
    )
    op.add_column('workflow_organizations', sa.Column('plan_expiry', sa.Date(), nullable=True))
    op.add_column('workflow_organizations', sa.Column('address', postgresql.JSONB(), nullable=True))
    op.add_column('workflow_organizations', sa.Column('settings', postgresql.JSONB(), nullable=True))
    op.add_column('workflow_organizations', sa.Column('document_categories', postgresql.JSONB(), nullable=True))

    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False
        ),
        sa.Column(
            'recipient_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('workflow_users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column(
            'type',
            sa.Enum(
                'TASK', 'APPROVAL', 'CRM', 'INVENTORY', 'PRODUCTION', 'FINANCE', 'SYSTEM', 'ESCALATION', 'REMINDER',
                'REWARD', name='notification_type',
            ),
            nullable=False,
            server_default='SYSTEM',
        ),
        sa.Column(
            'priority',
            sa.Enum('LOW', 'MEDIUM', 'HIGH', name='notification_priority'),
            nullable=False,
            server_default='MEDIUM',
        ),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('action_url', sa.String(length=512), nullable=True),
        sa.Column('reference_type', sa.String(length=64), nullable=True),
        sa.Column('reference_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('channel_in_app', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('channel_whatsapp', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('channel_email', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notification_metadata', postgresql.JSONB(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_notifications_organization_id', 'notifications', ['organization_id'])
    op.create_index('ix_notifications_recipient_id', 'notifications', ['recipient_id'])
    op.create_index('ix_notifications_recipient_unread', 'notifications', ['recipient_id', 'is_read', 'created_at'])

    op.create_table(
        'team_rewards',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_organizations.id'), nullable=False
        ),
        sa.Column(
            'department_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_departments.id'), nullable=False
        ),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('week_end', sa.Date(), nullable=False),
        sa.Column('member_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'GRANTED', 'SKIPPED', name='team_reward_status'),
            nullable=False,
            server_default='PENDING',
        ),
        sa.Column(
            'reward_type',
            sa.Enum('CONGRATS_GAME', 'REFRESHMENTS', 'EARLY_LEAVE', name='team_reward_type'),
            nullable=True,
        ),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('granted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('granted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('organization_id', 'department_id', 'week_start', name='uq_team_rewards_org_dept_week'),
    )
    op.create_index('ix_team_rewards_organization_id', 'team_rewards', ['organization_id'])
    op.create_index('ix_team_rewards_department_id', 'team_rewards', ['department_id'])
    op.create_index('ix_team_rewards_status', 'team_rewards', ['status'])


def downgrade() -> None:
    op.drop_index('ix_team_rewards_status', table_name='team_rewards')
    op.drop_index('ix_team_rewards_department_id', table_name='team_rewards')
    op.drop_index('ix_team_rewards_organization_id', table_name='team_rewards')
    op.drop_table('team_rewards')
    postgresql.ENUM(name='team_reward_type').drop(op.get_bind())
    postgresql.ENUM(name='team_reward_status').drop(op.get_bind())

    op.drop_index('ix_notifications_recipient_unread', table_name='notifications')
    op.drop_index('ix_notifications_recipient_id', table_name='notifications')
    op.drop_index('ix_notifications_organization_id', table_name='notifications')
    op.drop_table('notifications')
    postgresql.ENUM(name='notification_priority').drop(op.get_bind())
    postgresql.ENUM(name='notification_type').drop(op.get_bind())

    op.drop_column('workflow_organizations', 'document_categories')
    op.drop_column('workflow_organizations', 'settings')
    op.drop_column('workflow_organizations', 'address')
    op.drop_column('workflow_organizations', 'plan_expiry')
    op.drop_column('workflow_organizations', 'plan')
    postgresql.ENUM(name='organization_plan').drop(op.get_bind())
    op.drop_column('workflow_organizations', 'gst_number')
    op.drop_column('workflow_organizations', 'logo_url')
