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


# ---------- 自媒體 / Content studio ----------
class Platform(str, Enum):
    instagram = "instagram"
    facebook = "facebook"
    threads = "threads"
    youtube = "youtube"
    tiktok = "tiktok"
    x = "x"
    blog = "blog"
    other = "other"


class PostStatus(str, Enum):
    idea = "idea"
    draft = "draft"
    scheduled = "scheduled"
    published = "published"


class Pillar(SQLModel, table=True):
    """A content pillar (主題方向): a theme the account commits to covering.

    target_ratio is the share of posts (0-100) this pillar should take, so the
    analytics page can show where the actual mix drifts from the plan.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    audience: str = ""
    tone: str = ""
    color: str = "#2a78d6"
    target_ratio: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Post(SQLModel, table=True):
    """A piece of content, from idea through to published."""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    body: str = ""
    platform: Platform = Field(default=Platform.instagram)
    status: PostStatus = Field(default=PostStatus.idea)
    pillar_id: Optional[int] = Field(default=None, foreign_key="pillar.id")
    tags: str = ""  # comma separated
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    url: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PostImage(SQLModel, table=True):
    """An uploaded image attached to a post. Files live in UPLOAD_DIR."""

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id")
    filename: str
    original_name: str = ""
    position: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PostMetric(SQLModel, table=True):
    """A snapshot of a post's performance numbers.

    Numbers are cumulative as read from the platform, so the latest snapshot
    is the post's current total; earlier ones show how it grew.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id")
    recorded_at: datetime = Field(default_factory=datetime.utcnow)
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    followers_gained: int = 0
