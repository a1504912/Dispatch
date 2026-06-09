import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import ollama_client
from app.config import settings
from app.database import get_session
from app.models import Agent
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest, session: Session = Depends(get_session)):
    agent = session.get(Agent, payload.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    messages = []
    if agent.system_prompt:
        messages.append({"role": "system", "content": agent.system_prompt})
    messages.append({"role": "user", "content": payload.message})

    try:
        reply = await ollama_client.chat(agent.model or settings.default_model, messages)
    except httpx.HTTPError as exc:
        # Skeleton: surface a clear error but keep the endpoint responsive.
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach Ollama: {exc}",
        ) from exc

    return ChatResponse(agent_id=agent.id, reply=reply)
