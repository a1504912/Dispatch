import httpx
from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def list_models():
    """List models installed on the local Ollama instance."""
    url = f"{settings.ollama_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError:
        return {"ollama_online": False, "models": []}

    names = [m["name"] for m in data.get("models", []) if m.get("name")]
    return {"ollama_online": True, "models": names}
