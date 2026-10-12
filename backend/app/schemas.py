from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel

from app.models import AgentStatus, Platform, PostMetric, PostStatus


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


# ---------- Pillar ----------
class PillarCreate(SQLModel):
    name: str
    description: str = ""
    audience: str = ""
    tone: str = ""
    color: str = "#2a78d6"
    target_ratio: int = 0


class PillarUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    audience: Optional[str] = None
    tone: Optional[str] = None
    color: Optional[str] = None
    target_ratio: Optional[int] = None


# ---------- Post ----------
class PostCreate(SQLModel):
    title: str
    body: str = ""
    platform: Platform = Platform.instagram
    status: PostStatus = PostStatus.idea
    pillar_id: Optional[int] = None
    tags: str = ""
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    url: str = ""


class PostUpdate(SQLModel):
    title: Optional[str] = None
    body: Optional[str] = None
    platform: Optional[Platform] = None
    status: Optional[PostStatus] = None
    pillar_id: Optional[int] = None
    tags: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    url: Optional[str] = None


class PostImageRead(SQLModel):
    id: int
    post_id: int
    filename: str
    original_name: str
    position: int
    url: str


class MetricCreate(SQLModel):
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    followers_gained: int = 0
    recorded_at: Optional[datetime] = None


class PostRead(SQLModel):
    id: int
    title: str
    body: str
    platform: Platform
    status: PostStatus
    pillar_id: Optional[int]
    tags: str
    scheduled_at: Optional[datetime]
    published_at: Optional[datetime]
    url: str
    created_at: datetime
    updated_at: datetime
    images: list[PostImageRead] = []
    latest_metric: Optional[PostMetric] = None


# ---------- AI assist ----------
class AssistMode(str, Enum):
    draft = "draft"
    titles = "titles"
    hashtags = "hashtags"
    polish = "polish"
    ideas = "ideas"


class AssistRequest(SQLModel):
    mode: AssistMode
    platform: Platform = Platform.instagram
    pillar_id: Optional[int] = None
    title: str = ""
    body: str = ""


class AssistResponse(SQLModel):
    mode: AssistMode
    result: str
