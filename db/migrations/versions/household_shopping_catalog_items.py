"""Make Shopping rows reference one canonical household Catalog item.

Revision ID: household_shopping_catalog_items
Revises: household_meal_planning
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "household_shopping_catalog_items"
down_revision: str | Sequence[str] | None = "household_meal_planning"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    unresolved = connection.execute(text("""
        SELECT item.id::text AS id, item.household_id::text AS household_id, item.name,
               count(catalog.id)::int AS candidate_count
        FROM shopping_list_items item
        LEFT JOIN catalog_items catalog
          ON catalog.household_id = item.household_id
         AND catalog.normalized_name = lower(btrim(regexp_replace(item.name, '[[:space:]]+', ' ', 'g')))
         AND catalog.archived_at IS NULL
        WHERE item.catalog_item_id IS NULL
        GROUP BY item.id, item.household_id, item.name
        HAVING count(catalog.id) <> 1
        ORDER BY item.household_id, item.id
        LIMIT 20
    """)).mappings().all()
    if unresolved:
        details = "; ".join(
            f"row {row['id']} ({row['name']!r}, {row['candidate_count']} active matches)"
            for row in unresolved
        )
        raise RuntimeError("Shopping migration needs manual Catalog mapping for legacy rows: " + details)

    connection.execute(text("""
        UPDATE shopping_list_items AS list_item
        SET catalog_item_id = catalog.id
        FROM catalog_items AS catalog
        WHERE list_item.catalog_item_id IS NULL
          AND catalog.household_id = list_item.household_id
          AND catalog.normalized_name = lower(btrim(regexp_replace(list_item.name, '[[:space:]]+', ' ', 'g')))
          AND catalog.archived_at IS NULL
    """))
    collisions = connection.execute(text("""
        SELECT household_id::text AS household_id, catalog_item_id::text AS catalog_item_id,
               count(*)::int AS row_count
        FROM shopping_list_items
        GROUP BY household_id, catalog_item_id
        HAVING count(*) > 1
        ORDER BY household_id, catalog_item_id
        LIMIT 20
    """)).mappings().all()
    if collisions:
        details = "; ".join(
            f"household {row['household_id']} item {row['catalog_item_id']} has {row['row_count']} rows"
            for row in collisions
        )
        raise RuntimeError("Shopping migration found duplicate Catalog rows requiring review: " + details)

    op.execute("ALTER TABLE shopping_list_items ALTER COLUMN catalog_item_id SET NOT NULL")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN shopping_unit_code TEXT")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN custom_shopping_unit_id UUID")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN shopping_store_id UUID")
    op.execute("""
        ALTER TABLE shopping_list_items
        ADD CONSTRAINT shopping_list_items_shopping_unit_fk
          FOREIGN KEY (shopping_unit_code) REFERENCES catalog_shopping_units (code) ON DELETE RESTRICT,
        ADD CONSTRAINT shopping_list_items_custom_shopping_unit_fk
          FOREIGN KEY (household_id, custom_shopping_unit_id)
          REFERENCES household_shopping_units (household_id, id) ON DELETE RESTRICT,
        ADD CONSTRAINT shopping_list_items_shopping_store_fk
          FOREIGN KEY (household_id, shopping_store_id)
          REFERENCES catalog_stores (household_id, id) ON DELETE RESTRICT,
        ADD CONSTRAINT shopping_list_items_unit_modes_exclusive CHECK (
          NOT (
            (shopping_unit_code IS NOT NULL OR custom_shopping_unit_id IS NOT NULL)
            AND (recipe_unit_code IS NOT NULL OR custom_unit_label IS NOT NULL)
          )
        ),
        ADD CONSTRAINT shopping_list_items_shopping_unit_exclusive CHECK (
          shopping_unit_code IS NULL OR custom_shopping_unit_id IS NULL
        ),
        ADD CONSTRAINT shopping_list_items_catalog_item_unique UNIQUE (household_id, catalog_item_id)
    """)


def downgrade() -> None:
    # Do not make rows name-only again: that would invalidate the canonical
    # identity guarantees and can lose the mapping decisions made at upgrade.
    op.execute("ALTER TABLE shopping_list_items DROP CONSTRAINT shopping_list_items_catalog_item_unique")
    op.execute("""
        ALTER TABLE shopping_list_items
        DROP CONSTRAINT shopping_list_items_shopping_unit_exclusive,
        DROP CONSTRAINT shopping_list_items_unit_modes_exclusive,
        DROP CONSTRAINT shopping_list_items_shopping_store_fk,
        DROP CONSTRAINT shopping_list_items_custom_shopping_unit_fk,
        DROP CONSTRAINT shopping_list_items_shopping_unit_fk,
        DROP COLUMN shopping_store_id,
        DROP COLUMN custom_shopping_unit_id,
        DROP COLUMN shopping_unit_code
    """)
    op.execute("ALTER TABLE shopping_list_items ALTER COLUMN catalog_item_id DROP NOT NULL")
