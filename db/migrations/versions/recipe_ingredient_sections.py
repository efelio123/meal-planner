"""Optional household-scoped recipe ingredient sections."""
from alembic import op

revision = "recipe_ingredient_sections"
down_revision = "meal_plan_special_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE household_recipe_sections (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL,
            recipe_id UUID NOT NULL,
            position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
            name TEXT NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
            CONSTRAINT recipe_sections_recipe_fk FOREIGN KEY (household_id, recipe_id)
                REFERENCES household_recipes (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT recipe_sections_owner_unique UNIQUE (household_id, recipe_id, id),
            CONSTRAINT recipe_sections_position_unique UNIQUE (household_id, recipe_id, position)
        )
    """)
    op.execute("ALTER TABLE household_recipe_ingredients ADD COLUMN section_id UUID")
    op.execute("""
        ALTER TABLE household_recipe_ingredients ADD CONSTRAINT recipe_ingredient_section_fk
        FOREIGN KEY (household_id, recipe_id, section_id)
        REFERENCES household_recipe_sections (household_id, recipe_id, id) ON DELETE RESTRICT
    """)


def downgrade() -> None:
    op.execute("LOCK TABLE household_recipe_sections IN ACCESS EXCLUSIVE MODE")
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM household_recipe_sections) THEN
                RAISE EXCEPTION 'Cannot downgrade while recipe sections exist';
            END IF;
        END $$
    """)
    op.execute("ALTER TABLE household_recipe_ingredients DROP CONSTRAINT recipe_ingredient_section_fk, DROP COLUMN section_id")
    op.execute("DROP TABLE household_recipe_sections")
