"""Cognitive IDE API Server — FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings as app_settings
from core.database import engine, init_db
from routers import projects, cognition, ai, ws
from routers import settings as settings_router
from routers import filesystem

app = FastAPI(
    title="Cognitive IDE API",
    version="0.1.0-alpha",
    description="项目认知图谱驱动的开发环境 — 后端服务",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS — 开发阶段允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(cognition.router, prefix="/api/v1/cognition", tags=["cognition"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(settings_router.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(filesystem.router, prefix="/api/v1/fs", tags=["filesystem"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])


@app.on_event("startup")
async def startup():
    """Initialize database and services on startup."""
    await init_db()
    from services.graph_engine import graph_engine
    graph_engine.initialize()
    from services.sync_service import sync_service
    await sync_service.initialize()


@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "ok",
        "version": "0.1.0-alpha",
        "services": {
            "database": "connected",
            "graph_engine": "ready",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )