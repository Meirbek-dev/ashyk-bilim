"""Validate the production Compose merge without loading secrets or starting services."""

import json
import os
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parent.parent
compose = ["docker", "compose"] if shutil.which("docker") else ["docker-compose"]
env = os.environ.copy()
env.update(
    POSTGRES_PASSWORD="validation-only",
    AB__DATABASE__URL="postgres://test:test@db:5432/ashyq",
    AB__ZITADEL__PAT="validation-only",
    ZITADEL_MASTERKEY="12345678901234567890123456789012",
    ZITADEL_DB_PASSWORD="validation-only",
    ZITADEL_PAT_EXPIRATION="2030-01-01T00:00:00Z",
    RUSTFS_ACCESS_KEY="test",
    RUSTFS_SECRET_KEY="validation-only",
    REWRITE_IMAGE_TAG="validation-only",
    NGINX_SERVER_NAME="example.invalid",
)
result = subprocess.run(
    compose
    + [
        "--env-file", ".env.example",
        "-f", "docker-compose.yml",
        "-f", "docker-compose.rewrite.yml",
        "-f", "docker-compose.cutover.yml",
        "config", "--no-env-resolution", "--format", "json",
    ],
    cwd=ROOT, env=env, capture_output=True, text=True, check=True,
)
services = json.loads(result.stdout)["services"]
assert not any(name in services for name in ("api", "taskiq-worker", "taskiq-scheduler", "migrate"))
assert all(name in services for name in ("server", "worker", "zitadel", "rustfs"))
assert set(services["nginx"]["depends_on"]) == {"web", "server", "rustfs"}
assert not any(services[name].get("ports") for name in ("db", "redis", "judge0-server", "zitadel", "rustfs"))
assert services["server"]["environment"]["AB__SERVER__CORS_ORIGINS"] == '["https://example.invalid"]'
assert services["web"]["environment"]["INTERNAL_API_URL"] == "http://server:8000/api/v2/"
# AI keys are owner-supplied at cutover (DECISIONS "AI models"); the merge must carry them.
assert all(key in services["server"]["environment"] for key in ("AB__AI__OPENAI_API_KEY", "AB__AI__OPENROUTER_API_KEY"))
assert services["worker"]["environment"] == services["server"]["environment"]
assert services["web"]["build"]["args"]["NEXT_PUBLIC_API_URL"] == "https://example.invalid/api/v2/"
for volume in services["nginx"]["volumes"]:
    if volume["type"] == "bind" and volume["target"].endswith((".template", ".conf")):
        assert Path(volume["source"]).is_file(), volume["target"]
print("Production Compose merge passed: profiles, dependencies, private ports, mounts, CORS and v2 web URLs.")
