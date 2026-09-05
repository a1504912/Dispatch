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
                if "images" not in columns:
                    conn.execute(text("ALTER TABLE event ADD COLUMN images TEXT"))
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
                if "thumb" not in columns:
                    conn.execute(text("ALTER TABLE event ADD COLUMN thumb TEXT"))
                conn.commit()

            sub_columns = [row[1] for row in conn.execute(text("PRAGMA table_info(subtask)"))]
            if sub_columns:
                if "due_date" not in sub_columns:
                    conn.execute(text("ALTER TABLE subtask ADD COLUMN due_date DATE"))
                if "images" not in sub_columns:
                    conn.execute(text("ALTER TABLE subtask ADD COLUMN images TEXT"))
                conn.commit()

            # 記帳分類：主分類 → 次分類（parent_id）
            lc_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(ledgercategory)"))]
            if lc_cols and "parent_id" not in lc_cols:
                conn.execute(text("ALTER TABLE ledgercategory ADD COLUMN parent_id INTEGER"))
                conn.commit()

            # 帳戶：主分類（類型）→ 次分類（parent_id）
            acc_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(account)"))]
            if acc_cols and "parent_id" not in acc_cols:
                conn.execute(text("ALTER TABLE account ADD COLUMN parent_id INTEGER"))
                conn.commit()

            # 記帳新增欄位（transaction 是保留字，需加引號）
            tx_cols = [row[1] for row in conn.execute(text('PRAGMA table_info("transaction")'))]
            if tx_cols:
                if "subcategory" not in tx_cols:
                    conn.execute(
                        text("ALTER TABLE \"transaction\" ADD COLUMN subcategory VARCHAR NOT NULL DEFAULT ''")
                    )
                if "account" not in tx_cols:
                    conn.execute(
                        text("ALTER TABLE \"transaction\" ADD COLUMN account VARCHAR NOT NULL DEFAULT ''")
                    )
                if "event_id" not in tx_cols:
                    conn.execute(text('ALTER TABLE "transaction" ADD COLUMN event_id INTEGER'))
                if "split_bill_id" not in tx_cols:
                    conn.execute(text('ALTER TABLE "transaction" ADD COLUMN split_bill_id INTEGER'))
                if "account_id" not in tx_cols:
                    conn.execute(text('ALTER TABLE "transaction" ADD COLUMN account_id INTEGER'))
                if "to_account_id" not in tx_cols:
                    conn.execute(text('ALTER TABLE "transaction" ADD COLUMN to_account_id INTEGER'))
                conn.commit()

    # 幫既有、還沒有縮圖的行程補上縮圖（一次性；之後啟動就略過）
    try:
        _backfill_thumbs()
    except Exception as exc:  # noqa: BLE001
        print("thumbnail backfill skipped:", str(exc)[:200])

    _seed_ledger_categories()
    _seed_accounts()


DEFAULT_LEDGER_CATEGORIES = [
    ("expense", "餐飲", "🍜"),
    ("expense", "交通", "🚗"),
    ("expense", "購物", "🛍️"),
    ("expense", "娛樂", "🎮"),
    ("expense", "居家", "🏠"),
    ("expense", "醫療", "💊"),
    ("expense", "學習", "📚"),
    ("expense", "人情", "🎁"),
    ("expense", "訂閱", "💳"),
    ("expense", "其他", "📦"),
    ("income", "薪水", "💰"),
    ("income", "獎金", "🎉"),
    ("income", "投資", "📈"),
    ("income", "退款", "↩️"),
    ("income", "其他", "💵"),
]


DEFAULT_ACCOUNTS = [
    ("現金", "💵"),
    ("銀行帳戶", "🏦"),
    ("信用卡", "💳"),
    ("電子支付", "📱"),
    ("外幣", "💱"),
]


def _seed_accounts() -> None:
    from sqlmodel import Session, select

    from app.models import Account

    with Session(engine) as session:
        if session.exec(select(Account)).first():
            return
        for i, (name, emoji) in enumerate(DEFAULT_ACCOUNTS):
            session.add(Account(name=name, emoji=emoji, initial=0, sort=i))
        session.commit()


def _seed_ledger_categories() -> None:
    """第一次啟動時，若還沒有任何記帳分類，就塞入預設分類。"""
    from sqlmodel import Session, select

    from app.models import LedgerCategory

    with Session(engine) as session:
        if session.exec(select(LedgerCategory)).first():
            return
        for i, (kind, name, emoji) in enumerate(DEFAULT_LEDGER_CATEGORIES):
            session.add(LedgerCategory(kind=kind, name=name, emoji=emoji, sort=i))
        session.commit()


def _backfill_thumbs() -> None:
    from sqlmodel import Session, select

    from app import thumbs
    from app.models import Event

    with Session(engine) as session:
        events = session.exec(select(Event).where(Event.thumb == None)).all()  # noqa: E711
        changed = 0
        for ev in events:
            if not (ev.image or ev.images):
                continue
            t = thumbs.thumb_for(ev.image, ev.images)
            if t:
                ev.thumb = t
                session.add(ev)
                changed += 1
        if changed:
            session.commit()
            print(f"backfilled {changed} event thumbnails")


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
