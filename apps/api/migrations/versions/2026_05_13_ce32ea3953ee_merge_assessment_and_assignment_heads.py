"""Merge assessment and assignment heads

Revision ID: ce32ea3953ee
Revises: 977d3e32c36a, a1b2c3d4e5f7
Create Date: 2026-05-13 20:16:55.196901

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ce32ea3953ee'
down_revision: Union[str, None] = ('977d3e32c36a', 'a1b2c3d4e5f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
