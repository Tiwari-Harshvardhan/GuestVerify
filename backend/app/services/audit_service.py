import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditRecord


def list_audit(db: Session) -> list[dict[str, Any]]:
    rows = db.query(AuditRecord).order_by(AuditRecord.timestamp.desc()).all()
    return [{
        "id": row.id,
        "event_id": row.event_id,
        "correlation_id": row.correlation_id,
        "actor": row.actor,
        "event_type": row.event_type,
        "details": json.loads(row.details),
        "timestamp": row.timestamp.isoformat(),
    } for row in rows]
