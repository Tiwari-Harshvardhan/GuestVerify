from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class DeliveryExpectationCreate(BaseModel):
    company: str
    recipient: str
    tracking_reference: Optional[str] = None
    expected_start: datetime
    expected_end: datetime
    destination: str = "porch_box"
    allowed_action: str = "leave_in_porch_box"
    status: str = "pending"
    verification_evidence: Optional[str] = None


class DeliveryExpectationRead(BaseModel):
    id: str
    company: str
    recipient: str
    tracking_reference: Optional[str]
    expected_start: datetime
    expected_end: datetime
    destination: str
    status: str
    allowed_action: str
    verification_evidence: Optional[str]
    created_at: datetime
    updated_at: datetime


class VisitorEventCreate(BaseModel):
    event_type: Literal["motion", "doorbell_press", "delivery_arrival", "manual_simulation"]
    device_id: str
    event_timestamp: Optional[datetime] = None
    transcript: Optional[str] = None
    snapshot_reference: Optional[str] = None
    source: Literal["simulator", "real_integration"] = "simulator"
    delivery_reference: Optional[str] = None


class ActionRequest(BaseModel):
    event_id: str
    action_type: str = "simulated_porch_box"
    requested_by: str = "demo-owner"


class AssistantChatRequest(BaseModel):
    message: str


class VisitorResponsePreviewRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class AssistantChatResponse(BaseModel):
    response: str
    event_summary: Optional[dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str
    mode: str
    provider_mode: str = "local_demo"
    bedrock_enabled: bool


class IntegrationStatus(BaseModel):
    ring: str
    bedrock: str
    simulated_actions: str
    provider_mode: str = "local_demo"
    provider_configured: bool = True
    fallback_active: bool = True
    provider_summary: str = "Local demo mode is active."


class HomeownerApprovalCreate(BaseModel):
    decision: Literal["approve", "deny", "request_evidence", "resolve"]
    requested_action: str = "leave_in_porch_box"
    approver: str = "demo-owner"
    expires_at: Optional[datetime] = None
