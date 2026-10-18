import json
import os

from app.services.bedrock_service import BedrockService
from app.services.provider_service import ProviderService


def main() -> None:
    status = ProviderService().get_provider_status()
    bedrock = BedrockService().diagnose()
    report = {
        "application_mode": status["provider_mode"],
        "provider_status": status,
        "bedrock_diagnostic": bedrock,
        "aws_credentials_visible": bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE")),
        "aws_secret_visible": bool(os.getenv("AWS_SECRET_ACCESS_KEY")),
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
