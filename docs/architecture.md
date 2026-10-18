# GuestVerify Architecture Overview

## Components
- Frontend dashboard and simulator
- FastAPI backend for API and verification logic
- SQLAlchemy models for delivery and event domain objects
- Optional Bedrock extraction service
- MCP server exposing event inspection tools

## Request flow
1. User triggers an event from the simulator or frontend.
2. The backend records the event and extracts a claim from transcript text.
3. The verification service compares the claim with expected deliveries.
4. The event receives a decision and audit record.
5. If a simulated action is requested, the approval gate enforces policy before execution.

## Why this fits the hackathon
The design keeps the trust boundary deterministic, easy to explain, and operationally simple to run locally. This makes the product demonstrably secure without requiring a large cloud integration footprint for the MVP.
