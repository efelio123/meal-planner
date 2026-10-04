"""Add editable category emoji and safely rename the starter Pantry category.

Revision ID: catalog_category_emoji
Revises: catalog_starter_categories
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "catalog_category_emoji"
down_revision: str | Sequence[str] | None = "catalog_starter_categories"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


STARTER_EMOJI = (
    ("food", "produce", "🥬"),
    ("food", "dairy & eggs", "🧀"),
    ("food", "meat & seafood", "🥩"),
    ("food", "bakery", "🍞"),
    ("food", "pantry", "🫙"),
    ("food", "pantry staples", "🫙"),
    ("food", "frozen", "❄️"),
    ("food", "beverages", "🥤"),
    ("household", "cleaning", "🧽"),
    ("household", "paper goods", "🧻"),
    ("household", "personal care", "🧴"),
)


def update_active_household_categories(connection, household_id: str) -> bool:
    """Lock and safely update one active household's matching starter rows."""
    household = connection.execute(text("""
        SELECT deleted_at FROM households WHERE id = :household_id FOR UPDATE
    """), {"household_id": household_id}).mappings().one_or_none()
    if household is None or household["deleted_at"] is not None:
        return False

    # Preserve both categories when a household already intentionally has an
    # active Pantry category. Otherwise rename only the untouched starter.
    connection.execute(text("""
        UPDATE catalog_categories AS starter
        SET name = 'Pantry', normalized_name = 'pantry', updated_at = CURRENT_TIMESTAMP
        WHERE starter.household_id = :household_id
          AND starter.item_type = 'food'
          AND starter.normalized_name = 'pantry staples'
          AND starter.archived_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM catalog_categories AS pantry
              WHERE pantry.household_id = starter.household_id
                AND pantry.item_type = 'food'
                AND pantry.normalized_name = 'pantry'
                AND pantry.archived_at IS NULL
          )
    """), {"household_id": household_id})

    for item_type, normalized_name, emoji in STARTER_EMOJI:
        connection.execute(text("""
            UPDATE catalog_categories
            SET emoji = :emoji
            WHERE household_id = :household_id
              AND item_type = :item_type
              AND normalized_name = :normalized_name
              AND archived_at IS NULL
              AND emoji IS NULL
        """), {
            "household_id": household_id,
            "item_type": item_type,
            "normalized_name": normalized_name,
            "emoji": emoji,
        })
    return True


def upgrade() -> None:
    connection = op.get_bind()
    existing_columns = {column["name"] for column in sa.inspect(connection).get_columns("catalog_categories")}
    is_first_application = "emoji" not in existing_columns
    if is_first_application:
        op.add_column("catalog_categories", sa.Column("emoji", sa.Text(), nullable=True))
    existing_checks = {constraint["name"] for constraint in sa.inspect(connection).get_check_constraints("catalog_categories")}
    if "catalog_categories_emoji_not_blank" not in existing_checks:
        op.create_check_constraint(
            "catalog_categories_emoji_not_blank",
            "catalog_categories",
            "emoji IS NULL OR (btrim(emoji) <> '' AND char_length(emoji) <= 16)",
        )

    # downgrade intentionally preserves user emoji and names. If a later
    # upgrade follows that no-op downgrade, do not backfill over user choices.
    if is_first_application:
        household_ids = connection.execute(text("SELECT id::text FROM households ORDER BY id")).scalars().all()
        for household_id in household_ids:
            update_active_household_categories(connection, household_id)


def downgrade() -> None:
    # Emoji and category names are now user-managed data. Keep the additive
    # column and values rather than deleting user choices on downgrade.
    pass
