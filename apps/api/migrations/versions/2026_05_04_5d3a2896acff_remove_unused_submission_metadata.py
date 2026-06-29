"""remove_unused_submission_metadata

Revision ID: 5d3a2896acff
Revises: o0p1q2r3s4t5
Create Date: 2026-05-04 11:49:22.755506

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5d3a2896acff"
down_revision: str | None = "o0p1q2r3s4t5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


import json


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    result = bind.execute(sa.text("SELECT id, metadata_json FROM submission"))
    rows = result.fetchall()

    keys_to_remove = {
        "judge0_tokens",
        "plagiarism_score",
        "code_submission_id",
        "code_submission_uuid",
    }

    for row_id, metadata_raw in rows:
        if not metadata_raw:
            continue

        metadata_json = metadata_raw
        if isinstance(metadata_json, str):
            try:
                metadata_json = json.loads(metadata_json)
            except Exception:  # noqa: S112
                # Skip invalid JSON data in migration
                continue

        if not isinstance(metadata_json, dict):
            continue

        needs_update = False
        for key in keys_to_remove:
            if key in metadata_json:
                del metadata_json[key]
                needs_update = True

        if needs_update:
            if bind.dialect.name == "postgresql":
                bind.execute(
                    sa.text("UPDATE submission SET metadata_json = CAST(:val AS JSONB) WHERE id = :id"),
                    {"val": json.dumps(metadata_json), "id": row_id},
                )
            else:
                bind.execute(
                    sa.text("UPDATE submission SET metadata_json = :val WHERE id = :id"),
                    {"val": json.dumps(metadata_json), "id": row_id},
                )


def downgrade() -> None:
    """Downgrade schema."""
