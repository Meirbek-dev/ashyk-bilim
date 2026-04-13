from __future__ import annotations

import json
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))


def main() -> None:
    from app import app

    output_path = APP_ROOT / "openapi.json"
    schema = app.openapi()

    output_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(f"OpenAPI schema written to {output_path}")


if __name__ == "__main__":
    main()
