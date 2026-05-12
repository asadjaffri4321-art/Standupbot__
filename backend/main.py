from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import RedirectResponse
from db import init_db
from auth import router as auth_router
from routes.projects import router as projects_router
from routes.members import router as members_router, router_global as members_global_router
from routes.standups import router as standups_router
from routes.briefs import router as briefs_router
import os

app = FastAPI(title="StandupBot", version="1.0.0")

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:8080",
]
railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
if railway_domain:
    origins.append(f"https://{railway_domain}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(members_router)
app.include_router(members_global_router)
app.include_router(standups_router)
app.include_router(briefs_router)

frontend_dir = os.path.join(os.path.dirname(__file__), "..", "dist", "client")
if os.path.isdir(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


@app.get("/api/pending-invites")
def get_pending_invites(request: Request):
    from auth import get_current_user
    user = get_current_user(request)
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    from db import get_db_connection
    db = get_db_connection()
    try:
        invites = db.execute(
            """
            SELECT pm.*, p.name as project_name 
            FROM project_members pm 
            JOIN projects p ON pm.project_id = p.id 
            WHERE pm.user_id = ? AND pm.status = 'invited'
            """,
            (user["id"],),
        ).fetchall()
        return [dict(i) for i in invites]
    finally:
        db.close()


@app.get("/api/me")
def get_me(request: Request):
    from auth import get_current_user
    user = get_current_user(request)
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@app.get("/api/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)