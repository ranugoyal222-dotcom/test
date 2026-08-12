import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(tags=["posts"])


@router.get("/feed", response_model=schemas.PostPage)
def feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    following_ids = [
        row[0]
        for row in db.query(models.Follower.following_id)
        .filter(models.Follower.follower_id == user.id)
        .all()
    ]
    following_ids.append(user.id)

    query = (
        db.query(models.Post)
        .filter(models.Post.user_id.in_(following_ids))
        .order_by(models.Post.created_at.desc(), models.Post.id.desc())
    )
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return schemas.PostPage(
        items=items,
        meta=schemas.PageMeta(
            page=page, limit=limit, total=total, has_more=page * limit < total
        ),
    )


@router.get("/posts", response_model=schemas.PostPage)
def my_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Post)
        .filter(models.Post.user_id == user.id)
        .order_by(models.Post.created_at.desc(), models.Post.id.desc())
    )
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return schemas.PostPage(
        items=items,
        meta=schemas.PageMeta(
            page=page, limit=limit, total=total, has_more=page * limit < total
        ),
    )


@router.post(
    "/posts",
    response_model=schemas.PostOut,
    status_code=201,
)
def create_post(
    payload: schemas.PostCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = models.Post(content=payload.content.strip(), user_id=user.id)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: uuid.UUID,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.get(models.Post, post_id)
    if post is None or post.user_id != user.id:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()
