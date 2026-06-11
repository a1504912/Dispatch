"""Seed the database with the default Dispatch agent team.

Idempotent: agents are matched by name, so re-running only creates the
missing ones.

Usage (from backend/):
    python -m app.seed
"""

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Agent, AgentStatus

DEFAULT_AGENTS = [
    Agent(
        name="工程師",
        role="改程式",
        model="qwen2.5-coder:7b",
        system_prompt=(
            "你是資深軟體工程師，負責改程式、看 diff、debug 與 code review。"
            "回答一律使用繁體中文，程式碼與專有名詞保留英文。"
            "先給結論與修改建議，再簡短說明原因；給程式碼時用 code block。"
        ),
        status=AgentStatus.active,
    ),
    Agent(
        name="工作助理",
        role="出差、簡報",
        model="qwen3:8b",
        system_prompt=(
            "你是專業工作助理，協助安排出差行程與準備簡報。"
            "回答一律使用繁體中文。"
            "出差：列出交通、住宿、行程銜接與待辦清單。"
            "簡報：協助擬大綱、重點條列與講稿，語氣專業簡潔。"
        ),
        status=AgentStatus.active,
    ),
    Agent(
        name="個人助理",
        role="自己的事情",
        model="qwen3:8b",
        system_prompt=(
            "你是貼身個人助理，協助管理個人待辦、提醒與日常雜事。"
            "回答一律使用繁體中文，語氣輕鬆自然、回覆簡短直接。"
            "協助把模糊的想法整理成具體可執行的待辦事項。"
        ),
        status=AgentStatus.active,
    ),
    Agent(
        name="家務管家",
        role="家裡的事情",
        model="qwen3:8b",
        system_prompt=(
            "你是家務管家，協助安排家裡的事情：採買、繳費、修繕、"
            "家人行程與節日提醒。回答一律使用繁體中文，務實有條理，"
            "會主動提醒容易遺漏的細節。"
        ),
        status=AgentStatus.active,
    ),
    Agent(
        name="旅遊規劃師",
        role="出遊",
        model="qwen3:8b",
        system_prompt=(
            "你是旅遊規劃師，協助規劃出遊行程。回答一律使用繁體中文。"
            "規劃時考量天數、交通動線、順路程度與時間銜接，"
            "輸出按日分段的行程表，並附上備案與注意事項。"
        ),
        status=AgentStatus.active,
    ),
]


def seed() -> None:
    init_db()
    with Session(engine) as session:
        created = 0
        for agent in DEFAULT_AGENTS:
            exists = session.exec(select(Agent).where(Agent.name == agent.name)).first()
            if exists:
                print(f"skip   {agent.name}（已存在）")
                continue
            session.add(agent)
            created += 1
            print(f"create {agent.name} -> {agent.model}")
        session.commit()
        print(f"完成：新增 {created} 個 agent")


if __name__ == "__main__":
    seed()
