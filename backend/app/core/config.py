from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Hackaton API"
    app_version: str = "0.1.0"
    debug: bool = True
    # In production set CORS_ORIGINS as a JSON array of allowed origins, e.g.
    # CORS_ORIGINS=["https://wakuaipa.vercel.app","https://your-domain.com"]
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://*.vercel.app",  # any Vercel preview deploy
    ]
    # Use this regex to also accept Vercel preview URLs (vercel auto-generates them)
    cors_allow_origin_regex: str = r"https://.*\.vercel\.app"
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_seconds: int = 86400  # 24h — NASA POWER climatology rarely changes

    # LM Studio (OpenAI-compatible local server)
    lmstudio_url: str = "http://127.0.0.1:1234/v1"
    lmstudio_model: str = "qwen/qwen3-vl-4b"
    lmstudio_timeout: float = 180.0
    lmstudio_max_tokens: int = 2500
    lmstudio_temperature: float = 0.6

    # MySQL
    database_url: str = "mysql+pymysql://root:@127.0.0.1:3306/hackaton?charset=utf8mb4"
    database_echo: bool = False

    # JWT auth
    jwt_secret: str = "change-me-in-production-please-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Chat
    chat_history_window: int = 20  # last N messages sent as context to LLM


settings = Settings()
