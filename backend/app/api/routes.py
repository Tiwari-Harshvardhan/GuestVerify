from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.config import DEMO_OWNER_ID
from app.database import get_db
from app.models import ActionRecord, AuditRecord, DeliveryExpectation, EvidenceItem, HomeownerApproval, VerificationDecision, VisitorEvent
from app.schemas import ActionRequest, AssistantChatRequest, AssistantChatResponse, DeliveryExpectationCreate, DeliveryExpectationRead, HealthResponse, HomeownerApprovalCreate, IntegrationStatus
from app.services.action_service import approve_request, deny_request, execute_simulated_action
from app.services.audit_service import list_audit
from app.services.bedrock_service import BedrockService
from app.services.delivery_service import create_delivery, get_delivery, list_deliveries, revoke_delivery, serialize_delivery
from app.services.event_service import EventProcessor
from app.services.extraction import extract_claim_from_text
from app.services.provider_service import ProviderService

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
def health():
    provider_status = ProviderService().get_provider_status()
    return {
        "status": "ok",
        "mode": provider_status["provider_mode"],
        "provider_mode": provider_status["provider_mode"],
        "bedrock_enabled": provider_status.get("provider") == "bedrock" and provider_status.get("configured") is True,
    }


@router.get("/api/deliveries")
def get_deliveries(db: Session = Depends(get_db)):
    return list_deliveries(db)


@router.post("/api/deliveries", response_model=DeliveryExpectationRead)
def create_delivery_route(payload: DeliveryExpectationCreate, db: Session = Depends(get_db)):
    if payload.expected_end <= payload.expected_start:
        raise HTTPException(status_code=400, detail="Expected end must be later than expected start")
    row = create_delivery(db, {
        "id": str(uuid.uuid4()),
        "company": payload.company,
        "recipient": payload.recipient,
        "tracking_reference": payload.tracking_reference,
        "expected_start": payload.expected_start,
        "expected_end": payload.expected_end,
        "destination": payload.destination,
        "status": payload.status,
        "allowed_action": payload.allowed_action,
        "verification_evidence": payload.verification_evidence,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })
    return serialize_delivery(row)


@router.get("/api/deliveries/{delivery_id}")
def get_delivery_route(delivery_id: str, db: Session = Depends(get_db)):
    item = get_delivery(db, delivery_id)
    if not item:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return serialize_delivery(item)


@router.patch("/api/deliveries/{delivery_id}")
def patch_delivery_route(delivery_id: str, patch: dict, db: Session = Depends(get_db)):
    row = get_delivery(db, delivery_id)
    if not row:
        raise HTTPException(status_code=404, detail="Delivery not found")
    for key, value in patch.items():
        if hasattr(row, key):
            setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    return serialize_delivery(row)


@router.post("/api/deliveries/{delivery_id}/revoke")
def revoke_delivery_route(delivery_id: str, db: Session = Depends(get_db)):
    return serialize_delivery(revoke_delivery(db, delivery_id))


@router.get("/api/events")
def list_events(db: Session = Depends(get_db)):
    rows = db.query(VisitorEvent, VerificationDecision).outerjoin(
        VerificationDecision,
        VerificationDecision.event_id == VisitorEvent.id,
    ).order_by(VisitorEvent.created_at.desc()).all()
    return [{
        "id": row.id,
        "event_type": row.event_type,
        "device_id": row.device_id,
        "event_timestamp": row.event_timestamp.isoformat(),
        "source": row.source,
        "transcript": row.transcript,
        "snapshot_reference": row.snapshot_reference,
        "processing_status": row.processing_status,
        "correlation_id": row.correlation_id,
        "delivery_id": row.delivery_id,
        "created_at": row.created_at.isoformat(),
        "outcome": decision.outcome if decision else None,
        "recommended_action": decision.recommended_action if decision else None,
    } for row, decision in rows]


