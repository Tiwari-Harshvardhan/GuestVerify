from __future__ import annotations

from typing import Any

from app.config import AI_PROVIDER
from app.services.bedrock_service import BedrockService
from app.services.extraction import extract_claim_from_text


class ProviderService:
    def __init__(self):
        self.bedrock = BedrockService()

    def get_provider_status(self) -> dict[str, Any]:
        provider = (AI_PROVIDER or "local").lower()
        if provider == "bedrock":
            bedrock_info = self.bedrock.diagnose()
            return {
                "provider": "bedrock",
                "provider_mode": "bedrock",
                "configured": bedrock_info["configured"],
                "fallback_active": not bedrock_info["configured"],
                "status": bedrock_info["status"],
                "summary": bedrock_info["summary"],
                "description": "Live Bedrock calls are used only when AWS credentials and model access are explicitly configured.",
            }
        return {
            "provider": "local_demo",
            "provider_mode": "local_demo",
            "configured": True,
            "fallback_active": True,
            "status": "ready",
            "summary": "Local demo mode is active. Visitor claims are processed with deterministic rule-based extraction and verification.",
            "description": "This mode works without AWS credentials, key material, or internet access after dependencies are installed.",
        }

    def extract_visitor_claim(self, transcript: str, *, allow_fallback: bool = True) -> dict[str, Any]:
        provider = (AI_PROVIDER or "local").lower()
        if provider == "bedrock" and self.bedrock.is_configured():
            try:
                result = self.bedrock.extract_claim(transcript)
                result["provider_mode"] = "bedrock"
                result["fallback_used"] = False
                return result
            except RuntimeError:
                if not allow_fallback:
                    raise
        result = extract_claim_from_text(transcript)
        result["provider_mode"] = "local_demo"
        result["fallback_used"] = True
        result["provider"] = "local_demo"
        result["source"] = "demo-fallback"
        return result
