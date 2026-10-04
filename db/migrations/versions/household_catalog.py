"""Household-scoped reusable catalog.

Revision ID: household_catalog
Revises: household_management_profiles
"""

from collections.abc import Sequence

from alembic import op

revision: str = "household_catalog"
down_revision: str | Sequence[str] | None = "household_management_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE catalog_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            item_type TEXT NOT NULL,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            archived_at TIMESTAMPTZ,
            CONSTRAINT catalog_categories_item_type_valid
                CHECK (item_type IN ('food', 'household')),
            CONSTRAINT catalog_categories_name_not_blank
                CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT catalog_categories_name_normalized
                CHECK (normalized_name = lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))),
            CONSTRAINT catalog_categories_household_id_id_type_unique
                UNIQUE (household_id, id, item_type),
            CONSTRAINT catalog_categories_household_id_id_unique
                UNIQUE (household_id, id)
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX catalog_categories_active_name_unique
        ON catalog_categories (household_id, item_type, normalized_name)
        WHERE archived_at IS NULL
    """)

    op.execute("""
        CREATE TABLE catalog_stores (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            archived_at TIMESTAMPTZ,
            CONSTRAINT catalog_stores_name_not_blank
                CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT catalog_stores_name_normalized
                CHECK (normalized_name = lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))),
            CONSTRAINT catalog_stores_household_id_id_unique UNIQUE (household_id, id)
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX catalog_stores_active_name_unique
        ON catalog_stores (household_id, normalized_name)
        WHERE archived_at IS NULL
    """)

    op.execute("""
        CREATE TABLE household_shopping_units (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            archived_at TIMESTAMPTZ,
            CONSTRAINT household_shopping_units_name_not_blank
                CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT household_shopping_units_name_normalized
                CHECK (normalized_name = lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))),
            CONSTRAINT household_shopping_units_household_id_id_unique UNIQUE (household_id, id)
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX household_shopping_units_active_name_unique
        ON household_shopping_units (household_id, normalized_name)
        WHERE archived_at IS NULL
    """)

    op.execute("""
        CREATE TABLE catalog_shopping_units (
            code TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            unit_group TEXT NOT NULL,
            CONSTRAINT catalog_shopping_units_label_not_blank CHECK (char_length(btrim(label)) > 0),
            CONSTRAINT catalog_shopping_units_group_valid
                CHECK (unit_group IN ('package_count', 'measured'))
        )
    """)
    op.execute("CREATE UNIQUE INDEX catalog_shopping_units_label_normalized_unique ON catalog_shopping_units (lower(label))")
    op.execute("""
        INSERT INTO catalog_shopping_units (code, label, unit_group) VALUES
            ('unit', 'Unit', 'package_count'),
            ('bag', 'Bag', 'package_count'),
            ('bottle', 'Bottle', 'package_count'),
            ('box', 'Box', 'package_count'),
            ('bunch', 'Bunch', 'package_count'),
            ('can', 'Can', 'package_count'),
            ('carton', 'Carton', 'package_count'),
            ('dozen', 'Dozen', 'package_count'),
            ('jar', 'Jar', 'package_count'),
            ('loaf', 'Loaf', 'package_count'),
            ('pack', 'Pack', 'package_count'),
            ('roll', 'Roll', 'package_count'),
            ('tub', 'Tub', 'package_count'),
            ('milliliter', 'Milliliter', 'measured'),
            ('liter', 'Liter', 'measured'),
            ('teaspoon', 'Teaspoon', 'measured'),
            ('tablespoon', 'Tablespoon', 'measured'),
            ('fluid_ounce', 'Fluid ounce', 'measured'),
            ('cup', 'Cup', 'measured'),
            ('pint', 'Pint', 'measured'),
            ('quart', 'Quart', 'measured'),
            ('gallon', 'Gallon', 'measured'),
            ('gram', 'Gram', 'measured'),
            ('kilogram', 'Kilogram', 'measured'),
            ('ounce', 'Ounce', 'measured'),
            ('pound', 'Pound', 'measured')
    """)

    op.execute("""
        CREATE TABLE recipe_measurement_units (
            code TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            dimension TEXT NOT NULL,
            CONSTRAINT recipe_measurement_units_dimension_valid
                CHECK (dimension IN ('volume', 'mass', 'count')),
            CONSTRAINT recipe_measurement_units_label_not_blank CHECK (char_length(btrim(label)) > 0),
            CONSTRAINT recipe_measurement_units_code_dimension_unique UNIQUE (code, dimension)
        )
    """)
    op.execute("""
        INSERT INTO recipe_measurement_units (code, label, dimension) VALUES
            ('milliliter', 'Milliliter', 'volume'),
            ('liter', 'Liter', 'volume'),
            ('teaspoon', 'Teaspoon', 'volume'),
            ('tablespoon', 'Tablespoon', 'volume'),
            ('fluid_ounce', 'Fluid ounce', 'volume'),
            ('cup', 'Cup', 'volume'),
            ('pint', 'Pint', 'volume'),
            ('quart', 'Quart', 'volume'),
            ('gallon', 'Gallon', 'volume'),
            ('gram', 'Gram', 'mass'),
            ('kilogram', 'Kilogram', 'mass'),
            ('ounce', 'Ounce', 'mass'),
            ('pound', 'Pound', 'mass'),
            ('unit', 'Unit', 'count'),
            ('dozen', 'Dozen', 'count')
    """)

    op.execute("""
        CREATE TABLE catalog_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            item_type TEXT NOT NULL,
            category_id UUID,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            shopping_unit_code TEXT REFERENCES catalog_shopping_units (code) ON DELETE RESTRICT,
            custom_shopping_unit_id UUID,
            preferred_store_id UUID,
            recipe_measurement_dimension TEXT,
            recipe_measurement_unit_code TEXT,
            created_by_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            archived_at TIMESTAMPTZ,
            CONSTRAINT catalog_items_type_valid CHECK (item_type IN ('food', 'household')),
            CONSTRAINT catalog_items_name_not_blank CHECK (char_length(btrim(name)) > 0),
            CONSTRAINT catalog_items_name_normalized
                CHECK (normalized_name = lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))),
            CONSTRAINT catalog_items_shopping_unit_exclusive CHECK (
                (shopping_unit_code IS NULL AND custom_shopping_unit_id IS NULL)
                OR (shopping_unit_code IS NOT NULL AND custom_shopping_unit_id IS NULL)
                OR (shopping_unit_code IS NULL AND custom_shopping_unit_id IS NOT NULL)
            ),
            CONSTRAINT catalog_items_recipe_fields_paired CHECK (
                (recipe_measurement_dimension IS NULL AND recipe_measurement_unit_code IS NULL)
                OR (recipe_measurement_dimension IS NOT NULL AND recipe_measurement_unit_code IS NOT NULL)
            ),
            CONSTRAINT catalog_items_recipe_dimension_valid CHECK (
                recipe_measurement_dimension IS NULL
                OR recipe_measurement_dimension IN ('volume', 'mass', 'count')
            ),
            CONSTRAINT catalog_items_recipe_food_only CHECK (
                item_type = 'food'
                OR (recipe_measurement_dimension IS NULL AND recipe_measurement_unit_code IS NULL)
            ),
            CONSTRAINT catalog_items_household_category_type_fk
                FOREIGN KEY (household_id, category_id, item_type)
                REFERENCES catalog_categories (household_id, id, item_type) ON DELETE RESTRICT,
            CONSTRAINT catalog_items_household_custom_unit_fk
                FOREIGN KEY (household_id, custom_shopping_unit_id)
                REFERENCES household_shopping_units (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT catalog_items_household_store_fk
                FOREIGN KEY (household_id, preferred_store_id)
                REFERENCES catalog_stores (household_id, id) ON DELETE RESTRICT,
            CONSTRAINT catalog_items_recipe_unit_dimension_fk
                FOREIGN KEY (recipe_measurement_unit_code, recipe_measurement_dimension)
                REFERENCES recipe_measurement_units (code, dimension) ON DELETE RESTRICT
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX catalog_items_active_name_unique
        ON catalog_items (household_id, normalized_name)
        WHERE archived_at IS NULL
    """)
    op.execute("CREATE INDEX catalog_items_household_type_name_index ON catalog_items (household_id, item_type, normalized_name) WHERE archived_at IS NULL")


def downgrade() -> None:
    op.execute("DROP TABLE catalog_items")
    op.execute("DROP TABLE recipe_measurement_units")
    op.execute("DROP TABLE catalog_shopping_units")
    op.execute("DROP TABLE household_shopping_units")
    op.execute("DROP TABLE catalog_stores")
    op.execute("DROP TABLE catalog_categories")
