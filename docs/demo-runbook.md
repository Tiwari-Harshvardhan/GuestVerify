# Demo Runbook

## Local startup
1. Start backend: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
2. Start frontend: `cd frontend && npm install && npm run dev -- --host 0.0.0.0 --port 5173`
3. Open the frontend at `http://localhost:5173`

## Demo narrative
- Show the seeded Amazon delivery.
- Trigger a simulated visitor event with a transcript.
- Explain how the event is matched against expected delivery records.
- Show verification decision and evidence fields.
- Request homeowner approval before action.
- Explain how the audit trail records each step.

## Expected result
The app demonstrates a secure verification flow without executing any real-world lock or delivery action.
