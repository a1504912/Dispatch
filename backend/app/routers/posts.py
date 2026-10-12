import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.models import Pillar, Platform, Post, PostImage, PostMetric, PostStatus
from app.schemas import (
    MetricCreate,
    PostCreate,
    PostImageRead,
    PostRead,
    PostUpdate,
)

router = APIRouter(prefix="/api/posts", tags=["posts"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def upload_path() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _image_read(image: PostImage) -> PostImageRead:
    return PostImageRead(
        id=image.id,
        post_id=image.post_id,
        filename=image.filename,
        original_name=image.original_name,
        position=image.position,
        url=f"/uploads/{image.filename}",
    )


def _to_read(
    post: Post,
    images: list[PostImage],
    latest_metric: Optional[PostMetric],
) -> PostRead:
    return PostRead(
        **post.model_dump(),
        images=[_image_read(i) for i in sorted(images, key=lambda i: (i.position, i.id))],
        latest_metric=latest_metric,
    )


def _latest_metrics(session: Session, post_ids: list[int]) -> dict[int, PostMetric]:
    """Latest snapshot per post. Metrics are cumulative, so latest = current total."""
    if not post_ids:
        return {}
    rows = session.exec(
        select(PostMetric)
        .where(PostMetric.post_id.in_(post_ids))
        .order_by(PostMetric.recorded_at, PostMetric.id)
    ).all()
    latest: dict[int, PostMetric] = {}
    for row in rows:
        latest[row.post_id] = row
    return latest


def _read_one(session: Session, post: Post) -> PostRead:
    images = session.exec(select(PostImage).where(PostImage.post_id == post.id)).all()
    return _to_read(post, list(images), _latest_metrics(session, [post.id]).get(post.id))


def _get_post(session: Session, post_id: int) -> Post:
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


def _check_pillar(session: Session, pillar_id: Optional[int]) -> None:
    if pillar_id is not None and not session.get(Pillar, pillar_id):
        raise HTTPException(status_code=422, detail="Pillar not found")


def _stamp_published(post: Post) -> None:
    if post.status == PostStatus.published and post.published_at is None:
        post.published_at = post.scheduled_at or datetime.now()


# ---------- Posts ----------
@router.get("", response_model=list[PostRead])
def list_posts(
    status: Optional[PostStatus] = None,
    platform: Optional[Platform] = None,
    pillar_id: Optional[int] = None,
    q: Optional[str] = None,
    session: Session = Depends(get_session),
):
    query = select(Post)
    if status:
        query = query.where(Post.status == status)
    if platform:
        query = query.where(Post.platform == platform)
    if pillar_id is not None:
        query = query.where(Post.pillar_id == pillar_id)
    if q:
        like = f"%{q}%"
        query = query.where(Post.title.like(like) | Post.body.like(like) | Post.tags.like(like))
    posts = session.exec(query.order_by(Post.updated_at.desc())).all()

    ids = [p.id for p in posts]
    images_by_post: dict[int, list[PostImage]] = {i: [] for i in ids}
    if ids:
        for image in session.exec(select(PostImage).where(PostImage.post_id.in_(ids))).all():
            images_by_post[image.post_id].append(image)
    metrics = _latest_metrics(session, ids)
    return [_to_read(p, images_by_post[p.id], metrics.get(p.id)) for p in posts]


@router.post("", response_model=PostRead, status_code=201)
def create_post(payload: PostCreate, session: Session = Depends(get_session)):
    _check_pillar(session, payload.pillar_id)
    post = Post.model_validate(payload)
    _stamp_published(post)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _read_one(session, post)


@router.get("/{post_id}", response_model=PostRead)
def get_post(post_id: int, session: Session = Depends(get_session)):
    return _read_one(session, _get_post(session, post_id))


@router.patch("/{post_id}", response_model=PostRead)
def update_post(post_id: int, payload: PostUpdate, session: Session = Depends(get_session)):
    post = _get_post(session, post_id)
    changes = payload.model_dump(exclude_unset=True)
    if "pillar_id" in changes:
        _check_pillar(session, changes["pillar_id"])
    for key, value in changes.items():
        setattr(post, key, value)
    _stamp_published(post)
    post.updated_at = datetime.utcnow()
    session.add(post)
    session.commit()
    session.refresh(post)
    return _read_one(session, post)


@router.delete("/{post_id}", status_code=204)
def delete_post(post_id: int, session: Session = Depends(get_session)):
    post = _get_post(session, post_id)
    for image in session.exec(select(PostImage).where(PostImage.post_id == post_id)).all():
        (upload_path() / image.filename).unlink(missing_ok=True)
        session.delete(image)
    for metric in session.exec(select(PostMetric).where(PostMetric.post_id == post_id)).all():
        session.delete(metric)
    session.delete(post)
    session.commit()


# ---------- Images ----------
@router.post("/{post_id}/images", response_model=list[PostImageRead], status_code=201)
async def upload_images(
    post_id: int,
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_session),
):
    _get_post(session, post_id)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    existing = session.exec(select(PostImage).where(PostImage.post_id == post_id)).all()
    position = max((i.position for i in existing), default=-1) + 1

    created: list[PostImage] = []
    written: list[Path] = []
    try:
        for upload in files:
            ext = ALLOWED_IMAGE_TYPES.get(upload.content_type or "")
            if not ext:
                raise HTTPException(
                    status_code=415,
                    detail=f"{upload.filename}: 只接受 JPG / PNG / GIF / WebP 圖片",
                )
            data = await upload.read()
            if len(data) > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"{upload.filename}: 超過 {settings.max_upload_mb}MB 上限",
                )
            filename = f"{uuid.uuid4().hex}{ext}"
            target = upload_path() / filename
            target.write_bytes(data)
            written.append(target)
            image = PostImage(
                post_id=post_id,
                filename=filename,
                original_name=upload.filename or "",
                position=position,
            )
            position += 1
            session.add(image)
            created.append(image)
        session.commit()
    except Exception:
        session.rollback()
        for path in written:
            path.unlink(missing_ok=True)
        raise

    for image in created:
        session.refresh(image)
    return [_image_read(i) for i in created]


