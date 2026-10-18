from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.utcnow()


class DeliveryExpectation(Base):
    __tablename__ = "delivery_expectations"

    id = Column(String, primary_key=True)
    company = Column(String, nullable=False)
    recipient = Column(String, nullable=False)
    tracking_reference = Column(String, nullable=True)
    expected_start = Column(DateTime, nullable=False)
    expected_end = Column(DateTime, nullable=False)
    destination = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    allowed_action = Column(String, nullable=False)
    verification_evidence = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    events = relationship("VisitorEvent", back_populates="delivery")


class VisitorEvent(Base):
    __tablename__ = "visitor_events"

    id = Column(String, primary_key=True)
    event_type = Column(String, nullable=False)
    device_id = Column(String, nullable=False)
    event_timestamp = Column(DateTime, nullable=False)
    source = Column(String, nullable=False, default="simulator")
    transcript = Column(Text, nullable=True)
    snapshot_reference = Column(String, nullable=True)
    processing_status = Column(String, nullable=False, default="RECEIVED")
    correlation_id = Column(String, nullable=False)
    delivery_id = Column(String, ForeignKey("delivery_expectations.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    delivery = relationship("DeliveryExpectation", back_populates="events")


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id = Column(String, primary_key=True)
    event_id = Column(String, ForeignKey("visitor_events.id"), nullable=False)
    evidence_type = Column(String, nullable=False)
    source = Column(String, nullable=False)
    value = Column(Text, nullable=True)
    external_reference = Column(String, nullable=True)
    timestamp = Column(DateTime, nullable=False)
    verification_status = Column(String, nullable=False, default="UNKNOWN")
    independent_authentication = Column(Boolean, nullable=False, default=False)


class VerificationDecision(Base):
    __tablename__ = "verification_decisions"

    id = Column(String, primary_key=True)
    event_id = Column(String, ForeignKey("visitor_events.id"), nullable=False)
    outcome = Column(String, nullable=False)
    matching_fields = Column(Text, nullable=False, default="[]")
    conflicting_fields = Column(Text, nullable=False, default="[]")
    missing_evidence = Column(Text, nullable=False, default="[]")
    explanation = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)
    policy_decision = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class HomeownerApproval(Base):
    __tablename__ = "homeowner_approvals"

    id = Column(String, primary_key=True)
    event_id = Column(String, ForeignKey("visitor_events.id"), nullable=False)
    requested_action = Column(String, nullable=False)
    decision = Column(String, nullable=False)
    approver = Column(String, nullable=False)
    timestamp = Column(DateTime, default=utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)


class ActionRecord(Base):
    __tablename__ = "action_records"

    id = Column(String, primary_key=True)
    event_id = Column(String, ForeignKey("visitor_events.id"), nullable=False)
    action_type = Column(String, nullable=False)
    authorization_check_result = Column(String, nullable=False)
    execution_mode = Column(String, nullable=False)
    result = Column(String, nullable=False)
    timestamp = Column(DateTime, default=utcnow, nullable=False)


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id = Column(String, primary_key=True)
    event_id = Column(String, ForeignKey("visitor_events.id"), nullable=False)
    correlation_id = Column(String, nullable=False)
    actor = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    details = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=utcnow, nullable=False)
