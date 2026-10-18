import json

from mcp.server.fastmcp import FastMCP

from app.database import SessionLocal
from app.models import DeliveryExpectation, VerificationDecision, VisitorEvent
from app.services.provider_service import ProviderService

server = FastMCP("GuestVerify")


@server.tool()
def get_recent_visitor_events(limit: int = 5) -> list[dict]:
    """Return the most recent visitor events for dashboard inspection."""
    with SessionLocal() as db:
        rows = db.query(VisitorEvent).order_by(VisitorEvent.created_at.desc()).limit(limit).all()
        return [{"id": row.id, "event_type": row.event_type, "status": row.processing_status, "timestamp": row.event_timestamp.isoformat()} for row in rows]


@server.tool()
def get_event_details(event_id: str) -> dict:
    """Fetch the event, evidence, and verification decision for a single event ID."""
    with SessionLocal() as db:
        event = db.query(VisitorEvent).filter(VisitorEvent.id == event_id).first()
        if not event:
            raise ValueError("Event not found")
        decision = db.query(VerificationDecision).filter(VerificationDecision.event_id == event.id).first()
        return {"id": event.id, "event_type": event.event_type, "transcript": event.transcript, "status": event.processing_status, "decision": decision.outcome if decision else "pending"}


@server.tool()
def get_delivery_expectations() -> list[dict]:
    """List active delivery expectations for comparison with visitor claims."""
    with SessionLocal() as db:
        rows = db.query(DeliveryExpectation).all()
        return [{"id": item.id, "company": item.company, "recipient": item.recipient, "status": item.status, "window": f"{item.expected_start.isoformat()} to {item.expected_end.isoformat()}"} for item in rows]


@server.tool()
def get_verification_decision(event_id: str) -> dict:
    """Inspect the verification outcome for an event."""
    with SessionLocal() as db:
        decision = db.query(VerificationDecision).filter(VerificationDecision.event_id == event_id).first()
        if not decision:
            return {"status": "pending", "event_id": event_id}
        return {"event_id": event_id, "outcome": decision.outcome, "explanation": decision.explanation}


@server.tool()
def get_missing_evidence(event_id: str) -> list[str]:
    """List evidence fields that are missing or unverified for the event."""
    with SessionLocal() as db:
        decision = db.query(VerificationDecision).filter(VerificationDecision.event_id == event_id).first()
        if not decision:
            return []
        return json.loads(decision.missing_evidence)


@server.tool()
def get_integration_status() -> dict:
    """Return whether external integrations are real or simulated."""
    status = ProviderService().get_provider_status()
    return {
        "ring": "simulated",
        "bedrock": "demo-fallback" if status["provider_mode"] == "local_demo" else "configured",
        "simulated_actions": "enabled",
        "provider_mode": status["provider_mode"],
        "fallback_active": status["fallback_active"],
        "summary": status["summary"],
    }


if __name__ == "__main__":
    server.run(transport="streamable-http")
