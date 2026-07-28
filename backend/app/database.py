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
                if "image" not in columns:
                    conn.execute(text("ALTER TABLE event ADD COLUMN image TEXT"))
                if "category_id" not in columns:
                    conn.execute(text("ALTER TABLE event ADD COLUMN category_id INTEGER"))
                if "source" not in columns:
                    conn.execute(
                        text(
                            "ALTER TABLE event ADD COLUMN source VARCHAR NOT NULL DEFAULT 'local'"
                        )
                    )
                    # 既有資料：從 Google 拉進來的（同步時上的是 Google 藍）視為 Google 來源
                    conn.execute(
                        text(
                            "UPDATE event SET source = 'google' "
                            "WHERE google_event_id IS NOT NULL AND color = '#4285F4'"
                        )
                    )
                if "is_task" not in columns:
                    conn.execute(
                        text("ALTER TABLE event ADD COLUMN is_task BOOLEAN NOT NULL DEFAULT 0")
                    )
                conn.commit()

            sub_columns = [row[1] for row in conn.execute(text("PRAGMA table_info(subtask)"))]
            if sub_columns and "due_date" not in sub_columns:
                conn.execute(text("ALTER TABLE subtask ADD COLUMN due_date DATE"))
                conn.commit()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
