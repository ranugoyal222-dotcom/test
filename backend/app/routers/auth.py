from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=schemas.TokenResponse,
    status_code=201,
)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    existing = (
        db.query(models.User)
        .filter(
            or_(
                models.User.email == payload.email,
                models.User.username == payload.username,
            )
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="Email or username already registered"
        )
    user = models.User(
        name=payload.name.strip(),
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return schemas.TokenResponse(
        access_token=create_access_token(user.id), user=user
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.email == payload.email)
        .first()
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return schemas.TokenResponse(
        access_token=create_access_token(user.id), user=user
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
