"""Profile fields and privacy-safe legacy display names.

Revision ID: household_management_profiles
Revises: household_shopping_lists
"""

from collections.abc import Sequence

from alembic import op

revision: str = "household_management_profiles"
down_revision: str | Sequence[str] | None = "household_shopping_lists"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
    op.execute("""
        UPDATE users
        SET display_name = 'Household member'
        WHERE lower(btrim(display_name)) = normalized_email
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN avatar_url")
