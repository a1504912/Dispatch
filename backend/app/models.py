from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class AgentStatus(str, Enum):
    active = "active"
    idle = "idle"
    disabled = "disabled"


class Agent(SQLModel, table=True):
    """An AI employee that tasks can be dispatched to."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    role: str = ""
    model: str = ""
    system_prompt: str = ""
    status: AgentStatus = Field(default=AgentStatus.idle)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Category(SQLModel, table=True):
    """使用者自訂的行程分類（工作、家裡、出遊…）。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    color: str = "#6366f1"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Event(SQLModel, table=True):
    """A calendar event, optionally assigned to an agent."""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    start_time: datetime
    end_time: datetime
    description: str = ""
    agent_id: Optional[int] = Field(default=None, foreign_key="agent.id")
    color: str = "#3788d8"
    completed: bool = False
    # 整天活動（Google all-day；end_time 慣例上是「隔天 00:00」不含）
    all_day: bool = False
    # 附加圖片：image 存第一張，images 存全部（JSON 陣列），thumb 存很小的縮圖（列表用）
    image: Optional[str] = None
    images: Optional[str] = None
    thumb: Optional[str] = None
    # 分類（可為空）
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    # 來源：local（在 Dispatch 建立）/ google（從 Google 拉進來）
    source: str = "local"
    # 對應的 Google 日曆事件 id（未同步則為 None）
    google_event_id: Optional[str] = Field(default=None, index=True)
    # 待辦事項（無特定日期，不進行事曆、不同步 Google）
    is_task: bool = False


class Subtask(SQLModel, table=True):
    """主行程底下的小明細（可打勾的子任務）。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="event.id", index=True)
    title: str
    done: bool = False
    # 明細自己的到期日；設了就會延到那天顯示（未設 = 跟主項同一天）
    due_date: Optional[date] = None
    # 這項明細專屬的照片（JSON 陣列，和主行程的圖片分開存）
    images: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Settlement(SQLModel, table=True):
    """分帳結算/還款。direction: in（對方還你）/ out（你還對方）。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    member_id: int = Field(foreign_key="ledgermember.id", index=True)
    amount: float = 0
    direction: str = "in"  # in / out
    date: date
    method: str = "none"  # income / offset / expense / none（怎麼記進帳）
    account_id: Optional[int] = Field(default=None, foreign_key="account.id")
    note: str = ""
    transaction_id: Optional[int] = Field(default=None, foreign_key="transaction.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GoogleCredential(SQLModel, table=True):
    """單一列（id=1）存放 Google OAuth token。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    access_token: str = ""
    refresh_token: str = ""
    expiry: Optional[datetime] = None
    email: str = ""


class LedgerCategory(SQLModel, table=True):
    """記帳分類（可自訂名稱、emoji；分支出/收入）。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = "expense"  # expense / income
    name: str
    emoji: str = "📦"
    sort: int = 0
    # 次分類：指向主分類的 id；主分類本身 parent_id 為 None
    parent_id: Optional[int] = Field(default=None, foreign_key="ledgercategory.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Budget(SQLModel, table=True):
    """每月預算。category 為空＝總預算；否則為某主分類的預算。每月重複套用。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    category: str = ""  # "" = 總預算
    amount: float = 0  # 每月上限
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Account(SQLModel, table=True):
    """記帳帳戶（現金／銀行／信用卡…），有初始餘額；目前餘額由交易算出。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    emoji: str = "💰"
    initial: float = 0  # 初始餘額
    sort: int = 0
    # 次分類：指向主分類（帳戶類型）的 id；主分類本身 parent_id 為 None
    parent_id: Optional[int] = Field(default=None, foreign_key="account.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LedgerMember(SQLModel, table=True):
    """分帳的常用成員（朋友、室友…）。「我」是隱含的，不存在這張表。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    emoji: str = "🙂"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SplitBill(SQLModel, table=True):
    """一筆分帳。shares 存每個參與者分攤的金額（JSON）。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    total: float
    date: date
    category: str = ""
    payer: str = "self"  # "self"（我付）或成員 id 字串
    method: str = "equal"  # equal 平均 / exact 各自指定 / shares 份數
    # JSON: [{"who": "self"|"<member_id>", "value": <分攤金額>}]
    shares: str = ""
    note: str = ""
    settled: bool = False  # 這筆是否已結清（Phase 2b 用）
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Transaction(SQLModel, table=True):
    """記帳的一筆收支。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = "expense"  # expense（支出）/ income（收入）
    amount: float = 0  # 正數金額
    category: str = ""  # 主分類名稱，例：飲食、交通
    subcategory: str = ""  # 次分類名稱，例：早餐、午餐（可空）
    note: str = ""
    date: date  # 這筆的日期
    account: str = ""  # 帳戶名稱（顯示用；正式關聯看 account_id）
    account_id: Optional[int] = Field(default=None, foreign_key="account.id")  # 支出/收入/轉出的帳戶
    to_account_id: Optional[int] = Field(default=None, foreign_key="account.id")  # 轉帳的轉入帳戶
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")  # 連結的行程
    split_bill_id: Optional[int] = Field(default=None, foreign_key="splitbill.id")  # 記帳時建立的分帳
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Invoice(SQLModel, table=True):
    """從財政部電子發票平台（手機條碼載具）拉回來的一張發票。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    inv_num: str = Field(index=True, unique=True)  # 發票號碼，例：AB12345678
    inv_date: date  # 開立日期
    seller_name: str = ""  # 賣方名稱
    seller_ban: str = ""  # 賣方統編
    amount: float = 0  # 總金額
    card_type: str = ""  # 載具類別（3J0002=手機條碼）
    status: str = ""  # 發票狀態（原始字串）
    donatable: bool = False  # 是否可捐贈（尚在可歸戶期）
    detail: str = ""  # 明細品項（JSON 陣列，之後才抓）
    # 若已把這張發票記成一筆支出，指向那筆 transaction
    transaction_id: Optional[int] = Field(default=None, foreign_key="transaction.id")
    synced_at: datetime = Field(default_factory=datetime.utcnow)


class Setting(SQLModel, table=True):
    """通用 key-value 設定（存 VAPID 金鑰、通知偏好等）。"""

    key: str = Field(primary_key=True)
    value: str = ""


class PushSubscription(SQLModel, table=True):
    """一台裝置的 Web Push 訂閱資訊。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint: str = Field(index=True, unique=True)
    p256dh: str = ""
    auth: str = ""
    ua: str = ""  # 瀏覽器 User-Agent，方便使用者辨識是哪台裝置
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SentNotification(SQLModel, table=True):
    """已送出的通知標記，用來去重複（同一件事不重複提醒）。"""

    tag: str = Field(primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