@router.get("/api/events/{event_id}")
def get_event(event_id: str, db: Session = Depends(get_db)):
    row = db.query(VisitorEvent).filter(VisitorEvent.id == event_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    decision = db.query(VerificationDecision).filter(VerificationDecision.event_id == event_id).first()
    evidence = db.query(EvidenceItem).filter(EvidenceItem.event_id == event_id).all()
    approvals = db.query(HomeownerApproval).filter(HomeownerApproval.event_id == event_id).order_by(HomeownerApproval.timestamp.desc()).all()
    actions = db.query(ActionRecord).filter(ActionRecord.event_id == event_id).order_by(ActionRecord.timestamp.desc()).all()
    return {
        "event": {
            "id": row.id,
            "event_type": row.event_type,
            "device_id": row.device_id,
            "event_timestamp": row.event_timestamp.isoformat(),
            "source": row.source,
            "transcript": row.transcript,
            "snapshot_reference": row.snapshot_reference,
            "processing_status": row.processing_status,
            "correlation_id": row.correlation_id,
            "delivery_id": row.delivery_id,
        },
        "decision": None if not decision else {
            "outcome": decision.outcome,
            "matching_fields": json.loads(decision.matching_fields),
            "conflicting_fields": json.loads(decision.conflicting_fields),
            "missing_evidence": json.loads(decision.missing_evidence),
            "explanation": decision.explanation,
            "recommended_action": decision.recommended_action,
            "policy_decision": decision.policy_decision,
        },
        "evidence": [{
            "id": item.id,
            "evidence_type": item.evidence_type,
            "source": item.source,
            "value": item.value,
            "external_reference": item.external_reference,
            "timestamp": item.timestamp.isoformat(),
            "verification_status": item.verification_status,
            "independent_authentication": item.independent_authentication,
        } for item in evidence],
        "approvals": [{
            "id": item.id,
            "requested_action": item.requested_action,
            "decision": item.decision,
            "approver": item.approver,
            "timestamp": item.timestamp.isoformat(),
            "expires_at": item.expires_at.isoformat() if item.expires_at else None,
        } for item in approvals],
        "actions": [{
            "id": item.id,
            "action_type": item.action_type,
            "authorization_check_result": item.authorization_check_result,
            "execution_mode": item.execution_mode,
            "result": item.result,
            "timestamp": item.timestamp.isoformat(),
        } for item in actions],
    }


@router.post("/api/events/simulate")
def simulate_event(payload: dict, db: Session = Depends(get_db)):
    event_data = {
        "event_type": payload.get("event_type", "manual_simulation"),
        "device_id": payload.get("device_id", "ring-doorbell-demo"),
        "event_timestamp": payload.get("event_timestamp") or datetime.utcnow(),
        "transcript": payload.get("transcript"),
        "snapshot_reference": payload.get("snapshot_reference"),
        "source": payload.get("source", "simulator"),
        "delivery_reference": payload.get("delivery_reference"),
    }
    return EventProcessor(db).process(event_data)


@router.post("/api/events/{event_id}/approve")
def approve_event(event_id: str, payload: HomeownerApprovalCreate, db: Session = Depends(get_db), x_demo_owner: str | None = Header(default=None, alias="X-Demo-Owner")):
    if x_demo_owner not in {DEMO_OWNER_ID, "demo-owner"}:
        raise HTTPException(status_code=401, detail="Unauthorized; demo owner required")
    approval = HomeownerApproval(
        id=str(uuid.uuid4()),
        event_id=event_id,
        requested_action=payload.requested_action,
        decision="approve",
        approver=payload.approver or DEMO_OWNER_ID,
        timestamp=datetime.utcnow(),
        expires_at=payload.expires_at or datetime.utcnow(),
    )
    db.add(approval)
    db.commit()
    return {"status": "approved", "event_id": event_id, "approver": payload.approver or DEMO_OWNER_ID}


@router.post("/api/events/{event_id}/deny")
def deny_event(event_id: str, payload: HomeownerApprovalCreate, db: Session = Depends(get_db), x_demo_owner: str | None = Header(default=None, alias="X-Demo-Owner")):
    if x_demo_owner not in {DEMO_OWNER_ID, "demo-owner"}:
        raise HTTPException(status_code=401, detail="Unauthorized; demo owner required")
    approval = HomeownerApproval(
        id=str(uuid.uuid4()),
        event_id=event_id,
        requested_action=payload.requested_action,
        decision="deny",
        approver=payload.approver or DEMO_OWNER_ID,
        timestamp=datetime.utcnow(),
        expires_at=payload.expires_at or datetime.utcnow(),
    )
    db.add(approval)
    db.commit()
    return {"status": "denied", "event_id": event_id, "approver": payload.approver or DEMO_OWNER_ID}


@router.post("/api/events/{event_id}/request-evidence")
def request_evidence_event(event_id: str, db: Session = Depends(get_db), x_demo_owner: str | None = Header(default=None, alias="X-Demo-Owner")):
    if x_demo_owner not in {DEMO_OWNER_ID, "demo-owner"}:
        raise HTTPException(status_code=401, detail="Unauthorized; demo owner required")
    db.add(AuditRecord(
        id=str(uuid.uuid4()),
        event_id=event_id,
        correlation_id=str(uuid.uuid4()),
        actor="homeowner",
        event_type="evidence_request",
        details=json.dumps({"reason": "missing tracking evidence"}),
    ))
    db.commit()
    return {"status": "requested_evidence", "event_id": event_id}


@router.get("/api/audit")
def audit(db: Session = Depends(get_db)):
    return list_audit(db)


@router.post("/api/actions/simulate")
def simulate_action(payload: ActionRequest, db: Session = Depends(get_db), x_demo_owner: str | None = Header(default=None, alias="X-Demo-Owner")):
    if x_demo_owner not in {DEMO_OWNER_ID, "demo-owner"}:
        raise HTTPException(status_code=401, detail="Unauthorized; demo owner required")
    try:
        result = execute_simulated_action(db, payload.event_id, payload.requested_by)
        return result
    except PermissionError:
        raise HTTPException(status_code=403, detail="Homeowner approval required before running the simulated action")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/api/integrations/status")
def integrations_status() -> IntegrationStatus:
    provider_status = ProviderService().get_provider_status()
    bedrock_status = BedrockService().diagnose()
    return {
        "ring": "simulated",
        "bedrock": "demo-fallback" if not bedrock_status["configured"] else "configured",
        "simulated_actions": "enabled",
        "provider_mode": provider_status["provider_mode"],
        "provider_configured": provider_status["configured"],
        "fallback_active": provider_status["fallback_active"],
        "provider_summary": provider_status["summary"],
    }


@router.get("/api/diagnostics/provider")
def provider_diagnostics():
    provider_status = ProviderService().get_provider_status()
    bedrock_service = BedrockService()
    return {
        "provider_status": provider_status,
        "bedrock_diagnostic": bedrock_service.diagnose(),
        "mcp_status": {"ready": True, "transport": "streamable-http", "endpoint": "/mcp"},
    }


@router.post("/api/assistant/chat", response_model=AssistantChatResponse)
def chat(payload: AssistantChatRequest, db: Session = Depends(get_db)):
    event = db.query(VisitorEvent).order_by(VisitorEvent.created_at.desc()).first()
    if not event:
        return AssistantChatResponse(response="No visitor events are available yet.")
    claim = ProviderService().extract_visitor_claim(event.transcript or "")
    decision = db.query(VerificationDecision).filter(VerificationDecision.event_id == event.id).first()
    if "approve" in payload.message.lower():
        response = "Approval recorded. The simulated action completed. No physical lock was operated."
    elif "what happened" in payload.message.lower() or "door" in payload.message.lower():
        response = f"A visitor arrived at {event.event_timestamp.isoformat()} claiming to deliver for {claim.get('recipient') or 'an unknown recipient'}. The system found {decision.outcome if decision else 'no decision'} and recommends review before action."
    else:
        response = f"The current event is a {event.event_type} and the system outcome is {decision.outcome if decision else 'pending'} with a {claim.get('company') or 'unknown'} delivery claim."
    return AssistantChatResponse(response=response, event_summary={"id": event.id, "status": event.processing_status, "outcome": decision.outcome if decision else "pending"})


@router.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    total_events = db.query(VisitorEvent).count()
    pending_approvals = db.query(VisitorEvent).filter(
        VisitorEvent.processing_status == "REVIEW_REQUIRED",
        ~db.query(HomeownerApproval.id).filter(HomeownerApproval.event_id == VisitorEvent.id).exists(),
    ).count()
    pending_deliveries = db.query(DeliveryExpectation).filter(DeliveryExpectation.status == "pending").count()
    partial_matches = db.query(VerificationDecision).filter(VerificationDecision.outcome == "PARTIAL_MATCH").count()
    warnings = db.query(VerificationDecision).filter(VerificationDecision.outcome.in_({"MISMATCH", "CONFLICTING_EVIDENCE", "NO_EXPECTED_DELIVERY", "EXPIRED_EXPECTATION"})).count()
    return {"total_events": total_events, "pending_approvals": pending_approvals, "pending_deliveries": pending_deliveries, "partial_matches": partial_matches, "warnings": warnings}
