from datetime import datetime
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
    # 附加圖片（data URL，存在本地 SQLite）
    image: Optional[str] = None
    # 分類（可為空）
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    # 來源：local（在 Dispatch 建立）/ google（從 Google 拉進來）
    source: str = "local"
    # 對應的 Google 日曆事件 id（未同步則為 None）
    google_event_id: Optional[str] = Field(default=None, index=True)


class Subtask(SQLModel, table=True):
    """主行程底下的小明細（可打勾的子任務）。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="event.id", index=True)
    title: str
    done: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GoogleCredential(SQLModel, table=True):
    """單一列（id=1）存放 Google OAuth token。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    access_token: str = ""
    refresh_token: str = ""
    expiry: Optional[datetime] = None
    email: str = ""
