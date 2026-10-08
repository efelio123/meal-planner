import importlib.util
import os
from collections.abc import Generator
from pathlib import Path
from uuid import uuid4

import alembic.op
import pytest
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"
REVISION_PATH = Path(__file__).resolve().parents[3] / "db" / "migrations" / "versions" / "household_shopping_lists.py"


def load_revision():
    spec = importlib.util.spec_from_file_location("household_shopping_lists_revision", REVISION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def migration_engine() -> Generator[Engine]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is not configured.")
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail("Shopping-list migration tests require meal_planner_disposable_test.")
    engine = create_engine(url)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def database_connection(migration_engine: Engine) -> Generator[Connection]:
    with migration_engine.connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()


def insert_user(connection: Connection) -> str:
    return connection.execute(
        text(
            """INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
            VALUES ('shopping-test', :subject, :email, 'Shopping Test') RETURNING id::text"""
        ),
        {"subject": str(uuid4()), "email": f"{uuid4()}@example.test"},
    ).scalar_one()


def insert_household(connection: Connection, user_id: str, name: str) -> str:
    return connection.execute(
        text(
            """INSERT INTO households (name, time_zone, created_by_user_id)
            VALUES (:name, 'UTC', :user_id) RETURNING id::text"""
        ),
        {"name": name, "user_id": user_id},
    ).scalar_one()


def test_upgrade_includes_the_reviewed_backfill_statement(monkeypatch: pytest.MonkeyPatch) -> None:
    revision = load_revision()
    executed: list[str] = []
    monkeypatch.setattr(alembic.op, "execute", lambda statement: executed.append(str(statement)))

    revision.upgrade()

    assert executed[-1] == revision.BACKFILL_SQL
    assert "SELECT id FROM households WHERE deleted_at IS NULL" in revision.BACKFILL_SQL
    assert "ON CONFLICT (household_id) DO NOTHING" in revision.BACKFILL_SQL


def test_backfill_creates_lists_for_existing_active_households_only(database_connection: Connection) -> None:
    user_id = insert_user(database_connection)
    active_household_id = insert_household(database_connection, user_id, "Legacy active household")
    deleted_household_id = insert_household(database_connection, user_id, "Legacy deleted household")
    database_connection.execute(
        text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"),
        {"id": deleted_household_id},
    )

    revision = load_revision()
    database_connection.execute(text(revision.BACKFILL_SQL))
    lists = database_connection.execute(
        text("SELECT household_id::text FROM shopping_lists WHERE household_id IN (:active, :deleted)"),
        {"active": active_household_id, "deleted": deleted_household_id},
    ).scalars().all()

    assert lists == [active_household_id]


def test_shopping_list_schema_constraints_indexes_and_foreign_keys(database_connection: Connection) -> None:
    tables = database_connection.execute(
        text(
            """SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN ('shopping_lists', 'shopping_list_items')"""
        )
    ).scalars().all()
    assert set(tables) == {"shopping_lists", "shopping_list_items"}

    constraint_names = database_connection.execute(
        text(
            """SELECT conname FROM pg_constraint
            WHERE conrelid IN ('shopping_lists'::regclass, 'shopping_list_items'::regclass)"""
        )
    ).scalars().all()
    assert {
        "shopping_lists_household_unique",
        "shopping_list_items_name_not_blank",
        "shopping_list_items_checked_audit_is_consistent",
    }.issubset(constraint_names)
    indexes = database_connection.execute(
        text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'shopping_list_items'")
    ).scalars().all()
    assert "shopping_list_items_list_checked_created_index" in indexes

    creator_id = insert_user(database_connection)
    household_id = insert_household(database_connection, creator_id, "Constraint household")
    list_id = database_connection.execute(
        text("INSERT INTO shopping_lists (household_id) VALUES (:id) RETURNING id::text"),
        {"id": household_id},
    ).scalar_one()
    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(text("INSERT INTO shopping_lists (household_id) VALUES (:id)"), {"id": household_id})
    item_id = database_connection.execute(
        text("INSERT INTO shopping_list_items (household_id, shopping_list_id, name, created_by_user_id) SELECT household_id, id, 'Valid', :user FROM shopping_lists WHERE id=:list RETURNING id::text"),
        {"list": list_id, "user": creator_id},
    ).scalar_one()

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text("INSERT INTO shopping_list_items (household_id, shopping_list_id, name, created_by_user_id) SELECT household_id, id, '   ', :user FROM shopping_lists WHERE id=:list"),
            {"list": list_id, "user": creator_id},
        )
    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text("UPDATE shopping_list_items SET is_checked = TRUE WHERE id = :id"), {"id": item_id}
        )
    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(text("DELETE FROM shopping_lists WHERE id = :id"), {"id": list_id})
    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": creator_id})

    trigger_count = database_connection.execute(
        text(
            """SELECT count(*) FROM pg_trigger AS t
            JOIN pg_class relation ON relation.oid = t.tgrelid
            JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname IN ('shopping_lists', 'shopping_list_items')
              AND NOT t.tgisinternal"""
        )
    ).scalar_one()
    assert trigger_count == 0
