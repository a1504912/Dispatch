from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# check_same_thread is needed for SQLite when used with FastAPI's threadpool.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Create database tables. Import models so they are registered on metadata."""
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
