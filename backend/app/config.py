"""Configuration management for leak-monitor."""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    """Application configuration loaded from environment."""

    # Database
    database_url: str

    # RansomLook API
    ransomlook_base_url: str = "https://www.ransomlook.io"

    # Server settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Logging
    log_level: str = "INFO"

    # Export directory
    export_dir: str = "/app/exports"

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Optional: Pre-configured Anthropic API key
    # Users can also provide this via the UI
    anthropic_api_key: Optional[str] = None

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is required")

        return cls(
            database_url=database_url,
            ransomlook_base_url=os.environ.get(
                "RANSOMLOOK_BASE_URL",
                "https://www.ransomlook.io"
            ),
            api_host=os.environ.get("API_HOST", "0.0.0.0"),
            api_port=int(os.environ.get("API_PORT", "8000")),
            log_level=os.environ.get("LOG_LEVEL", "INFO"),
            export_dir=os.environ.get("EXPORT_DIR", "/app/exports"),
            frontend_url=os.environ.get("FRONTEND_URL", "http://localhost:3000"),
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )


# Global config instance
_config: Config | None = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = Config.from_env()
    return _config
