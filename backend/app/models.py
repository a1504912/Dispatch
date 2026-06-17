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
    # 對應的 Google 日曆事件 id（未同步則為 None）
    google_event_id: Optional[str] = Field(default=None, index=True)


class GoogleCredential(SQLModel, table=True):
    """單一列（id=1）存放 Google OAuth token。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    access_token: str = ""
    refresh_token: str = ""
    expiry: Optional[datetime] = None
    email: str = ""
