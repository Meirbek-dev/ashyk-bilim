"""Fix bad generated usernames and backfill default user roles.

Revision ID: a0b1c2d3e4f5
Revises: 9c0d1e2f3b4a
Create Date: 2026-05-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: str | None = "9c0d1e2f3b4a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            WITH malformed AS (
                SELECT
                    id,
                    username AS old_username,
                    COALESCE(
                        NULLIF(
                            trim(
                                both '.' from left(
                                    trim(
                                        both '.' from regexp_replace(
                                            lower(split_part(email, '@', 1)),
                                            '[^a-z0-9]+',
                                            '.',
                                            'g'
                                        )
                                    ),
                                    20
                                )
                            ),
                            ''
                        ),
                        'user' || id::text
                    ) AS base,
                    substring(username from '([0-9]{4})$') AS suffix
                FROM "user"
                WHERE username ~ '^\\.+[0-9]{4}$'
            ),
            candidates AS (
                SELECT
                    id,
                    old_username,
                    base || '.' || suffix AS candidate_username,
                    count(*) OVER (PARTITION BY base || '.' || suffix) AS candidate_count
                FROM malformed
            ),
            resolved AS (
                SELECT
                    id,
                    CASE
                        WHEN candidate_count > 1
                            OR EXISTS (
                                SELECT 1
                                FROM "user" existing_user
                                WHERE existing_user.username = candidates.candidate_username
                                  AND existing_user.id <> candidates.id
                            )
                        THEN candidate_username || '.' || id::text
                        ELSE candidate_username
                    END AS new_username
                FROM candidates
            )
            UPDATE "user" AS target_user
            SET username = resolved.new_username,
                updated_at = now()
            FROM resolved
            WHERE target_user.id = resolved.id;
            """
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
            SELECT target_user.id, default_role.id, now(), NULL
            FROM "user" AS target_user
            CROSS JOIN roles AS default_role
            WHERE default_role.slug = 'user'
              AND NOT EXISTS (
                  SELECT 1
                  FROM user_roles existing_role
                  WHERE existing_role.user_id = target_user.id
              );
            """
        )
    )


def downgrade() -> None:
    pass
