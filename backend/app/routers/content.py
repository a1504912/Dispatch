import re

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import ollama_client
from app.config import settings
from app.database import get_session
from app.models import Pillar, Platform
from app.schemas import AssistMode, AssistRequest, AssistResponse

router = APIRouter(prefix="/api/content", tags=["content"])

# Rough caption limits / habits per platform, fed to the model as constraints.
PLATFORM_GUIDE = {
    Platform.instagram: "Instagram：貼文文案上限約 2,200 字，前兩行要抓住目光，hashtag 5–15 個。",
    Platform.facebook: "Facebook：可以寫長一點、像在說故事，結尾加一個互動提問。",
    Platform.threads: "Threads：單則上限 500 字，口語、短句、像在聊天。",
    Platform.youtube: "YouTube：標題 100 字內，說明欄前 150 字最重要，附上章節時間軸建議。",
    Platform.tiktok: "TikTok：說明欄短而有梗，搭配 3–5 個 hashtag，開頭 3 秒的鉤子最重要。",
    Platform.x: "X (Twitter)：單則 280 字元內，一句話講清楚重點。",
    Platform.blog: "部落格：有標題、小標、段落結構，適合 SEO 的長文。",
    Platform.other: "通用社群平台。",
}

MODE_INSTRUCTIONS = {
    AssistMode.draft: "根據標題與方向，寫一篇可以直接發佈的貼文初稿。只輸出貼文本身。",
    AssistMode.titles: "提出 5 個吸睛的標題 / 開頭鉤子，每行一個，用數字編號，不要多做解釋。",
    AssistMode.hashtags: "提出 10–15 個適合的 hashtag，以空格分隔放在同一行，混合大流量與精準小眾標籤。",
    AssistMode.polish: "潤飾以下貼文：保留原意與作者語氣，讓節奏更順、開頭更抓人、結尾有行動呼籲。只輸出改好的貼文。",
    AssistMode.ideas: "根據這個主題方向，發想 8 個具體的貼文點子，每行一個：『標題 — 一句話說明切角』。",
}

THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)


def build_messages(payload: AssistRequest, pillar: Pillar | None) -> list[dict]:
    system = (
        "你是專業的自媒體內容企劃與文案。回答一律使用繁體中文（台灣用語），"
        "語氣自然、不浮誇、避免過度使用 emoji。"
    )
    context = [f"平台：{PLATFORM_GUIDE[payload.platform]}"]
    if pillar:
        context.append(f"主題方向：{pillar.name}")
        if pillar.description:
            context.append(f"方向說明：{pillar.description}")
        if pillar.audience:
            context.append(f"目標受眾：{pillar.audience}")
        if pillar.tone:
            context.append(f"語氣風格：{pillar.tone}")
    if payload.title:
        context.append(f"標題 / 主題：{payload.title}")
    if payload.body:
        context.append(f"目前內文：\n{payload.body}")

    user = "\n".join(context) + f"\n\n任務：{MODE_INSTRUCTIONS[payload.mode]}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


@router.post("/assist", response_model=AssistResponse)
async def assist(payload: AssistRequest, session: Session = Depends(get_session)):
    pillar = session.get(Pillar, payload.pillar_id) if payload.pillar_id else None
    if payload.mode == AssistMode.polish and not payload.body.strip():
        raise HTTPException(status_code=422, detail="潤飾需要先有內文")
    if payload.mode == AssistMode.ideas and not pillar and not payload.title.strip():
        raise HTTPException(status_code=422, detail="發想點子需要選一個主題方向或輸入主題")

    try:
        reply = await ollama_client.chat(
            settings.default_model, build_messages(payload, pillar), timeout=120.0
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to reach Ollama: {exc}") from exc

    # Reasoning models (e.g. qwen3) may prepend a <think> block; drop it.
    return AssistResponse(mode=payload.mode, result=THINK_BLOCK.sub("", reply).strip())
