"""Add household-owned recipes, ingredients, and directions.

Revision ID: household_recipes
Revises: catalog_category_emoji
"""

from collections.abc import Sequence

from alembic import op

revision: str = "household_recipes"
down_revision: str | Sequence[str] | None = "catalog_category_emoji"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE household_recipes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
            create_request_id TEXT NOT NULL,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            cover_kind TEXT NOT NULL DEFAULT 'initials',
            cover_emoji TEXT,
            servings INTEGER,
            prep_minutes INTEGER,
            cook_minutes INTEGER,
            notes TEXT,
            source_url TEXT,
            edit_revision INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            archived_at TIMESTAMPTZ,
            CONSTRAINT household_recipes_household_id_id_unique UNIQUE (household_id, id),
            CONSTRAINT household_recipes_create_request_not_blank CHECK (char_length(btrim(create_request_id)) > 0),
            CONSTRAINT household_recipes_create_request_length CHECK (char_length(create_request_id) <= 80),
            CONSTRAINT household_recipes_create_request_unique UNIQUE (household_id, created_by_user_id, create_request_id),
            CONSTRAINT household_recipes_name_not_blank CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT household_recipes_name_normalized CHECK (
                normalized_name = lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
            ),
            CONSTRAINT household_recipes_cover_valid CHECK (
                (cover_kind = 'initials' AND cover_emoji IS NULL)
                OR (cover_kind = 'emoji' AND cover_emoji IS NOT NULL AND btrim(cover_emoji) <> '')
            ),
            CONSTRAINT household_recipes_cover_kind_valid CHECK (cover_kind IN ('initials', 'emoji')),
            CONSTRAINT household_recipes_servings_positive CHECK (servings IS NULL OR servings > 0),
            CONSTRAINT household_recipes_prep_minutes_nonnegative CHECK (prep_minutes IS NULL OR prep_minutes >= 0),
            CONSTRAINT household_recipes_cook_minutes_nonnegative CHECK (cook_minutes IS NULL OR cook_minutes >= 0),
            CONSTRAINT household_recipes_source_url_length CHECK (source_url IS NULL OR char_length(source_url) <= 2048),
            CONSTRAINT household_recipes_revision_positive CHECK (edit_revision > 0)
        )
    """)
    op.execute("""
        CREATE INDEX household_recipes_household_active_name_index
        ON household_recipes (household_id, normalized_name, id)
        WHERE archived_at IS NULL
    """)
    op.execute("""
        CREATE INDEX household_recipes_household_archived_index
        ON household_recipes (household_id, archived_at, updated_at DESC)
    """)

    # PostgreSQL requires a unique constraint/index over the exact referenced
    # columns for the same-household Catalog-item foreign key below. Catalog
    # already has a primary key on id, but that alone does not qualify
    # (household_id, id) as a composite FK target.
    op.execute("""
        ALTER TABLE catalog_items
        ADD CONSTRAINT catalog_items_household_id_id_unique
        UNIQUE (household_id, id)
    """)

    op.execute("""
        CREATE TABLE household_recipe_ingredients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            recipe_id UUID NOT NULL,
            catalog_item_id UUID NOT NULL,
            position INTEGER NOT NULL,
            amount NUMERIC(18, 6),
            recipe_unit_code TEXT,
            recipe_unit_dimension TEXT,
            custom_unit_label TEXT,
            note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT household_recipe_ingredients_recipe_fk
                FOREIGN KEY (household_id, recipe_id)
                REFERENCES household_recipes (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT household_recipe_ingredients_catalog_item_fk
                FOREIGN KEY (household_id, catalog_item_id)
                REFERENCES catalog_items (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT household_recipe_ingredients_measurement_unit_fk
                FOREIGN KEY (recipe_unit_code, recipe_unit_dimension)
                REFERENCES recipe_measurement_units (code, dimension) ON DELETE RESTRICT,
            CONSTRAINT household_recipe_ingredients_position_nonnegative CHECK (position >= 0),
            CONSTRAINT household_recipe_ingredients_amount_positive CHECK (amount IS NULL OR amount > 0),
            CONSTRAINT household_recipe_ingredients_unit_exclusive CHECK (
                (recipe_unit_code IS NULL AND recipe_unit_dimension IS NULL AND custom_unit_label IS NULL)
                OR (recipe_unit_code IS NOT NULL AND recipe_unit_dimension IS NOT NULL AND custom_unit_label IS NULL)
                OR (recipe_unit_code IS NULL AND recipe_unit_dimension IS NULL AND custom_unit_label IS NOT NULL
                    AND char_length(btrim(custom_unit_label)) > 0)
            ),
            CONSTRAINT household_recipe_ingredients_household_recipe_position_unique
                UNIQUE (household_id, recipe_id, position)
        )
    """)
    op.execute("CREATE INDEX household_recipe_ingredients_catalog_item_index ON household_recipe_ingredients (household_id, catalog_item_id)")

    op.execute("""
        CREATE TABLE household_recipe_steps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            recipe_id UUID NOT NULL,
            position INTEGER NOT NULL,
            instruction TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT household_recipe_steps_recipe_fk
                FOREIGN KEY (household_id, recipe_id)
                REFERENCES household_recipes (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT household_recipe_steps_position_nonnegative CHECK (position >= 0),
            CONSTRAINT household_recipe_steps_instruction_not_blank CHECK (char_length(btrim(instruction)) > 0),
            CONSTRAINT household_recipe_steps_instruction_length CHECK (char_length(instruction) <= 4000),
            CONSTRAINT household_recipe_steps_household_recipe_position_unique UNIQUE (household_id, recipe_id, position)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE household_recipe_steps")
    op.execute("DROP TABLE household_recipe_ingredients")
    op.execute("ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_household_id_id_unique")
    op.execute("DROP TABLE household_recipes")
