import logging
from logging.config import fileConfig

import sqlalchemy as sa
from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel
from sqlmodel.sql.sqltypes import AutoString

from config.config import get_settings
from src.db.model_registry import import_orm_models

# Alembic Config object
config = context.config

database_url = (
    get_settings().database_config.sql_connection_string
    or config.get_main_option("sqlalchemy.url")
)
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Load all ORM models via the single canonical registry.
# This replaces the previous os.walk dynamic discovery so that migrations and
# the runtime app always use the exact same set of models.
import_orm_models()

target_metadata = SQLModel.metadata

# Tables that exist in the database but are *not* managed by SQLModel metadata
# (external tools, legacy schema elements).  Alembic will not attempt to
# create, alter, or drop these.
_AUTOGENERATE_EXCLUDED_TABLES = {
    "ar_internal_metadata",
    "chapteractivity",
    "clients",
    "coursechapter",
    "languages",
    "schema_migrations",
    "submissions",
}


def include_object(object_, name: str | None, type_: str, reflected: bool, compare_to):
    if not name:
        return True

    table_name = name
    if type_ != "table":
        parent_table = getattr(object_, "table", None)
        if parent_table is not None and getattr(parent_table, "name", None):
            table_name = parent_table.name

    return not (
        reflected and compare_to is None and table_name in _AUTOGENERATE_EXCLUDED_TABLES
    )


def compare_type(
    _context,
    _inspected_column,
    _metadata_column,
    inspected_type,
    metadata_type,
):
    # Treat String / Text / AutoString as interchangeable to avoid spurious diffs.
    stringish_types = (sa.String, sa.Text, AutoString)
    if isinstance(inspected_type, stringish_types) and isinstance(
        metadata_type, stringish_types
    ):
        return False
    return None


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=compare_type,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connect_args = {}
    if database_url and database_url.startswith("postgresql+"):
        connect_args["connect_timeout"] = 5

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=compare_type,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()


def include_object(object_, name: str | None, type_: str, reflected: bool, compare_to):
    if not name:
        return True

    table_name = name
    if type_ != "table":
        parent_table = getattr(object_, "table", None)
        if parent_table is not None and getattr(parent_table, "name", None):
            table_name = parent_table.name

    return not (
        reflected and compare_to is None and table_name in _AUTOGENERATE_EXCLUDED_TABLES
    )


def compare_type(
    _context,
    _inspected_column,
    _metadata_column,
    inspected_type,
    metadata_type,
):
    stringish_types = (sa.String, sa.Text, AutoString)
    if isinstance(inspected_type, stringish_types) and isinstance(
        metadata_type, stringish_types
    ):
        return False

    return None


# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=compare_type,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connect_args = {}
    if database_url and database_url.startswith("postgresql+"):
        connect_args["connect_timeout"] = 5

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=compare_type,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
