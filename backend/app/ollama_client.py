import httpx

from app.config import settings


async def chat(model: str, messages: list[dict], *, timeout: float = 60.0) -> str:
    """Send a chat request to the Ollama bridge and return the reply text.

    Raises httpx.HTTPError on transport/HTTP failures so callers can map it to a
    sensible API response.
    """
    url = f"{settings.ollama_url.rstrip('/')}/api/chat"
    payload = {
        "model": model or settings.default_model,
        "messages": messages,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    # Ollama returns {"message": {"role": "assistant", "content": "..."}, ...}
    return data.get("message", {}).get("content", "")
