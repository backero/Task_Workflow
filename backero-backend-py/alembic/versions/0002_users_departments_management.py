"""users/departments management: designation, reports_to, avatar, audit trail

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-13 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('workflow_users', sa.Column('designation', sa.String(length=128), nullable=True))
    op.add_column('workflow_users', sa.Column('reports_to_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('workflow_users', sa.Column('avatar', sa.String(length=1024), nullable=True))
    op.add_column('workflow_users', sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('workflow_users', sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_workflow_users_reports_to_id', 'workflow_users', 'workflow_users', ['reports_to_id'], ['id']
    )
    op.create_foreign_key(
        'fk_workflow_users_created_by_id', 'workflow_users', 'workflow_users', ['created_by_id'], ['id']
    )
    op.create_foreign_key(
        'fk_workflow_users_updated_by_id', 'workflow_users', 'workflow_users', ['updated_by_id'], ['id']
    )

    op.add_column('workflow_departments', sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('workflow_departments', sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_workflow_departments_created_by_id', 'workflow_departments', 'workflow_users', ['created_by_id'], ['id']
    )
    op.create_foreign_key(
        'fk_workflow_departments_updated_by_id', 'workflow_departments', 'workflow_users', ['updated_by_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_workflow_departments_updated_by_id', 'workflow_departments', type_='foreignkey')
    op.drop_constraint('fk_workflow_departments_created_by_id', 'workflow_departments', type_='foreignkey')
    op.drop_column('workflow_departments', 'updated_by_id')
    op.drop_column('workflow_departments', 'created_by_id')

    op.drop_constraint('fk_workflow_users_updated_by_id', 'workflow_users', type_='foreignkey')
    op.drop_constraint('fk_workflow_users_created_by_id', 'workflow_users', type_='foreignkey')
    op.drop_constraint('fk_workflow_users_reports_to_id', 'workflow_users', type_='foreignkey')
    op.drop_column('workflow_users', 'updated_by_id')
    op.drop_column('workflow_users', 'created_by_id')
    op.drop_column('workflow_users', 'avatar')
    op.drop_column('workflow_users', 'reports_to_id')
    op.drop_column('workflow_users', 'designation')
