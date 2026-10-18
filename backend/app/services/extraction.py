import re
from typing import Any


def extract_claim_from_text(transcript: str) -> dict[str, Any]:
    text = (transcript or "").strip()
    normalized = text.lower()
    company = None
    if "amazon" in normalized:
        company = "Amazon"
    elif "fedex" in normalized or "fed ex" in normalized:
        company = "FedEx"
    elif "ups" in normalized:
        company = "UPS"
    elif "dhl" in normalized:
        company = "DHL"
    elif "mail" in normalized or "post" in normalized:
        company = "Postal Service"

    recipient = None
    for name in ("john", "jane", "sarah", "michael", "emma"):
        if name in normalized:
            recipient = name.title()
            break
    purpose = "delivery" if "deliver" in normalized or "package" in normalized else "unknown"
    tracking_reference = None
    match = re.search(r"(?:tracking|ref|reference|order)[^\n]*?(?:#|No\.|number|id)?\s*([A-Z0-9-]+)", text, flags=re.I)
    if match:
        tracking_reference = match.group(1)
    return {
        "company": company,
        "purpose": purpose,
        "recipient": recipient,
        "tracking_reference": tracking_reference,
        "additional_evidence": "no independent tracking evidence" if not tracking_reference else f"tracking ref {tracking_reference}",
        "confidence": {
            "company": 0.9 if company else 0.2,
            "purpose": 0.8 if purpose != "unknown" else 0.2,
            "recipient": 0.9 if recipient else 0.2,
            "tracking_reference": 0.7 if tracking_reference else 0.1,
        },
        "source": "demo-fallback",
    }


def structured_claim_payload(transcript: str) -> dict[str, Any]:
    return extract_claim_from_text(transcript)
