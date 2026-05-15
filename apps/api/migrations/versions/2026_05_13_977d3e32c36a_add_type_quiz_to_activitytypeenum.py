"""add TYPE_QUIZ to activitytypeenum

Revision ID: 977d3e32c36a
Revises: d9a1c7e5b402
Create Date: 2026-05-13 12:08:35.591510

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "977d3e32c36a"
down_revision: str | None = "d9a1c7e5b402"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE activitytypeenum ADD VALUE 'TYPE_QUIZ'")


def downgrade() -> None:
    pass
