from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    EMBED_MODEL: str = "all-MiniLM-L6-v2"
    CHROMA_DB_PATH: str = "/app/data/vectorstore"   # ← changed
    UPLOAD_DIR: str = "/app/data/uploads"           # ← changed
    MAX_UPLOAD_SIZE_MB: int = 100
    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 150
    TOP_K_RESULTS: int = 5
    CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'

    def get_cors_origins(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    class Config:
        env_file = ".env"


settings = Settings()