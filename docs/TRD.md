# Technical Requirements Document (TRD)

## Architecture
- Backend: FastAPI + SQLAlchemy + SQLite demo database.
- Frontend: React + Vite + TypeScript.
- Integration points: AWS Bedrock optional, MCP server for inspection tools, simulated action approval workflow.

## Data model
The system persists delivery expectations, visitor events, evidence items, verification decisions, approval records, action records, and audit records.

## Security model
- The verification engine is the trust boundary.
- Claims are treated as untrusted input.
- Approved action execution is blocked unless a valid homeowner approval exists.
- Audit records are kept for transparency and incident review.

## Runtime requirements
- Backend default port: 8000
- MCP default port: 8001
- Frontend default port: 5173
- Demo configuration requires no Bedrock credentials to operate.

## Validation strategy
- Unit/integration tests cover health, seeded data, delivery lifecycle, approval enforcement, and event verification.
- Frontend build validation confirms TS/Vite compilation.
- Docker compose validation confirms container orchestration remains consistent.
