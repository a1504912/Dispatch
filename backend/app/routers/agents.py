from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import Agent
from app.schemas import AgentCreate, AgentStatusUpdate

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[Agent])
def list_agents(session: Session = Depends(get_session)):
    return session.exec(select(Agent)).all()


@router.post("", response_model=Agent, status_code=201)
def create_agent(payload: AgentCreate, session: Session = Depends(get_session)):
    agent = Agent.model_validate(payload)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    session.delete(agent)
    session.commit()


@router.patch("/{agent_id}/status", response_model=Agent)
def update_status(
    agent_id: int,
    payload: AgentStatusUpdate,
    session: Session = Depends(get_session),
):
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = payload.status
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent
