"""Allow leftovers and eating out without synthetic recipes.

Revision ID: meal_plan_special_entries
Revises: household_shopping_catalog_items
"""
from alembic import op

revision = "meal_plan_special_entries"
down_revision = "household_shopping_catalog_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE household_meal_plan_entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'recipe'")
    op.execute("ALTER TABLE household_meal_plan_entries ADD COLUMN detail TEXT")
    op.execute("ALTER TABLE household_meal_plan_entries ALTER COLUMN recipe_id DROP NOT NULL")
    op.execute("""
        ALTER TABLE household_meal_plan_entries
        ADD CONSTRAINT meal_plan_entry_type_valid CHECK (
            (entry_type = 'recipe' AND recipe_id IS NOT NULL AND detail IS NULL)
            OR (entry_type IN ('leftovers', 'eating_out') AND recipe_id IS NULL)
        ),
        ADD CONSTRAINT meal_plan_detail_valid CHECK (
            detail IS NULL OR (detail = btrim(detail) AND char_length(detail) BETWEEN 1 AND 160)
        )
    """)


def downgrade() -> None:
    # Check under the same table lock as the DDL: a concurrent special entry
    # cannot appear between the guard and restoring the old NOT NULL constraint.
    op.execute("LOCK TABLE household_meal_plan_entries IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM household_meal_plan_entries WHERE entry_type <> 'recipe') THEN
                RAISE EXCEPTION 'Cannot downgrade while non-recipe planned meals exist';
            END IF;
        END $$
    """)
    op.execute("ALTER TABLE household_meal_plan_entries DROP CONSTRAINT meal_plan_entry_type_valid, DROP CONSTRAINT meal_plan_detail_valid")
    op.execute("ALTER TABLE household_meal_plan_entries ALTER COLUMN recipe_id SET NOT NULL")
    op.execute("ALTER TABLE household_meal_plan_entries DROP COLUMN detail, DROP COLUMN entry_type")
