from datetime import date, datetime
from typing import Optional

from sqlmodel import SQLModel

from app.models import AgentStatus


# ---------- Agent ----------
class AgentCreate(SQLModel):
    name: str
    role: str = ""
    model: str = ""
    system_prompt: str = ""
    status: AgentStatus = AgentStatus.idle


class AgentStatusUpdate(SQLModel):
    status: AgentStatus


# ---------- Event ----------
class EventCreate(SQLModel):
    title: str
    start_time: datetime
    end_time: datetime
    description: str = ""
    agent_id: Optional[int] = None
    color: str = "#3788d8"
    completed: bool = False
    all_day: bool = False
    image: Optional[str] = None
    images: Optional[str] = None
    category_id: Optional[int] = None
    is_task: bool = False


# ---------- Category ----------
class CategoryCreate(SQLModel):
    name: str
    color: str = "#6366f1"


# ---------- Subtask ----------
class SubtaskCreate(SQLModel):
    event_id: int
    title: str


class SubtaskUpdate(SQLModel):
    title: Optional[str] = None
    done: Optional[bool] = None
    due_date: Optional[date] = None
    images: Optional[str] = None


class EventCompletedUpdate(SQLModel):
    completed: bool


# ---------- Transaction（記帳） ----------
class TransactionCreate(SQLModel):
    kind: str = "expense"
    amount: float
    category: str = ""
    subcategory: str = ""
    note: str = ""
    date: date
    account: str = ""
    account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    event_id: Optional[int] = None
    split_bill_id: Optional[int] = None


class AccountCreate(SQLModel):
    name: str
    emoji: str = "💰"
    initial: float = 0
    sort: int = 0


class BudgetCreate(SQLModel):
    category: str = ""
    amount: float = 0


class LedgerCategoryCreate(SQLModel):
    kind: str = "expense"
    name: str
    emoji: str = "📦"
    sort: int = 0
    parent_id: Optional[int] = None


class LedgerMemberCreate(SQLModel):
    name: str
    emoji: str = "🙂"


class SplitBillCreate(SQLModel):
    title: str
    total: float
    date: date
    category: str = ""
    payer: str = "self"
    method: str = "equal"
    shares: str = ""
    note: str = ""


# ---------- Chat ----------
class ChatRequest(SQLModel):
    agent_id: int
    message: str


class ChatResponse(SQLModel):
    agent_id: int
    reply: str


# ---------- Schedule ----------
class ScheduleRequest(SQLModel):
    tasks: list[str]
    agent_id: Optional[int] = None


class ScheduleResponse(SQLModel):
    events: list[EventCreate]
