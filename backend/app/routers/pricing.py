"""比價：自己的比價清單。

一個「比價專案」＝想買的一樣東西（電腦、螢幕…），底下放多個候選（品牌/型號/報價）。
專案狀態分「未購買（shopping）」「已購買（bought）」；買了之後可記錄買的品牌與價格。
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import PriceOption, PriceProject

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


# ---------- 序列化 ----------


def _option_dict(o: PriceOption) -> dict:
    return {
        "id": o.id,
        "project_id": o.project_id,
        "brand": o.brand,
        "name": o.name,
        "price": o.price,
        "url": o.url,
        "store": o.store,
        "note": o.note,
        "sort": o.sort,
    }


def _project_dict(p: PriceProject, options: list[PriceOption]) -> dict:
    prices = [o.price for o in options if o.price is not None]
    return {
        "id": p.id,
        "name": p.name,
        "emoji": p.emoji,
        "note": p.note,
        "status": p.status,
        "sort": p.sort,
        "bought_option_id": p.bought_option_id,
        "bought_brand": p.bought_brand,
        "bought_price": p.bought_price,
        "bought_date": p.bought_date.isoformat() if p.bought_date else None,
        "option_count": len(options),
        "min_price": min(prices) if prices else None,
        "max_price": max(prices) if prices else None,
        "options": [
            _option_dict(o)
            for o in sorted(options, key=lambda x: (x.sort, x.id or 0))
        ],
    }


def _options_for(session: Session, project_id: int) -> list[PriceOption]:
    return session.exec(
        select(PriceOption).where(PriceOption.project_id == project_id)
    ).all()


# ---------- 專案 ----------


class ProjectIn(BaseModel):
    name: str
    emoji: str = "🛒"
    note: str = ""


@router.get("")
def list_projects(
    status: str | None = None,  # shopping / bought / None＝全部
    session: Session = Depends(get_session),
):
    projects = session.exec(
        select(PriceProject).order_by(PriceProject.sort, PriceProject.id.desc())
    ).all()
    if status:
        projects = [p for p in projects if p.status == status]
    all_options = session.exec(select(PriceOption)).all()
    by_project: dict[int, list[PriceOption]] = {}
    for o in all_options:
        by_project.setdefault(o.project_id, []).append(o)
    return [_project_dict(p, by_project.get(p.id, [])) for p in projects]


@router.post("", status_code=201)
def create_project(payload: ProjectIn, session: Session = Depends(get_session)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="請輸入專案名稱")
    p = PriceProject(
        name=payload.name.strip(),
        emoji=payload.emoji or "🛒",
        note=payload.note or "",
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    return _project_dict(p, [])


@router.put("/{project_id}")
def update_project(
    project_id: int, payload: ProjectIn, session: Session = Depends(get_session)
):
    p = session.get(PriceProject, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="找不到這個比價專案")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="請輸入專案名稱")
    p.name = payload.name.strip()
    p.emoji = payload.emoji or "🛒"
    p.note = payload.note or ""
    session.add(p)
    session.commit()
    session.refresh(p)
    return _project_dict(p, _options_for(session, project_id))


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, session: Session = Depends(get_session)):
    p = session.get(PriceProject, project_id)
    if p:
        for o in _options_for(session, project_id):
            session.delete(o)
        session.delete(p)
        session.commit()


# ---------- 標記購買狀態 ----------


class BuyBody(BaseModel):
    option_id: int | None = None  # 從哪個候選購買（可空）
    brand: str = ""
    price: float | None = None
    date: str | None = None  # YYYY-MM-DD；空＝今天


@router.post("/{project_id}/buy")
def mark_bought(
    project_id: int, body: BuyBody, session: Session = Depends(get_session)
):
    p = session.get(PriceProject, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="找不到這個比價專案")
    brand = body.brand.strip()
    price = body.price
    # 有指定候選但沒填品牌/價格 → 從候選帶入
    if body.option_id:
        opt = session.get(PriceOption, body.option_id)
        if opt and opt.project_id == project_id:
            if not brand:
                brand = (opt.brand or opt.name or "").strip()
            if price is None:
                price = opt.price
    try:
        bought_date = (
            date.fromisoformat(body.date) if body.date else date.today()
        )
    except ValueError:
        bought_date = date.today()
    p.status = "bought"
    p.bought_option_id = body.option_id
    p.bought_brand = brand
    p.bought_price = price
    p.bought_date = bought_date
    session.add(p)
    session.commit()
    session.refresh(p)
    return _project_dict(p, _options_for(session, project_id))


@router.post("/{project_id}/unbuy")
def mark_shopping(project_id: int, session: Session = Depends(get_session)):
    p = session.get(PriceProject, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="找不到這個比價專案")
    p.status = "shopping"
    p.bought_option_id = None
    p.bought_brand = ""
    p.bought_price = None
    p.bought_date = None
    session.add(p)
    session.commit()
    session.refresh(p)
    return _project_dict(p, _options_for(session, project_id))


# ---------- 候選（品牌/報價） ----------


class OptionIn(BaseModel):
    brand: str = ""
    name: str = ""
    price: float | None = None
    url: str = ""
    store: str = ""
    note: str = ""


@router.post("/{project_id}/options", status_code=201)
def create_option(
    project_id: int, payload: OptionIn, session: Session = Depends(get_session)
):
    p = session.get(PriceProject, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="找不到這個比價專案")
    existing = _options_for(session, project_id)
    o = PriceOption(
        project_id=project_id,
        brand=payload.brand.strip(),
        name=payload.name.strip(),
        price=payload.price,
        url=payload.url.strip(),
        store=payload.store.strip(),
        note=payload.note.strip(),
        sort=len(existing),
    )
    session.add(o)
    session.commit()
    session.refresh(o)
    return _option_dict(o)


@router.put("/options/{option_id}")
def update_option(
    option_id: int, payload: OptionIn, session: Session = Depends(get_session)
):
    o = session.get(PriceOption, option_id)
    if not o:
        raise HTTPException(status_code=404, detail="找不到這個候選")
    o.brand = payload.brand.strip()
    o.name = payload.name.strip()
    o.price = payload.price
    o.url = payload.url.strip()
    o.store = payload.store.strip()
    o.note = payload.note.strip()
    session.add(o)
    session.commit()
    session.refresh(o)
    return _option_dict(o)


@router.delete("/options/{option_id}", status_code=204)
def delete_option(option_id: int, session: Session = Depends(get_session)):
    o = session.get(PriceOption, option_id)
    if o:
        session.delete(o)
        session.commit()
