from datetime import datetime
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


class EventCompletedUpdate(SQLModel):
    completed: bool


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
