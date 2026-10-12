from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import agents, analytics, chat, content, events, pillars, posts, schedule
from app.routers.posts import upload_path


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Dispatch API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(chat.router)
app.include_router(schedule.router)
app.include_router(events.router)
app.include_router(pillars.router)
app.include_router(posts.router)
app.include_router(analytics.router)
app.include_router(content.router)

# Uploaded post images, served at /uploads/<filename>.
app.mount("/uploads", StaticFiles(directory=upload_path()), name="uploads")


@app.get("/")
def root():
    return {"service": "dispatch-api", "status": "ok"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
