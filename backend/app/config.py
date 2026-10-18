import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_PATH = "/tmp/guestverify.db" if os.getenv("VERCEL") else str(BASE_DIR / "guestverify.db")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///" + DEFAULT_DATABASE_PATH)
APP_ENV = os.getenv("APP_ENV", "demo")
DEMO_OWNER_ID = os.getenv("DEMO_OWNER_ID", "demo-owner")
SECRET_KEY = os.getenv("SECRET_KEY", "guestverify-demo-secret")
AI_PROVIDER = os.getenv("AI_PROVIDER", "local").strip().lower()
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_MODEL_ID = os.getenv("AWS_MODEL_ID", "us.amazon.nova-lite-v1:0")
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]
MCP_PORT = int(os.getenv("MCP_PORT", "8001"))
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
