# Security Notes

## Risk model
The primary risk is allowing a visitor claim to trigger a harmful action without independent verification. GuestVerify reduces this risk by requiring delivery expectations and explicit homeowner approval before any simulated action occurs.

## Controls implemented
- Claim text is treated as untrusted input.
- Delivery matching is deterministic and auditable.
- Approval is enforced before any action execution.
- Verification outcomes and audit details are stored in the database.

## Known limitations
- SQLite is used for the local MVP. It is not production-grade for multi-user high concurrency.
- Bedrock is optional and currently receives demo fallback behavior when the environment is not configured.
- The MVP intentionally simulates physical actions; no real door or lock control is connected.
