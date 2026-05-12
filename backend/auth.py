import os
import httpx
from datetime import datetime
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import URLSafeTimedSerializer, BadSignature
from db import get_db

router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SESSION_SECRET = os.getenv("SESSION_SECRET", "standupbot-hackathon-secret-change-in-prod")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080")

serializer = URLSafeTimedSerializer(SESSION_SECRET)

COOKIE_NAME = "standupbot_session"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60


def get_current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    # Fallback to Authorization header for cross-origin API calls
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        return None
    try:
        user_id = serializer.loads(token, max_age=COOKIE_MAX_AGE)
    except BadSignature:
        return None

    from db import get_db_connection
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(user) if user else None
    finally:
        conn.close()


def require_user(request: Request):
    user = get_current_user(request)
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("/auth/google")
def google_login():
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={REDIRECT_URI}&"
        f"response_type=code&"
        f"scope=openid email profile&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return RedirectResponse(auth_url)


@router.get("/auth/google/callback")
async def google_callback(code: str, request: Request):
    try:
        token_resp = await _exchange_code(code)
        
        if "error" in token_resp:
            return RedirectResponse(url=f"{FRONTEND_URL}/?error=oauth_failed")

        if "access_token" not in token_resp:
            print(f"Token response: {token_resp}")
            return RedirectResponse(url=f"{FRONTEND_URL}/?error=no_access_token")

        user_info = await _fetch_user_info(token_resp["access_token"])
    except Exception as e:
        print(f"OAuth error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/?error=oauth_exception")

    from db import get_db_connection
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (user_info["email"],)).fetchone()

        if existing:
            user_id = existing["id"]
            conn.execute(
                "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?",
                (user_info.get("name", ""), user_info.get("picture", ""), user_id),
            )
        else:
            if hasattr(conn, 'cursor_factory'):
                # PostgreSQL
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO users (email, name, avatar_url) VALUES (%s, %s, %s) RETURNING id",
                    (user_info["email"], user_info.get("name", ""), user_info.get("picture", "")),
                )
                user_id = cursor.fetchone()["id"]
                cursor.close()
            else:
                # SQLite
                cursor = conn.execute(
                    "INSERT INTO users (email, name, avatar_url) VALUES (?, ?, ?)",
                    (user_info["email"], user_info.get("name", ""), user_info.get("picture", "")),
                )
                user_id = cursor.lastrowid

            conn.execute(
                "UPDATE project_members SET user_id = ? WHERE email = ? AND user_id IS NULL",
                (user_id, user_info["email"]),
            )

        conn.commit()
    finally:
        conn.close()

    token = serializer.dumps(user_id)
    redirect_url = f"{FRONTEND_URL}/dashboard?token={token}"
    response = RedirectResponse(url=redirect_url)
    # Only set domain for localhost; omit it for production so browser uses current domain
    cookie_domain = "localhost" if "localhost" in FRONTEND_URL else None
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        domain=cookie_domain,
    )
    return response


@router.post("/auth/logout")
def logout(response: Response):
    cookie_domain = "localhost" if "localhost" in FRONTEND_URL else None
    response.delete_cookie(
        COOKIE_NAME,
        domain=cookie_domain,
        httponly=True,
        samesite="lax",
    )
    return {"ok": True}


async def _exchange_code(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        return resp.json()


async def _fetch_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return resp.json()