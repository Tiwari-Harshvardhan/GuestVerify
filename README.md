# GuestVerify

GuestVerify is a local-first delivery verification MVP for secure front-door decision support. It accepts visitor events, compares them with expected deliveries, shows evidence and reasoning, and requires homeowner approval before any simulated action can proceed.

Core principles:
- No AWS credentials are required for normal local demo use.
- The default execution mode is deterministic local demo logic.
- Bedrock remains optional and must be explicitly configured.
- The trust boundary is the verification engine, not the model output.
- Physical unlocking is out of scope; any porch or delivery action remains simulated.

## Local demo startup

From a clean checkout:

1. Create a virtual environment if desired.
2. Install backend dependencies:
   cd backend
   python -m pip install -r requirements.txt
3. Start the FastAPI backend:
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
4. In a second shell, install frontend dependencies and start the UI:
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0 --port 5173
5. Open http://localhost:5173

The default backend mode requires no AWS configuration and works entirely with the local deterministic extraction and verification pipeline.

## Environment configuration

Copy `.env.example` to `.env` if you want to override defaults:

- `AI_PROVIDER=local` for the default no-credential experience.
- Set `AI_PROVIDER=bedrock` only when AWS credentials and model access are available.
- All AWS values are optional and should be kept in the local environment or a secure secret store.

## Optional Bedrock configuration

When AWS credentials are available and Bedrock access is allowed, set env vars such as:

- `AI_PROVIDER=bedrock`
- `AWS_REGION=us-east-1`
- `AWS_MODEL_ID=us.amazon.nova-lite-v1:0`
- `AWS_ACCESS_KEY_ID=...`
- `AWS_SECRET_ACCESS_KEY=...`
- Optional: `AWS_PROFILE=...`

GuestVerify will only use real Bedrock extraction when the provider is selected and the credentials are valid. If AWS is missing or denied, the app remains usable in local demo mode and records the fallback status.

## Validation commands

Backend tests:
cd backend
python -m pytest tests/test_guestverify.py -q

Frontend build:
cd frontend
npm run build

MCP smoke test:
cd backend
python scripts/mcp_smoke_test.py

Provider diagnostics:
cd backend
python -c "from app.services.bedrock_service import BedrockService; print(BedrockService().diagnose())"

## Vercel deployment

The Vercel configuration builds the React frontend and serves it alongside the FastAPI API. API requests use same-origin `/api` paths, so the local Vite proxy and Vercel deployment share the same frontend code.

1. Install and authenticate the Vercel CLI with `npm install --global vercel` and `vercel login`.
2. From the repository root, run `vercel` to create a preview deployment, then `vercel --prod` to deploy to production.
3. Set any required environment variables in the Vercel project settings before promoting a production deployment.

The Vercel setup is for demonstration only. Its SQLite database is stored under `/tmp`, which is ephemeral and not shared between serverless instances; do not use it for persistent or production data. Use a managed database and configure `DATABASE_URL` for any real deployment. The standalone MCP Streamable HTTP server is not hosted by this Vercel setup and must run separately.

## Project structure

- backend/app: FastAPI app, models, database setup, verification, audit, and integrations.
- backend/tests: backend regression tests.
- backend/scripts: MCP smoke tests and diagnostics.
- frontend/src: React dashboard and simulator.
- docs/: PRD, TRD, architecture, security, demo runbook, and submission notes.

## Demo workflow

1. Create or inspect expected deliveries.
2. Simulate a visitor event with a transcript such as "Amazon delivery for John."
3. Review the extracted claim, matching evidence, and verification outcome.
4. Approve the simulated action only if the homeowner explicitly approves.
5. Observe the audit trail and event decision record.

This remains a simulated delivery workflow and does not unlock a real door or operate a physical device.

## Limitations

- Local mode is deterministic and should be presented as demo logic rather than a live LLM result.
- Real Bedrock calls require the live AWS environment and permission model to be configured.
- Docker runtime validation requires a working local Docker daemon.
