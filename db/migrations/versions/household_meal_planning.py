"""Household meal plans and shopping-review contributions.

Revision ID: household_meal_planning
Revises: household_recipes
"""

from collections.abc import Sequence

from alembic import op

revision: str = "household_meal_planning"
down_revision: str | Sequence[str] | None = "household_recipes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE household_meal_plan_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            planned_for DATE NOT NULL,
            meal_slot TEXT NOT NULL,
            recipe_id UUID NOT NULL,
            created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            edit_revision INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT household_meal_plan_slot_valid CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner')),
            CONSTRAINT household_meal_plan_revision_positive CHECK (edit_revision > 0),
            CONSTRAINT household_meal_plan_household_recipe_fk
                FOREIGN KEY (household_id, recipe_id)
                REFERENCES household_recipes (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT household_meal_plan_household_date_slot_unique
                UNIQUE (household_id, planned_for, meal_slot)
        )
    """)

    # Keep every existing manual row valid while making household consistency
    # enforceable for plan-created rows and catalog references.
    op.execute("ALTER TABLE shopping_lists ADD CONSTRAINT shopping_lists_household_id_id_unique UNIQUE (household_id, id)")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN household_id UUID")
    op.execute("""
        UPDATE shopping_list_items item SET household_id = list.household_id
        FROM shopping_lists list WHERE list.id = item.shopping_list_id
    """)
    op.execute("ALTER TABLE shopping_list_items ALTER COLUMN household_id SET NOT NULL")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN catalog_item_id UUID")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN amount NUMERIC(18, 6)")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN recipe_unit_code TEXT")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN recipe_unit_dimension TEXT")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN custom_unit_label TEXT")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN meal_plan_request_id UUID")
    op.execute("ALTER TABLE shopping_list_items ADD COLUMN meal_plan_need_key TEXT")
    op.execute("""
        ALTER TABLE shopping_list_items
        ADD CONSTRAINT shopping_list_items_household_list_fk
            FOREIGN KEY (household_id, shopping_list_id)
            REFERENCES shopping_lists (household_id, id) ON DELETE RESTRICT,
        ADD CONSTRAINT shopping_list_items_household_catalog_fk
            FOREIGN KEY (household_id, catalog_item_id)
            REFERENCES catalog_items (household_id, id) ON DELETE RESTRICT,
        ADD CONSTRAINT shopping_list_items_recipe_unit_fk
            FOREIGN KEY (recipe_unit_code, recipe_unit_dimension)
            REFERENCES recipe_measurement_units (code, dimension) ON DELETE RESTRICT,
        ADD CONSTRAINT shopping_list_items_amount_positive CHECK (amount IS NULL OR amount > 0),
        ADD CONSTRAINT shopping_list_items_unit_exclusive CHECK (
            (recipe_unit_code IS NULL AND recipe_unit_dimension IS NULL AND custom_unit_label IS NULL)
            OR (recipe_unit_code IS NOT NULL AND recipe_unit_dimension IS NOT NULL AND custom_unit_label IS NULL)
            OR (recipe_unit_code IS NULL AND recipe_unit_dimension IS NULL
                AND custom_unit_label IS NOT NULL AND char_length(btrim(custom_unit_label)) > 0)
        ),
        ADD CONSTRAINT shopping_list_items_meal_plan_source_pair CHECK (
            (meal_plan_request_id IS NULL AND meal_plan_need_key IS NULL)
            OR (meal_plan_request_id IS NOT NULL AND meal_plan_need_key IS NOT NULL
                AND char_length(btrim(meal_plan_need_key)) > 0)
        )
    """)
    op.execute("""
        CREATE TABLE shopping_list_meal_plan_requests (
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            request_id UUID NOT NULL,
            created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            request_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT shopping_list_meal_plan_requests_pk PRIMARY KEY (household_id, request_id),
            CONSTRAINT shopping_list_meal_plan_requests_hash_not_blank CHECK (char_length(btrim(request_hash)) > 0)
        )
    """)
    op.execute("""
        ALTER TABLE shopping_list_items
        ADD CONSTRAINT shopping_list_items_meal_plan_request_fk
            FOREIGN KEY (household_id, meal_plan_request_id)
            REFERENCES shopping_list_meal_plan_requests (household_id, request_id) ON DELETE RESTRICT
    """)
    op.execute("""
        CREATE UNIQUE INDEX shopping_list_items_meal_plan_need_unique
        ON shopping_list_items (household_id, meal_plan_request_id, meal_plan_need_key)
        WHERE meal_plan_request_id IS NOT NULL
    """)
    op.execute("CREATE INDEX shopping_list_items_catalog_item_index ON shopping_list_items (household_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL")
    op.execute("CREATE INDEX shopping_list_items_household_created_index ON shopping_list_items (household_id, created_at, id)")


def downgrade() -> None:
    op.execute("ALTER TABLE shopping_list_items DROP CONSTRAINT shopping_list_items_meal_plan_request_fk")
    op.execute("DROP TABLE shopping_list_meal_plan_requests")
    op.execute("DROP INDEX shopping_list_items_meal_plan_need_unique")
    op.execute("DROP INDEX shopping_list_items_catalog_item_index")
    op.execute("DROP INDEX shopping_list_items_household_created_index")
    op.execute("""
        ALTER TABLE shopping_list_items
        DROP CONSTRAINT shopping_list_items_meal_plan_source_pair,
        DROP CONSTRAINT shopping_list_items_unit_exclusive,
        DROP CONSTRAINT shopping_list_items_amount_positive,
        DROP CONSTRAINT shopping_list_items_recipe_unit_fk,
        DROP CONSTRAINT shopping_list_items_household_catalog_fk,
        DROP CONSTRAINT shopping_list_items_household_list_fk,
        DROP COLUMN meal_plan_need_key,
        DROP COLUMN meal_plan_request_id,
        DROP COLUMN custom_unit_label,
        DROP COLUMN recipe_unit_dimension,
        DROP COLUMN recipe_unit_code,
        DROP COLUMN amount,
        DROP COLUMN catalog_item_id,
        DROP COLUMN household_id
    """)
    op.execute("ALTER TABLE shopping_lists DROP CONSTRAINT shopping_lists_household_id_id_unique")
    op.execute("DROP TABLE household_meal_plan_entries")
