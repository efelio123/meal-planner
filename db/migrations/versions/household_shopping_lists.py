"""Household shopping lists.

Revision ID: household_shopping_lists
Revises: identity_and_households
"""

from collections.abc import Sequence

from alembic import op

revision: str = "household_shopping_lists"
down_revision: str | Sequence[str] | None = "identity_and_households"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BACKFILL_SQL = """
    INSERT INTO shopping_lists (household_id)
    SELECT id FROM households WHERE deleted_at IS NULL
    ON CONFLICT (household_id) DO NOTHING
"""


def upgrade() -> None:
    op.execute("""
        CREATE TABLE shopping_lists (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT shopping_lists_household_unique UNIQUE (household_id)
        )
    """)
    op.execute("""
        CREATE TABLE shopping_list_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shopping_list_id UUID NOT NULL REFERENCES shopping_lists (id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            is_checked BOOLEAN NOT NULL DEFAULT FALSE,
            checked_at TIMESTAMPTZ,
            checked_by_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
            created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT shopping_list_items_name_not_blank CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT shopping_list_items_checked_audit_is_consistent CHECK (
                (is_checked AND checked_at IS NOT NULL AND checked_by_user_id IS NOT NULL)
                OR (NOT is_checked AND checked_at IS NULL AND checked_by_user_id IS NULL)
            )
        )
    """)
    op.execute("""
        CREATE INDEX shopping_list_items_list_checked_created_index
            ON shopping_list_items (shopping_list_id, is_checked, created_at, id)
    """)
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.execute("DROP TABLE shopping_list_items")
    op.execute("DROP TABLE shopping_lists")
