from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# check_same_thread is needed for SQLite when used with FastAPI's threadpool.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Create database tables. Import models so they are registered on metadata."""
    from sqlalchemy import text

    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # 輕量遷移：舊資料庫補上後來新增的欄位（SQLite create_all 不會加欄位）。
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as conn:
            columns = [row[1] for row in conn.execute(text("PRAGMA table_info(event)"))]
            if columns:
                if "completed" not in columns:
                    conn.execute(
                        text("ALTER TABLE event ADD COLUMN completed BOOLEAN NOT NULL DEFAULT 0")
                    )
                if "google_event_id" not in columns:
                    conn.execute(text("ALTER TABLE event ADD COLUMN google_event_id VARCHAR"))
                if "all_day" not in columns:
                    conn.execute(
                        text("ALTER TABLE event ADD COLUMN all_day BOOLEAN NOT NULL DEFAULT 0")
                    )
                conn.commit()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
