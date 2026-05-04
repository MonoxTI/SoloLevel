from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    node_backend_url: str = "http://localhost:3001"
    anthropic_api_key: str = ""
    secret_key: str = "change_me"
    default_user_id: str = ""

    class Config:
        env_file = ".env"


settings = Settings()