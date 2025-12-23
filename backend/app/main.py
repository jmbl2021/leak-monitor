"""FastAPI application for leak-monitor."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_config
from .core.database import init_db, close_db
from .services import close_ransomlook_client
from .api import health, victims, monitors, analysis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    # Startup
    config = get_config()
    logger.info(f"Starting leak-monitor API on {config.api_host}:{config.api_port}")

    await init_db()
    logger.info("Database initialized")

    yield

    # Shutdown
    logger.info("Shutting down leak-monitor API")
    await close_db()
    await close_ransomlook_client()


# Create FastAPI app
app = FastAPI(
    title="Leak Monitor API",
    description="AI-powered ransomware victim tracking and threat intelligence platform",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
config = get_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(victims.router, prefix="/api/victims", tags=["victims"])
app.include_router(monitors.router, prefix="/api/monitors", tags=["monitors"])
app.include_router(analysis.router, prefix="/api/analyze", tags=["analysis"])

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Leak Monitor API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health"
    }


if __name__ == "__main__":
    import uvicorn
    config = get_config()
    uvicorn.run(
        "app.main:app",
        host=config.api_host,
        port=config.api_port,
        log_level=config.log_level.lower(),
        reload=False
    )
