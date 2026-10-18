from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.api.routes import router
from app.config import CORS_ORIGINS
from app.database import Base, SessionLocal, engine
from app.models import DeliveryExpectation

app = FastAPI(title="GuestVerify", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


def seed_demo_data() -> None:
    with SessionLocal() as db:
        existing = db.query(DeliveryExpectation).count()
        if existing > 0:
            return
        now = datetime.utcnow()
        deliveries = [
            {
                "id": "seed-amazon-john",
                "company": "Amazon",
                "recipient": "John",
                "tracking_reference": "AMZ-2048",
                "expected_start": now - timedelta(hours=1),
                "expected_end": now + timedelta(hours=2),
                "destination": "porch_box",
                "status": "pending",
                "allowed_action": "leave_in_porch_box",
                "verification_evidence": "simulated_delivery_reference",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "seed-fedex-jane",
                "company": "FedEx",
                "recipient": "Jane",
                "tracking_reference": "FDX-9812",
                "expected_start": now - timedelta(days=1),
                "expected_end": now - timedelta(hours=2),
                "destination": "doorstep",
                "status": "expired",
                "allowed_action": "handover_only",
                "verification_evidence": "expired_tracking_reference",
                "created_at": now,
                "updated_at": now,
            },
        ]
        for item in deliveries:
            db.add(DeliveryExpectation(**item))
        db.commit()


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    seed_demo_data()


initialize_database()


@app.on_event("startup")
def startup() -> None:
    initialize_database()


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": "GuestVerify backend is running"}
