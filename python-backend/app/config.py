from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    node_backend_url: str = "http://localhost:3001"
    anthropic_api_key: str = ""
    secret_key: str = "change_me"
    default_user_id: str = ""

    # MT5 trading
    mt5_login: int = 0
    mt5_password: str = ""
    mt5_server: str = ""

    # Risk management
    risk_per_trade_pct: float = 1.0
    max_open_trades: int = 5
    max_daily_loss_pct: float = 3.0

    class Config:
        env_file = ".env"
        extra = "ignore"  
        env_file_encoding = "utf-8"

settings = Settings()