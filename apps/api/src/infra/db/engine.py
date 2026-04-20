from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from src.db.model_registry import import_orm_models
from src.infra.settings import AppSettings

# Set once from lifespan.  Provides engine access to background tasks (audit
# writes, fire-and-forget session tracking) that execute outside a request
# context and therefore cannot reach app.state.  This is not a pool — it is
# a reference to the single engine the process already owns.
_bg_engine: Engine | None = None


def build_engine(settings: AppSettings) -> Engine:
    """Create a new database engine.

    Called exactly once per process from lifespan startup (or once per CLI
    invocation).  Callers are responsible for calling ``engine.dispose()``
    when the process exits.

    SQLite is detected by URL prefix and gets the StaticPool + thread-safety
    overrides required for in-memory test databases.
    """
    import_orm_models()
    url = settings.database_config.sql_connection_string
    if url.startswith("sqlite"):
        return create_engine(
            url,
            echo=False,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(
        url,
        echo=False,
        pool_pre_ping=True,
        pool_reset_on_return="rollback",
        pool_size=10,
        max_overflow=20,
        connect_args={"connect_timeout": 5},
    )


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a session factory bound to *engine*."""
    return sessionmaker(
        bind=engine,
        class_=Session,
        autoflush=False,
        expire_on_commit=False,
    )


def register_engine(engine: Engine) -> None:
    """Register the app engine so background tasks can reach it.

    Called once from lifespan after ``build_engine()``.
    """
    global _bg_engine
    _bg_engine = engine


def unregister_engine() -> None:
    """Clear the background-task engine reference on shutdown."""
    global _bg_engine
    _bg_engine = None


def get_bg_engine() -> Engine:
    """Return the registered engine for background / fire-and-forget tasks.

    Raises ``RuntimeError`` if called before ``register_engine()``.
    """
    if _bg_engine is None:
        raise RuntimeError(
            "No engine registered. Ensure register_engine() is called during lifespan startup."
        )
    return _bg_engine
