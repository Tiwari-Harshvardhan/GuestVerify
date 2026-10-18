import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ActionRecord, HomeownerApproval, VisitorEvent


def execute_simulated_action(db: Session, event_id: str, requested_by: str = "demo-owner") -> dict[str, Any]:
    event = db.query(VisitorEvent).filter(VisitorEvent.id == event_id).first()
    if not event:
        raise ValueError("Event not found")
    approval = db.query(HomeownerApproval).filter(HomeownerApproval.event_id == event_id).order_by(HomeownerApproval.timestamp.desc()).first()
    if not approval or approval.decision != "approve":
        raise PermissionError("Homeowner approval required")
    record = ActionRecord(
        id=str(uuid.uuid4()),
        event_id=event_id,
        action_type="simulated_porch_box",
        authorization_check_result="approved_by_homeowner",
        execution_mode="simulated",
        result="simulated_action_completed_no_physical_lock_touched",
    )
    db.add(record)
    db.commit()
    event.processing_status = "COMPLETED"
    db.commit()
    return {
        "event_id": event_id,
        "action_type": record.action_type,
        "status": "completed",
        "message": "Approval recorded. The simulated porch-box action completed; no physical device was operated.",
    }


def approve_request(db: Session, event_id: str, approver: str = "demo-owner") -> dict[str, Any]:
    approval = HomeownerApproval(
        id=str(uuid.uuid4()),
        event_id=event_id,
        requested_action="leave_in_porch_box",
        decision="approve",
        approver=approver,
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(approval)
    db.commit()
    return {"status": "approved", "event_id": event_id, "approver": approver}


def deny_request(db: Session, event_id: str, approver: str = "demo-owner") -> dict[str, Any]:
    approval = HomeownerApproval(
        id=str(uuid.uuid4()),
        event_id=event_id,
        requested_action="leave_in_porch_box",
        decision="deny",
        approver=approver,
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(approval)
    db.commit()
    return {"status": "denied", "event_id": event_id, "approver": approver}
