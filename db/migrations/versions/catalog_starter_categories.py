"""Seed default household catalog categories once.

Revision ID: catalog_starter_categories
Revises: household_catalog
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "catalog_starter_categories"
down_revision: str | Sequence[str] | None = "household_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


STARTER_CATEGORIES = (
    ("food", "Produce"),
    ("food", "Dairy & Eggs"),
    ("food", "Meat & Seafood"),
    ("food", "Bakery"),
    ("food", "Pantry Staples"),
    ("food", "Frozen"),
    ("food", "Beverages"),
    ("household", "Cleaning"),
    ("household", "Paper Goods"),
    ("household", "Personal Care"),
)

SEED_SET = "starter_categories_v1"


def _ensure_seed_ledger(connection) -> None:
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS catalog_household_seed_sets (
            household_id UUID NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
            seed_set TEXT NOT NULL,
            completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (household_id, seed_set)
        )
    """))

    columns = connection.execute(text("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'catalog_household_seed_sets'
    """)).all()
    actual_columns = {row.column_name: (row.data_type, row.is_nullable) for row in columns}
    expected_columns = {
        "household_id": ("uuid", "NO"),
        "seed_set": ("text", "NO"),
        "completed_at": ("timestamp with time zone", "NO"),
    }
    if actual_columns != expected_columns:
        raise RuntimeError("catalog_household_seed_sets has an unexpected schema")

    primary_key = connection.execute(text("""
        SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
        FROM pg_constraint AS constraint_row
        CROSS JOIN LATERAL unnest(constraint_row.conkey)
            WITH ORDINALITY AS key_column(attribute_number, ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = key_column.attribute_number
        WHERE constraint_row.conrelid = 'catalog_household_seed_sets'::regclass
          AND constraint_row.contype = 'p'
        GROUP BY constraint_row.oid
    """)).scalar_one_or_none()
    if primary_key != ["household_id", "seed_set"]:
        raise RuntimeError("catalog_household_seed_sets has an unexpected primary key")

    foreign_key = connection.execute(text("""
        SELECT EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_row
            WHERE constraint_row.conrelid = 'catalog_household_seed_sets'::regclass
              AND constraint_row.contype = 'f'
              AND constraint_row.confrelid = 'households'::regclass
              AND constraint_row.confdeltype = 'r'
              AND pg_get_constraintdef(constraint_row.oid) LIKE
                  'FOREIGN KEY (household_id) REFERENCES households(id)%'
        )
    """)).scalar_one()
    if not foreign_key:
        raise RuntimeError("catalog_household_seed_sets is missing its restrictive household foreign key")


def seed_active_household_categories(connection, household_id: str) -> bool:
    """Seed one active household under the shared household-row lock.

    The caller owns the transaction. Returning False means the household is
    missing, deleted, or this seed set was already completed.
    """
    household = connection.execute(text("""
        SELECT id::text, deleted_at
        FROM households
        WHERE id = :household_id
        FOR UPDATE
    """), {"household_id": household_id}).mappings().one_or_none()
    if household is None or household["deleted_at"] is not None:
        return False

    completed = connection.execute(text("""
        SELECT 1 FROM catalog_household_seed_sets
        WHERE household_id = :household_id AND seed_set = :seed_set
    """), {"household_id": household_id, "seed_set": SEED_SET}).scalar_one_or_none()
    if completed is not None:
        return False

    for item_type, name in STARTER_CATEGORIES:
        connection.execute(text("""
            INSERT INTO catalog_categories
                (household_id, item_type, name, normalized_name)
            SELECT
                :household_id,
                :item_type,
                :name,
                lower(btrim(regexp_replace(:name, '[[:space:]]+', ' ', 'g')))
            WHERE NOT EXISTS (
                SELECT 1 FROM catalog_categories
                WHERE household_id = :household_id
                  AND item_type = :item_type
                  AND normalized_name = lower(btrim(regexp_replace(:name, '[[:space:]]+', ' ', 'g')))
            )
            ON CONFLICT DO NOTHING
        """), {"household_id": household_id, "item_type": item_type, "name": name})

    connection.execute(text("""
        INSERT INTO catalog_household_seed_sets (household_id, seed_set)
        VALUES (:household_id, :seed_set)
        ON CONFLICT (household_id, seed_set) DO NOTHING
    """), {"household_id": household_id, "seed_set": SEED_SET})
    return True


def upgrade() -> None:
    connection = op.get_bind()
    _ensure_seed_ledger(connection)
    household_ids = connection.execute(text("SELECT id::text FROM households ORDER BY id")).scalars().all()
    for household_id in household_ids:
        seed_active_household_categories(connection, household_id)


def downgrade() -> None:
    # Seeded categories are user-managed data. Preserve both rows and ledger so
    # downgrade/re-upgrade cannot resurrect renamed or archived starter names.
    pass
