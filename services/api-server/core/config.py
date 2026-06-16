"""Application configuration — environment variables and defaults."""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Global application settings loaded from environment / .env file."""

    # Application
    app_name: str = "Cognitive IDE"
    app_version: str = "0.1.0-alpha"
    debug: bool = True

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database — PostgreSQL
    database_url: str = "postgresql+asyncpg://cogide:cogide@localhost:5432/cognitive_ide"

    # Redis (optional, for WebSocket state)
    redis_url: str = "redis://localhost:6379/0"

    # CORS
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Project storage
    projects_root: str = "/tmp/cognitive-ide/projects"

    # AI — OpenAI compatible
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o"

    # AI — Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    # Graph Engine
    graph_max_depth: int = 5

    # Analysis
    tree_sitter_languages: List[str] = ["typescript", "python"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()