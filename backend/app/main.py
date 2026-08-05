from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import (
    agents,
    auth,
    categories,
    chat,
    events,
    google,
    models,
    news,
    schedule,
    subtasks,
)

# 若前端已 build（frontend/dist 存在），後端會直接供應網頁 → VM 上只需跑 uvicorn
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Dispatch API", version="0.1.0", lifespan=lifespan)

# 不需要登入的路徑（登入本身、健康檢查、Google OAuth 回跳）
AUTH_EXEMPT_PATHS = {"/", "/api/health", "/api/auth/login", "/api/auth/status", "/api/google/callback"}


# 注意：這個 middleware 要在 CORSMiddleware「之前」註冊，
# 401 回應才會帶 CORS 標頭（FastAPI 後加的 middleware 在外層）。
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not settings.auth_password:
        return await call_next(request)
    path = request.url.path
    # 只保護 API；網頁與靜態資源公開（登入頁本身也是網頁的一部分）
    if not path.startswith("/api"):
        return await call_next(request)
    if request.method == "OPTIONS" or path in AUTH_EXEMPT_PATHS:
        return await call_next(request)

    token = None
    header = request.headers.get("authorization", "")
    if header.startswith("Bearer "):
        token = header[7:]
    if not token:
        # 瀏覽器直接導頁的請求（如 Google OAuth 起點）改用 query string 帶 token
        token = request.query_params.get("token")

    if auth.verify_token(token):
        return await call_next(request)
    return JSONResponse({"detail": "未登入"}, status_code=401)


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

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(chat.router)
app.include_router(schedule.router)
app.include_router(events.router)
app.include_router(models.router)
app.include_router(google.router)
app.include_router(categories.router)
app.include_router(subtasks.router)
app.include_router(news.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


if FRONTEND_DIST.exists():
    # 部署模式：後端直接供應前端網頁（SPA fallback 到 index.html）
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")

else:

    @app.get("/")
    def root():
        return {"service": "dispatch-api", "status": "ok"}
