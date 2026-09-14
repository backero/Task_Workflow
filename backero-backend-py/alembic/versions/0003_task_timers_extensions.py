"""tasks phase 1b: timers, timer sessions, extension requests

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('active_timer_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tasks', sa.Column('active_timer_user_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('tasks', sa.Column('total_tracked_ms', sa.BigInteger(), nullable=False, server_default='0'))
    op.create_foreign_key(
        'fk_tasks_active_timer_user_id', 'tasks', 'workflow_users', ['active_timer_user_id'], ['id']
    )

    op.create_table(
        'task_timer_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('stopped_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_ms', sa.BigInteger(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
    )
    op.create_index('ix_task_timer_sessions_task_id', 'task_timer_sessions', ['task_id'])

    # Labels must be the Python enum members' NAMES (uppercase), not their
    # .value strings — SQLAlchemy's default Enum bind processor sends
    # `member.name`, same convention already used by every other enum column
    # in migration 0001 (approval_status, task_comment_type, etc.) via
    # `sa.Enum('PENDING', 'APPROVED', ..., name=...)`. The API still returns
    # the nicer lowercase .value strings — that's Pydantic's response
    # serialization layer, independent of how Postgres stores the label.
    op.create_table(
        'task_extension_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requested_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=False),
        sa.Column('original_due_date', sa.Date(), nullable=True),
        sa.Column('requested_due_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', name='task_extension_status'), nullable=False, server_default='PENDING'),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviewed_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('workflow_users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_task_extension_requests_task_id', 'task_extension_requests', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_task_extension_requests_task_id', table_name='task_extension_requests')
    op.drop_table('task_extension_requests')
    postgresql.ENUM(name='task_extension_status').drop(op.get_bind())

    op.drop_index('ix_task_timer_sessions_task_id', table_name='task_timer_sessions')
    op.drop_table('task_timer_sessions')

    op.drop_constraint('fk_tasks_active_timer_user_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'total_tracked_ms')
    op.drop_column('tasks', 'active_timer_user_id')
    op.drop_column('tasks', 'active_timer_started_at')
