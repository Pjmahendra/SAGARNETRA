from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = Field(default="dev", alias="ENV")
    mongodb_uri: str = Field(default="mongodb://localhost:27017", alias="MONGODB_URI")
    mongodb_db: str = Field(default="sagarnetra", alias="MONGODB_DB")
    jwt_secret: str = Field(alias="JWT_SECRET", min_length=16)
    jwt_expires_hours: int = Field(default=12, alias="JWT_EXPIRES_HOURS")
    cors_origins: Annotated[list[str], NoDecode] = Field(default=["http://localhost:5173"], alias="CORS_ORIGINS")
    login_rate_limit: str = Field(default="5/minute", alias="LOGIN_RATE_LIMIT")
    aisstream_api_key: str = Field(default="", alias="AISSTREAM_API_KEY")
    cdse_token: str = Field(default="", alias="CDSE_TOKEN")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    version: str = "0.1.0"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split(cls, v: object) -> object:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
