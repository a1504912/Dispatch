from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import agents, chat, events, google, models, schedule


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Dispatch API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Also allow localhost and private LAN IPs on any port, so the frontend
    # works whether it's opened via localhost:5173 or http://192.168.x.x:5173.
    allow_origin_regex=(
        r"https?://("
        r"localhost|127\.0\.0\.1|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|"
        r"100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|"  # Tailscale (100.64/10)
        r"[\w-]+\.[\w-]+\.ts\.net"  # Tailscale MagicDNS
        r")(:\d+)?"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(chat.router)
app.include_router(schedule.router)
app.include_router(events.router)
app.include_router(models.router)
app.include_router(google.router)


@app.get("/")
def root():
    return {"service": "dispatch-api", "status": "ok"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
