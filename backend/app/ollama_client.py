import httpx

from app.config import settings


async def chat(
    model: str,
    messages: list[dict],
    *,
    format: str | dict | None = None,
    timeout: float = 120.0,
) -> str:
    """Send a chat request to the Ollama bridge and return the reply text.

    `messages` may include an ``images`` field (list of base64 strings) on a
    message to send pictures to a vision-capable model. Pass ``format="json"``
    to ask Ollama to constrain the output to valid JSON.

    Raises httpx.HTTPError on transport/HTTP failures so callers can map it to a
    sensible API response.
    """
    url = f"{settings.ollama_url.rstrip('/')}/api/chat"
    payload: dict = {
        "model": model or settings.default_model,
        "messages": messages,
        "stream": False,
    }
    if format is not None:
        payload["format"] = format

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    # Ollama returns {"message": {"role": "assistant", "content": "..."}, ...}
    return data.get("message", {}).get("content", "")
