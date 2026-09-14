"""phase 1d: subtask trees + task dependencies (workflow builder)

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('parent_task_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('tasks', sa.Column('level', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('tasks', sa.Column('auto_progress', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('tasks', sa.Column('completion_locked', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('tasks', sa.Column('completion_lock_reasons', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('tasks', sa.Column('workflow_x', sa.Float(), nullable=True))
    op.add_column('tasks', sa.Column('workflow_y', sa.Float(), nullable=True))
    op.create_foreign_key('fk_tasks_parent_task_id', 'tasks', 'tasks', ['parent_task_id'], ['id'])
    op.create_index('ix_tasks_parent_task_id', 'tasks', ['parent_task_id'])

    op.create_table(
        'task_dependencies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'organization_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('workflow_organizations.id'),
            nullable=False,
        ),
        sa.Column(
            'from_task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column(
            'to_task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column(
            'type',
            sa.Enum(
                'FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH', name='task_dependency_type'
            ),
            nullable=False,
            server_default='FINISH_TO_START',
        ),
        sa.Column(
            'status',
            sa.Enum('ACTIVE', 'RESOLVED', 'WAIVED', name='task_dependency_status'),
            nullable=False,
            server_default='ACTIVE',
        ),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        # server_default=now() — TimestampMixin relies on the DB default
        # (see app/models/mixins.py), not a Python-side default; omitting it
        # here caused a NotNullViolation on every insert.
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('from_task_id', 'to_task_id', name='uq_task_dependencies_from_to'),
    )
    op.create_index('ix_task_dependencies_organization_id', 'task_dependencies', ['organization_id'])
    op.create_index('ix_task_dependencies_from_task_id', 'task_dependencies', ['from_task_id'])
    op.create_index('ix_task_dependencies_to_task_id', 'task_dependencies', ['to_task_id'])


def downgrade() -> None:
    op.drop_index('ix_task_dependencies_to_task_id', table_name='task_dependencies')
    op.drop_index('ix_task_dependencies_from_task_id', table_name='task_dependencies')
    op.drop_index('ix_task_dependencies_organization_id', table_name='task_dependencies')
    op.drop_table('task_dependencies')
    # Enum types created inline by create_table() aren't dropped along with
    # the table — Postgres enum types are independent objects.
    postgresql.ENUM(name='task_dependency_status').drop(op.get_bind())
    postgresql.ENUM(name='task_dependency_type').drop(op.get_bind())

    op.drop_index('ix_tasks_parent_task_id', table_name='tasks')
    op.drop_constraint('fk_tasks_parent_task_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'workflow_y')
    op.drop_column('tasks', 'workflow_x')
    op.drop_column('tasks', 'completion_lock_reasons')
    op.drop_column('tasks', 'completion_locked')
    op.drop_column('tasks', 'auto_progress')
    op.drop_column('tasks', 'level')
    op.drop_column('tasks', 'parent_task_id')
