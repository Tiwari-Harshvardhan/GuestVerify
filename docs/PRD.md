# Product Requirements Document (PRD)

## Vision
GuestVerify is a secure front-door verification application for delivery and service access. The product takes the claim provided by a visitor at the door, compares it to expected delivery records, checks time windows and evidence, and ensures the homeowner approves any action before the system can simulate a response.

## Goals
- Protect the homeowner from accepting unverified delivery claims at face value.
- Reduce friction for legitimate deliveries while keeping the approval path explicit.
- Provide a clear record of the decision, evidence, and action for audit purposes.
- Support demo and hackathon scenarios with deterministic logic and transparent fallback modes.

## Core user journeys
1. A homeowner configures expected delivery windows.
2. A visitor event is ingested from a simulator or doorbell device.
3. The system extracts a claim and compares it against expected deliveries.
4. If the risk is acceptable, the app requests homeowner confirmation before any action.
5. The system records the decision, evidence, and audit trail.

## Functional requirements
- Delivery expectations include company, recipient, destination, window, and allowed action.
- Visitor events store transcript and timing metadata.
- Verification compares expected vs claimed details for company, recipient, tracking data, and time window.
- Actions are only permitted after an explicit homeowner approval.
- Audit records preserve event correlation and decision details.

## Non-functional requirements
- Deterministic policy decisions must not rely on unreviewed LLM output for authorization.
- The app must run locally in demo mode without requiring AWS credentials.
- The UI must surface events, evidence, and risks in a compact dashboard.
