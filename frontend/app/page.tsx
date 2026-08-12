"use client";

import { FormEvent, useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

type User = { id: string; name: string; username: string; created_at: string };
type Post = { id: string; content: string; created_at: string; author: User };
type UserWithStats = User & {
  follower_count: number;
  following_count: number;
  post_count: number;
  is_following: boolean;
};
type PageMeta = { page: number; limit: number; total: number; has_more: boolean };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "social_token";
const USER_KEY = "social_user";

type Mode = "login" | "register";
type Tab = "feed" | "myposts" | "discover" | "network";
type NetView = "followers" | "following";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [tab, setTab] = useState<Tab>("feed");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);

  const [feed, setFeed] = useState<Post[]>([]);
  const [feedMeta, setFeedMeta] = useState<PageMeta | null>(null);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [myMeta, setMyMeta] = useState<PageMeta | null>(null);
  const [discover, setDiscover] = useState<UserWithStats[]>([]);
  const [discoverMeta, setDiscoverMeta] = useState<PageMeta | null>(null);
  const [netView, setNetView] = useState<NetView>("followers");
  const [followers, setFollowers] = useState<UserWithStats[]>([]);
  const [followersMeta, setFollowersMeta] = useState<PageMeta | null>(null);
  const [following, setFollowing] = useState<UserWithStats[]>([]);
  const [followingMeta, setFollowingMeta] = useState<PageMeta | null>(null);
  const [posting, setPosting] = useState(false);
  const [compose, setCompose] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setUser(null);
    setFeed([]);
    setFeedMeta(null);
    setMyPosts([]);
    setDiscover([]);
    setFollowers([]);
    setFollowersMeta(null);
    setFollowing([]);
    setFollowingMeta(null);
    setError("");
  }, []);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (response.status === 401 && !path.startsWith("/auth/")) {
      logout();
      throw new Error("Session expired. Please sign in again.");
    }
    if (response.status === 204) return undefined as T;
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { detail?: string }).detail ?? "Something went wrong.");
    }
    return response.json() as Promise<T>;
  }

  async function loadPage<T>(
    path: string,
    page: number,
    setItems: Dispatch<SetStateAction<T[]>>,
    setMeta: (meta: PageMeta) => void,
    append: boolean,
  ) {
    try {
      const data = await api<{ items: T[]; meta: PageMeta }>(
        `${path}?page=${page}&limit=20`,
      );
      setMeta(data.meta);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!getToken()) return;
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError("");
    loadPage<Post>("/feed", 1, setFeed, setFeedMeta, false).finally(() =>
      setLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user || tab !== "discover") return;
    loadPage<UserWithStats>("/users", 1, setDiscover, setDiscoverMeta, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tab]);

  useEffect(() => {
    if (!user || tab !== "network") return;
    loadPage<UserWithStats>(
      `/users/${user.id}/followers`,
      1,
      setFollowers,
      setFollowersMeta,
      false,
    );
    loadPage<UserWithStats>(
      `/users/${user.id}/following`,
      1,
      setFollowing,
      setFollowingMeta,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tab]);

  useEffect(() => {
    if (!user || tab !== "myposts") return;
    loadPage<Post>("/posts", 1, setMyPosts, setMyMeta, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tab]);

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setBusy(true);
    try {
      const body =
        mode === "register"
          ? { name, username, email, password }
          : { email, password };
      const data = await api<{ access_token: string; user: User }>(
        mode === "register" ? "/auth/register" : "/auth/login",
        { method: "POST", body: JSON.stringify(body) },
      );
      window.localStorage.setItem(TOKEN_KEY, data.access_token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPost(event: FormEvent) {
    event.preventDefault();
    const content = compose.trim();
    if (!content) return;
    setPosting(true);
    setError("");
    try {
      const post = await api<Post>("/posts", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setCompose("");
      setFeed((current) => [post, ...current]);
      setMyPosts((current) => [post, ...current]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function toggleFollow(target: UserWithStats) {
    const method = target.is_following ? "DELETE" : "POST";
    setError("");
    try {
      await api<{ following: boolean; target_id: string }>(
        `/users/${target.id}/follow`,
        { method },
      );
      const updated: UserWithStats = {
        ...target,
        is_following: !target.is_following,
        follower_count: target.follower_count + (target.is_following ? -1 : 1),
      };
      const patch = (list: UserWithStats[]) =>
        list
          .filter((item) => updated.is_following || item.id !== target.id)
          .map((item) => (item.id === target.id ? updated : item));
      setDiscover((current) => patch(current));
      setFollowers((current) => patch(current));
      setFollowing((current) => patch(current));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deletePost(postId: string) {
    setError("");
    try {
      await api(`/posts/${postId}`, { method: "DELETE" });
      setFeed((current) => current.filter((p) => p.id !== postId));
      setMyPosts((current) => current.filter((p) => p.id !== postId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!user) {
    return (
      <main className="shell">
        <section className="hero center">
          <p className="eyebrow">A FEED FOR YOUR PEOPLE</p>
          <h1>Share. Follow.<br /><em>Stay close.</em></h1>
          <p className="intro">Sign in to read the posts of the people you follow and share your own.</p>
        </section>
        <section className="card" aria-label="Sign in">
          <div className="auth-tabs" role="tablist" aria-label="Auth mode">
            {(["login", "register"] as const).map((item) => (
              <button key={item} className={mode === item ? "selected" : ""} onClick={() => setMode(item)}>
                {item === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <form className="auth-form" onSubmit={handleAuth}>
            {mode === "register" && (
              <>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" required />
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username (letters, numbers, _)" aria-label="Username" required minLength={3} maxLength={50} />
              </>
            )}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" required minLength={6} />
            {authError && <p className="error">{authError}</p>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONNECTED</p>
          <h1 className="brand">Hello, {user.name.split(" ")[0]}.</h1>
        </div>
        <div className="topbar-actions">
          <span className="chip">@{user.username}</span>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="compose" aria-label="Create a post">
        <form onSubmit={submitPost}>
          <textarea
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            placeholder="Share something with your people…"
            aria-label="Post content"
            maxLength={500}
            rows={2}
          />
          <div className="compose-row">
            <span className="hint">{compose.length}/500</span>
            <button type="submit" className="primary" disabled={posting || !compose.trim()}>
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </section>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {(["feed", "myposts", "discover", "network"] as const).map((item) => (
          <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>
            {item === "feed" ? "Your feed" : item === "myposts" ? "Your posts" : item === "discover" ? "Discover people" : "Followers & following"}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}

      {(tab === "feed" || tab === "myposts") && (
        <div className="post-list">
          {loading && tab === "feed" ? (
            <p className="empty">Loading your feed…</p>
          ) : (tab === "feed" ? feed : myPosts).length === 0 ? (
            <p className="empty">
              {tab === "feed"
                ? "Nothing here yet. Follow people or write your first post."
                : "You haven't posted yet. Say hello!"}
            </p>
          ) : (
            (tab === "feed" ? feed : myPosts).map((post) => (
              <article className="post" key={post.id}>
                <div className="post-head">
                  <span className="avatar">{post.author.name.charAt(0).toUpperCase()}</span>
                  <div className="post-author">
                    <strong>{post.author.name}</strong>
                    <span>@{post.author.username} · {timeAgo(post.created_at)}</span>
                  </div>
                  {post.author.id === user.id && (
                    <button className="delete" onClick={() => deletePost(post.id)} aria-label="Delete post">×</button>
                  )}
                </div>
                <p className="post-content">{post.content}</p>
              </article>
            ))
          )}
          {(tab === "feed" ? feedMeta : myMeta)?.has_more && (
            <button className="load-more" onClick={() => loadPage<Post>(tab === "feed" ? "/feed" : "/posts", (tab === "feed" ? feedMeta : myMeta)!.page + 1, tab === "feed" ? setFeed : setMyPosts, tab === "feed" ? setFeedMeta : setMyMeta, true)}>
              Load more
            </button>
          )}
        </div>
      )}

      {tab === "discover" && (
        <div className="user-list">
          {discover.length === 0 ? (
            <p className="empty">No other users yet. Invite a friend!</p>
          ) : (
            discover.map((person) => (
              <article className="user" key={person.id}>
                <span className="avatar">{person.name.charAt(0).toUpperCase()}</span>
                <div className="user-info">
                  <strong>{person.name}</strong>
                  <span>@{person.username} · {person.post_count} posts · {person.follower_count} followers</span>
                </div>
                <button className={person.is_following ? "ghost" : "primary"} onClick={() => toggleFollow(person)}>
                  {person.is_following ? "Following" : "Follow"}
                </button>
              </article>
            ))
          )}
          {discoverMeta?.has_more && (
            <button className="load-more" onClick={() => loadPage<UserWithStats>("/users", discoverMeta.page + 1, setDiscover, setDiscoverMeta, true)}>
              Load more
            </button>
          )}
        </div>
      )}

      {tab === "network" && (
        <div>
          <nav className="tabs sub" role="tablist" aria-label="Followers or following">
            {(["followers", "following"] as const).map((item) => (
              <button key={item} className={netView === item ? "selected" : ""} onClick={() => setNetView(item)}>
                {item === "followers" ? `Followers (${followersMeta?.total ?? 0})` : `Following (${followingMeta?.total ?? 0})`}
              </button>
            ))}
          </nav>
          <div className="user-list">
            {(netView === "followers" ? followers : following).length === 0 ? (
              <p className="empty">
                {netView === "followers" ? "No followers yet." : "You aren't following anyone yet."}
              </p>
            ) : (
              (netView === "followers" ? followers : following).map((person) => (
                <article className="user" key={person.id}>
                  <span className="avatar">{person.name.charAt(0).toUpperCase()}</span>
                  <div className="user-info">
                    <strong>{person.name}</strong>
                    <span>@{person.username} · {person.post_count} posts · {person.follower_count} followers</span>
                  </div>
                  <button className={person.is_following ? "ghost" : "primary"} onClick={() => toggleFollow(person)}>
                    {person.is_following ? "Following" : "Follow"}
                  </button>
                </article>
              ))
            )}
            {(netView === "followers" ? followersMeta : followingMeta)?.has_more && (
              <button className="load-more" onClick={() => loadPage<UserWithStats>(`/users/${user.id}/${netView}`, (netView === "followers" ? followersMeta : followingMeta)!.page + 1, netView === "followers" ? setFollowers : setFollowing, netView === "followers" ? setFollowersMeta : setFollowingMeta, true)}>
                Load more
              </button>
            )}
          </div>
        </div>
      )}

      <p className="footer-note">Small posts. Real connections.</p>
    </main>
  );
}
