import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])


def _user_stats(db: Session, user_ids: list[int], viewer_id: int) -> dict[int, dict]:
    if not user_ids:
        return {}
    follower_counts = dict(
        db.query(models.Follower.following_id, func.count())
        .filter(models.Follower.following_id.in_(user_ids))
        .group_by(models.Follower.following_id)
        .all()
    )
    following_counts = dict(
        db.query(models.Follower.follower_id, func.count())
        .filter(models.Follower.follower_id.in_(user_ids))
        .group_by(models.Follower.follower_id)
        .all()
    )
    post_counts = dict(
        db.query(models.Post.user_id, func.count())
        .filter(models.Post.user_id.in_(user_ids))
        .group_by(models.Post.user_id)
        .all()
    )
    following_set = {
        row[0]
        for row in db.query(models.Follower.following_id)
        .filter(
            models.Follower.follower_id == viewer_id,
            models.Follower.following_id.in_(user_ids),
        )
        .all()
    }
    return {
        uid: {
            "following_count": following_counts.get(uid, 0),
            "follower_count": follower_counts.get(uid, 0),
            "post_count": post_counts.get(uid, 0),
            "is_following": uid in following_set,
        }
        for uid in user_ids
    }


def _to_out(user: models.User, stats: dict) -> schemas.UserOutWithStats:
    data = schemas.UserOutWithStats(
        id=user.id,
        name=user.name,
        username=user.username,
        created_at=user.created_at,
        **stats,
    )
    return data


@router.get("", response_model=schemas.UserPage)
def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.User)
        .filter(models.User.id != user.id)
        .order_by(models.User.created_at.asc(), models.User.id.asc())
    )
    total = query.count()
    users = query.offset((page - 1) * limit).limit(limit).all()
    stats = _user_stats(db, [u.id for u in users], user.id)
    return schemas.UserPage(
        items=[_to_out(u, stats[u.id]) for u in users],
        meta=schemas.PageMeta(
            page=page, limit=limit, total=total, has_more=page * limit < total
        ),
    )


@router.get("/recommended", response_model=schemas.UserPage)
def recommended_users(
    page: int = Query(1, ge=1),
    limit: int = Query(5, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    following_ids = [
        row[0]
        for row in db.query(models.Follower.following_id)
        .filter(models.Follower.follower_id == user.id)
        .all()
    ]
    follower_count = (
        db.query(func.count(models.Follower.follower_id))
        .filter(models.Follower.following_id == models.User.id)
        .correlate(models.User)
        .scalar_subquery()
    )
    query = (
        db.query(models.User)
        .filter(models.User.id != user.id)
        .order_by(follower_count.desc(), models.User.created_at.asc())
    )
    if following_ids:
        query = query.filter(~models.User.id.in_(following_ids))
    total = query.count()
    users = query.offset((page - 1) * limit).limit(limit).all()
    stats = _user_stats(db, [u.id for u in users], user.id)
    return schemas.UserPage(
        items=[_to_out(u, stats[u.id]) for u in users],
        meta=schemas.PageMeta(
            page=page, limit=limit, total=total, has_more=page * limit < total
        ),
    )


@router.get("/{user_id}", response_model=schemas.UserOutWithStats)
def get_user(
    user_id: uuid.UUID,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    stats = _user_stats(db, [target.id], user.id)
    return _to_out(target, stats[target.id])


@router.get("/{user_id}/posts", response_model=schemas.PostPage)
def user_posts(
    user_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    query = (
        db.query(models.Post)
        .filter(models.Post.user_id == user_id)
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


@router.get("/{user_id}/followers", response_model=schemas.UserPage)
def user_followers(
    user_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    query = (
        db.query(models.User)
        .join(models.Follower, models.Follower.follower_id == models.User.id)
        .filter(models.Follower.following_id == user_id)
        .order_by(models.Follower.created_at.desc())
    )
    total = query.count()
    users = query.offset((page - 1) * limit).limit(limit).all()
    stats = _user_stats(db, [u.id for u in users], user.id)
    return schemas.UserPage(
        items=[_to_out(u, stats[u.id]) for u in users],
        meta=schemas.PageMeta(
            page=page, limit=limit, total=total, has_more=page * limit < total
        ),
    )


@router.get("/{user_id}/following", response_model=schemas.UserPage)
def user_following(
    user_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    query = (
        db.query(models.User)
        .join(models.Follower, models.Follower.following_id == models.User.id)
        .filter(models.Follower.follower_id == user_id)
        .order_by(models.Follower.created_at.desc())
    )
    total = query.count()
    users = query.offset((page - 1) * limit).limit(limit).all()
    stats = _user_stats(db, [u.id for u in users], user.id)
    return schemas.UserPage(
        items=[_to_out(u, stats[u.id]) for u in users],
        meta=schemas.PageMeta(
            page=page, limit=limit, total=total, has_more=page * limit < total
        ),
    )


@router.post("/{user_id}/follow", response_model=schemas.FollowResponse)
def follow_user(
    user_id: uuid.UUID,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    exists = (
        db.query(models.Follower)
        .filter(
            models.Follower.follower_id == user.id,
            models.Follower.following_id == user_id,
        )
        .first()
    )
    if exists is None:
        db.add(models.Follower(follower_id=user.id, following_id=user_id))
        db.commit()
    return schemas.FollowResponse(following=True, target_id=user_id)


@router.delete("/{user_id}/follow", response_model=schemas.FollowResponse)
def unfollow_user(
    user_id: uuid.UUID,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    relation = (
        db.query(models.Follower)
        .filter(
            models.Follower.follower_id == user.id,
            models.Follower.following_id == user_id,
        )
        .first()
    )
    if relation is not None:
        db.delete(relation)
        db.commit()
    return schemas.FollowResponse(following=False, target_id=user_id)
