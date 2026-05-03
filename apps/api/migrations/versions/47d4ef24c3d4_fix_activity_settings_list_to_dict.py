"""fix_activity_settings_list_to_dict

Revision ID: 47d4ef24c3d4
Revises: h8i9j0k1l2m3
Create Date: 2026-05-01 09:37:02.324098

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "47d4ef24c3d4"
down_revision: str | None = "h8i9j0k1l2m3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()

    activity = sa.table(
        "activity", sa.column("id", sa.Integer), sa.column("settings", sa.JSON)
    )

    res = connection.execute(sa.select(activity.c.id, activity.c.settings))
    updates = []
    for row in res.mappings():
        act_id = row["id"]
        settings = row["settings"]

        if isinstance(settings, list):
            merged = {}
            for item in settings:
                if isinstance(item, dict):
                    merged.update(item)
            updates.append({"b_id": act_id, "b_settings": merged})

    # Execute updates
    for update in updates:
        connection.execute(
            activity
            .update()
            .where(activity.c.id == update["b_id"])
            .values(settings=update["b_settings"])
        )


def downgrade() -> None:
    """Downgrade schema."""
    # It is not possible to safely downgrade this, as we merged lists into dicts.
