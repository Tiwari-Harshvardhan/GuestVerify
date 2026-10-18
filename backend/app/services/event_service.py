import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditRecord, DeliveryExpectation, EvidenceItem, VerificationDecision, VisitorEvent
from app.services.provider_service import ProviderService
from app.services.verification import compare_claim_to_delivery


class EventProcessor:
    def __init__(self, db: Session):
        self.db = db

    def process(self, payload: dict[str, Any]) -> dict[str, Any]:
        event_id = str(uuid.uuid4())
        correlation_id = str(uuid.uuid4())
        event_ts = payload.get("event_timestamp") or datetime.utcnow()
        if isinstance(event_ts, str):
            event_ts = datetime.fromisoformat(event_ts.replace("Z", "+00:00"))
        event = VisitorEvent(
            id=event_id,
            event_type=payload["event_type"],
            device_id=payload["device_id"],
            event_timestamp=event_ts,
            source=payload.get("source", "simulator"),
            transcript=payload.get("transcript"),
            snapshot_reference=payload.get("snapshot_reference"),
            processing_status="ANALYZING",
            correlation_id=correlation_id,
        )
        self.db.add(event)
        self.db.commit()

        claim = ProviderService().extract_visitor_claim(payload.get("transcript") or "")
        delivery_candidates = self.db.query(DeliveryExpectation).all()
        chosen = None
        for item in delivery_candidates:
            if claim.get("company") and item.company.lower() == claim.get("company", "").lower() and claim.get("recipient") and item.recipient.lower() == claim.get("recipient", "").lower():
                chosen = item
                break
        if not chosen:
            for item in delivery_candidates:
                if claim.get("company") and item.company.lower() == claim.get("company", "").lower():
                    chosen = item
                    break

        if chosen:
            event.delivery_id = chosen.id

        event_payload = {
            "event_timestamp": event_ts,
            "authenticated_evidence": payload.get("delivery_reference"),
        }
        decision = compare_claim_to_delivery(claim, {
            "company": chosen.company if chosen else None,
            "recipient": chosen.recipient if chosen else None,
            "tracking_reference": chosen.tracking_reference if chosen else None,
            "expected_start": chosen.expected_start if chosen else datetime.utcnow() - timedelta(days=1),
            "expected_end": chosen.expected_end if chosen else datetime.utcnow() + timedelta(days=1),
        }, event_payload)

        self.db.add(EvidenceItem(
            id=str(uuid.uuid4()),
            event_id=event_id,
            evidence_type="visitor_claim",
            source="visitor",
            value=payload.get("transcript"),
            timestamp=event_ts,
            verification_status="claim_only",
            independent_authentication=False,
        ))

        if payload.get("delivery_reference"):
            self.db.add(EvidenceItem(
                id=str(uuid.uuid4()),
                event_id=event_id,
                evidence_type="tracking_reference",
                source="simulator",
                value=payload.get("delivery_reference"),
                external_reference=payload.get("delivery_reference"),
                timestamp=event_ts,
                verification_status="authenticated",
                independent_authentication=True,
            ))

        decision_record = VerificationDecision(
            id=str(uuid.uuid4()),
            event_id=event_id,
            outcome=decision["outcome"],
            matching_fields=json.dumps(decision.get("matching_fields", [])),
            conflicting_fields=json.dumps(decision.get("conflicting_fields", [])),
            missing_evidence=json.dumps(decision.get("missing_evidence", [])),
            explanation=decision["explanation"],
            recommended_action=decision["recommended_action"],
            policy_decision=decision["policy_decision"],
        )
        self.db.add(decision_record)
        self.db.add(AuditRecord(
            id=str(uuid.uuid4()),
            event_id=event_id,
            correlation_id=correlation_id,
            actor="system",
            event_type="verification_result",
            details=json.dumps({"outcome": decision["outcome"], "message": decision["explanation"]}),
        ))
        event.processing_status = "REVIEW_REQUIRED" if decision["outcome"] in {"PARTIAL_MATCH", "MISMATCH", "CONFLICTING_EVIDENCE", "NO_EXPECTED_DELIVERY"} else "COMPLETED"
        self.db.commit()
        self.db.refresh(event)

        return {
            "event_id": event_id,
            "correlation_id": correlation_id,
            "claim": claim,
            "decision": decision,
            "event": {
                "id": event.id,
                "event_type": event.event_type,
                "processing_status": event.processing_status,
                "event_timestamp": event.event_timestamp.isoformat(),
            },
        }
