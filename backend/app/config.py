from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    ollama_url: str = "http://localhost:11434"
    database_url: str = "sqlite:///./dispatch.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_model: str = "qwen3:8b"
    vision_model: str = "qwen2.5vl:7b"

    # 前端網址（OAuth 完成後導回）
    frontend_url: str = "http://localhost:5173"
    # 行事曆時區（推/拉 Google 事件時換算用）
    timezone: str = "Asia/Taipei"

    # Google 日曆 OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/google/callback"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
