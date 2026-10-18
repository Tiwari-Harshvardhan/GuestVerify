import json
import os
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import AWS_MODEL_ID, AWS_REGION


class BedrockService:
    def __init__(self):
        self.region = AWS_REGION
        self.model_id = AWS_MODEL_ID

    def _credential_state(self) -> dict[str, Any]:
        return {
            "aws_access_key_id_present": bool(os.getenv("AWS_ACCESS_KEY_ID")),
            "aws_secret_access_key_present": bool(os.getenv("AWS_SECRET_ACCESS_KEY")),
            "aws_profile_present": bool(os.getenv("AWS_PROFILE")),
            "region": self.region,
            "model_id": self.model_id,
        }

    def diagnose(self) -> dict[str, Any]:
        creds = self._credential_state()
        if not creds["aws_access_key_id_present"] and not creds["aws_profile_present"]:
            return {
                "provider": "bedrock",
                "configured": False,
                "status": "missing_credentials",
                "summary": "Bedrock is unavailable because AWS credentials are not configured.",
                "mode": "local_demo",
                **creds,
            }
        if creds["aws_access_key_id_present"] and not creds["aws_secret_access_key_present"]:
            return {
                "provider": "bedrock",
                "configured": False,
                "status": "incomplete_credentials",
                "summary": "AWS access key is present but the matching secret key is missing.",
                "mode": "local_demo",
                **creds,
            }
        return {
            "provider": "bedrock",
            "configured": True,
            "status": "ready",
            "summary": "Bedrock is configured and ready for explicit opt-in use.",
            "mode": "bedrock",
            **creds,
        }

    def is_configured(self) -> bool:
        return bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY")) or bool(os.getenv("AWS_PROFILE"))

    def _classify_bedrock_error(self, exc: Exception) -> str:
        message = str(exc).lower()
        if "access denied" in message or "forbidden" in message:
            return "access_denied"
        if "rate exceeded" in message or "thrott" in message:
            return "throttled"
        if "timed out" in message or "timeout" in message or "read operation timed out" in message:
            return "timeout"
        if "model" in message and ("not found" in message or "unsupported" in message):
            return "unsupported_model"
        if "credential" in message or "auth" in message:
            return "authentication_failed"
        return "provider_error"

    def extract_claim(self, transcript: str) -> dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("Bedrock is not configured")
        try:
            client = boto3.client("bedrock-runtime", region_name=self.region)
            payload = {
                "inputText": transcript,
                "task": "extract_visitor_claim",
                "schema": {
                    "company": "string or null",
                    "purpose": "string or null",
                    "recipient": "string or null",
                    "tracking_reference": "string or null",
                    "additional_evidence": "string or null",
                },
            }
            response = client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(payload),
                contentType="application/json",
                accept="application/json",
            )
            body = json.loads(response["body"].read())
            if "output" in body and isinstance(body["output"], dict):
                result = dict(body["output"])
                result["source"] = "bedrock"
                return result
            if "content" in body and isinstance(body["content"], list):
                text = body["content"][0].get("text", "{}")
                result = json.loads(text)
                result["source"] = "bedrock"
                return result
            raise ValueError("Unexpected Bedrock response format")
        except (BotoCoreError, ClientError, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Bedrock extraction failed: {self._classify_bedrock_error(exc)}") from exc