@router.delete("/{post_id}/images/{image_id}", status_code=204)
def delete_image(post_id: int, image_id: int, session: Session = Depends(get_session)):
    image = session.get(PostImage, image_id)
    if not image or image.post_id != post_id:
        raise HTTPException(status_code=404, detail="Image not found")
    (upload_path() / image.filename).unlink(missing_ok=True)
    session.delete(image)
    session.commit()


# ---------- Metrics ----------
@router.get("/{post_id}/metrics", response_model=list[PostMetric])
def list_metrics(post_id: int, session: Session = Depends(get_session)):
    _get_post(session, post_id)
    return session.exec(
        select(PostMetric)
        .where(PostMetric.post_id == post_id)
        .order_by(PostMetric.recorded_at, PostMetric.id)
    ).all()


@router.post("/{post_id}/metrics", response_model=PostMetric, status_code=201)
def add_metric(post_id: int, payload: MetricCreate, session: Session = Depends(get_session)):
    _get_post(session, post_id)
    data = payload.model_dump()
    if any(data[k] < 0 for k in ("views", "likes", "comments", "shares", "saves")):
        raise HTTPException(status_code=422, detail="Metrics cannot be negative")
    if data["recorded_at"] is None:
        data.pop("recorded_at")
    metric = PostMetric(post_id=post_id, **data)
    session.add(metric)
    session.commit()
    session.refresh(metric)
    return metric


@router.delete("/{post_id}/metrics/{metric_id}", status_code=204)
def delete_metric(post_id: int, metric_id: int, session: Session = Depends(get_session)):
    metric = session.get(PostMetric, metric_id)
    if not metric or metric.post_id != post_id:
        raise HTTPException(status_code=404, detail="Metric not found")
    session.delete(metric)
    session.commit()
