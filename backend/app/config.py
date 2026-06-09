from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    ollama_url: str = "http://localhost:11434"
    database_url: str = "sqlite:///./dispatch.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    default_model: str = "llama3"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
