from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import DeliveryExpectation


def list_deliveries(db: Session) -> list[dict[str, Any]]:
    rows = db.query(DeliveryExpectation).all()
    return [serialize_delivery(row) for row in rows]


def get_delivery(db: Session, delivery_id: str) -> DeliveryExpectation | None:
    return db.query(DeliveryExpectation).filter(DeliveryExpectation.id == delivery_id).first()


def serialize_delivery(row: DeliveryExpectation) -> dict[str, Any]:
    return {
        "id": row.id,
        "company": row.company,
        "recipient": row.recipient,
        "tracking_reference": row.tracking_reference,
        "expected_start": row.expected_start.isoformat(),
        "expected_end": row.expected_end.isoformat(),
        "destination": row.destination,
        "status": row.status,
        "allowed_action": row.allowed_action,
        "verification_evidence": row.verification_evidence,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


def create_delivery(db: Session, payload: dict[str, Any]) -> DeliveryExpectation:
    row = DeliveryExpectation(**payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def revoke_delivery(db: Session, delivery_id: str) -> DeliveryExpectation:
    row = get_delivery(db, delivery_id)
    if not row:
        raise ValueError("Delivery not found")
    row.status = "cancelled"
    row.updated_at = datetime.utcnow()
    db.commit()
    return row
