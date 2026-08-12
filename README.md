# Social feed app

A small social app with a Next.js frontend and a FastAPI backend backed by **PostgreSQL**.

Features:

- JWT authentication (register / login / me)
- Create and delete posts
- Follow / unfollow people
- Paginated feed of posts from people you follow (20 per page)

## Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (`psycopg2`), JWT via `python-jose`, passwords hashed with bcrypt.
- **Frontend**: Next.js (App Router) single-page client.

## Database

Tables: `users`, `posts`, `follower_info`. Every table has a UUID primary key `id`
(`gen_random_uuid()` in Postgres).

```text
users (id uuid PK, name, username, email, password_hash, created_at)
posts (id uuid PK, content, user_id uuid -> users.id, created_at)
follower_info (id uuid PK, follower_id uuid -> users.id, following_id uuid -> users.id, UNIQUE(follower_id, following_id))
```

The tables are created automatically by the API on startup. The app expects a
PostgreSQL server and reads its connection from `DATABASE_URL`:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/social
```

### Option A: Docker (easiest)

```bash
docker compose up -d          # starts Postgres on localhost:5432 (db "social")
```

### Option B: existing PostgreSQL

```bash
psql -U postgres -h localhost -f backend/setup_database.sql
```

## Run it

Open two terminals.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # adjust DATABASE_URL / SECRET_KEY as needed
uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Visit http://localhost:3000. The API documentation is at http://localhost:8000/docs.

## API

| Method | Path                    | Auth  | Description                              |
| ------ | ----------------------- | ----- | ---------------------------------------- |
| POST   | `/auth/register`        | No    | Create account, returns JWT              |
| POST   | `/auth/login`           | No    | Login with email + password, returns JWT |
| GET    | `/auth/me`              | Yes   | Current user                             |
| GET    | `/feed?page=&limit=`    | Yes   | Feed from followed users + yourself (default limit 20) |
| POST   | `/posts`                | Yes   | Create a post (`content`, max 500 chars) |
| GET    | `/posts`                | Yes   | Your posts, paginated                    |
| DELETE | `/posts/{id}`           | Yes   | Delete your own post                     |
| GET    | `/users`                | Yes   | Discover users (with follow stats), paginated |
| GET    | `/users/recommended`    | Yes   | Suggested people to follow, default limit 5, paginated (excludes self + already followed, sorted by follower count) |
| GET    | `/users/{id}`           | Yes   | Single user profile + follow stats       |
| GET    | `/users/{id}/posts`     | Yes   | Posts by a user, paginated               |
| GET    | `/users/{id}/followers` | Yes   | Users following this user, paginated     |
| GET    | `/users/{id}/following` | Yes   | Users this user follows, paginated       |
| POST   | `/users/{id}/follow`    | Yes   | Follow a user                            |
| DELETE | `/users/{id}/follow`    | Yes   | Unfollow a user                          |

All authenticated endpoints use `Authorization: Bearer <token>`.

## Environment variables

Backend:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/social
SECRET_KEY=change-me-in-production   # set a strong random value
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=http://localhost:3000
```

`CORS_ORIGINS` can contain multiple comma-separated frontend URLs. `CORS_ORIGINS`
and `SECRET_KEY` must be set for a deployed backend; `SECRET_KEY` must stay the
same across restarts or all tokens are invalidated.
