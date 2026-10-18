from typing import Any


def compare_claim_to_delivery(claim: dict[str, Any], delivery: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    matching_fields: list[str] = []
    conflicting_fields: list[str] = []
    missing_evidence: list[str] = []

    if not delivery:
        return {
            "outcome": "NO_EXPECTED_DELIVERY",
            "matching_fields": [],
            "conflicting_fields": ["delivery context"],
            "missing_evidence": ["expected delivery record"],
            "explanation": "No matching expected delivery was available for this visitor event.",
            "recommended_action": "alert_homeowner_and_request_identity_check",
            "policy_decision": "deny_action_until_review",
            "reasons": ["no expected delivery"],
        }

    event_time = event.get("event_timestamp")
    if event_time and (event_time < delivery["expected_start"] or event_time > delivery["expected_end"]):
        return {
            "outcome": "EXPIRED_EXPECTATION",
            "matching_fields": [],
            "conflicting_fields": ["time_window"],
            "missing_evidence": ["valid_time_window"],
            "explanation": "The visitor event fell outside the expected delivery window.",
            "recommended_action": "alert_homeowner_and_request_evidence",
            "policy_decision": "deny_action_until_review",
            "reasons": ["outside expected time window"],
        }

    if claim.get("company") and delivery.get("company") and claim["company"].lower() == delivery["company"].lower():
        matching_fields.append("company")
    elif claim.get("company"):
        conflicting_fields.append("company")

    if claim.get("recipient") and delivery.get("recipient") and claim["recipient"].lower() == delivery["recipient"].lower():
        matching_fields.append("recipient")
    elif claim.get("recipient"):
        conflicting_fields.append("recipient")

    if delivery.get("tracking_reference") and claim.get("tracking_reference") and claim["tracking_reference"] == delivery["tracking_reference"]:
        matching_fields.append("tracking_reference")
    elif claim.get("tracking_reference"):
        conflicting_fields.append("tracking_reference")

    if not event.get("authenticated_evidence"):
        missing_evidence.append("independently_verified_tracking_evidence")

    if matching_fields and not conflicting_fields:
        outcome = "PARTIAL_MATCH"
        explanation = "The claim matches the expected delivery by company and recipient, but there is no independently verified tracking evidence."
        recommended_action = "require_homeowner_review_before_action"
        policy_decision = "allow_only_designated_delivery_area"
        reasons = ["matching company and recipient", "no independent authentication"]
    elif matching_fields and conflicting_fields:
        outcome = "CONFLICTING_EVIDENCE"
        explanation = "The claim partially matches expected delivery details but conflicts with one or more facts. Review required before any action."
        recommended_action = "request_additional_evidence"
        policy_decision = "deny_action_until_review"
        reasons = ["partial match but conflicting evidence"]
    else:
        outcome = "MISMATCH"
        explanation = "The visitor claim does not align with the expected delivery context."
        recommended_action = "alert_homeowner_and_request_context"
        policy_decision = "deny_action_until_review"
        reasons = ["claim mismatch"]

    return {
        "outcome": outcome,
        "matching_fields": matching_fields,
        "conflicting_fields": conflicting_fields,
        "missing_evidence": missing_evidence,
        "explanation": explanation,
        "recommended_action": recommended_action,
        "policy_decision": policy_decision,
        "reasons": reasons,
    }
