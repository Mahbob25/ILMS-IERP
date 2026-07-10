import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Add current path to sys.path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

from app.core.config import settings
from app.db.base import Base, naming_convention
from app.modules.identity.models import Role, User, RefreshToken, AuditLog, Employee, Permission, RolePermission
from app.modules.academic.models import Course, CourseSection, Student, Enrollment, Certificate, FinalGrade, SectionCancellation, PendingRefund, Refund, DailyJobsLog, SectionCompletionOverride, SectionLifecycleConfig
from app.modules.lms.models import AttendanceSession, AttendanceRecord, Assignment, Submission, Grade, Payment, Expense, TeacherWallet, DailyClosure, SectionContract, LedgerEntry, CompensationAmendmentRequest

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the sqlalchemy.url dynamically from settings
config.set_main_option("sqlalchemy.url", settings.sync_database_url)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        naming_convention=naming_convention,
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata,
            naming_convention=naming_convention,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
