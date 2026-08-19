"""initial identity setup

Revision ID: 202606182315
Revises: 
Create Date: 2026-06-18 23:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '202606182315'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Create roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roles_name'), 'roles', ['name'], unique=True)

    # 2. Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('locale_pref', sa.String(length=10), server_default='ar', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('is_superadmin', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 3. Create refresh_tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('token_hash', sa.String(length=255), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)

    # 4. Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(length=255), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.text("timezone('utc'::text, now())"), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Seed default roles
    op.execute(
        "INSERT INTO roles (id, name) VALUES "
        "('c12c75a4-569b-430c-968e-0fde8b14e300', 'superadmin'),"
        "('88dcf628-98e6-4277-9ff7-b1698246a301', 'admin'),"
        "('b9ef8ccb-0e5a-4933-bf4f-cfb95e34a302', 'teacher')"
    )

    # Seed a default superadmin user
    # email: superadmin@institute.dev
    # password: admin123
    # password_hash: $2b$12$oqZr9asO0spzX8qjzh/hGuezB3sJghuD9FN3hCrdHnhXWECWAOGG.
    # Generated with bcrypt 5.0.0 (bcrypt.hashpw(b'admin123', bcrypt.gensalt(12)))
    op.execute(
        "INSERT INTO users (id, email, password_hash, full_name, role_id, locale_pref, is_active, is_superadmin) VALUES "
        "('a1bc571c-f230-4e3c-83b8-c3d82a14e3aa', 'superadmin@institute.dev', "
        "'$2b$12$oqZr9asO0spzX8qjzh/hGuezB3sJghuD9FN3hCrdHnhXWECWAOGG.', 'Super Administrator', "
        "'c12c75a4-569b-430c-968e-0fde8b14e300', 'ar', true, true)"
    )

def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('refresh_tokens')
    op.drop_table('users')
    op.drop_table('roles')
