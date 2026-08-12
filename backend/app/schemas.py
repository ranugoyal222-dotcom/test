import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(
        min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$"
    )
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    username: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PostCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    created_at: datetime
    author: UserOut


class PageMeta(BaseModel):
    page: int
    limit: int
    total: int
    has_more: bool


class PostPage(BaseModel):
    items: list[PostOut]
    meta: PageMeta


class UserOutWithStats(UserOut):
    follower_count: int = 0
    following_count: int = 0
    post_count: int = 0
    is_following: bool = False


class UserPage(BaseModel):
    items: list[UserOutWithStats]
    meta: PageMeta


class FollowResponse(BaseModel):
    following: bool
    target_id: uuid.UUID
