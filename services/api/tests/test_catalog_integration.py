import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from threading import Event
from time import monotonic, sleep
from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from meal_planner_api.household_management import delete_household
from meal_planner_api.main import app
from meal_planner_api.onboarding import (
    STARTER_CATALOG_CATEGORIES,
    CurrentUser,
    create_household,
    require_current_user,
)

DISPOSABLE_DATABASE = "meal_planner_disposable_test"
MIGRATION_PATH = Path(__file__).resolve().parents[3] / "db" / "migrations" / "versions" / "catalog_starter_categories.py"
MIGRATION_SPEC = spec_from_file_location("catalog_starter_categories_migration", MIGRATION_PATH)
assert MIGRATION_SPEC and MIGRATION_SPEC.loader
catalog_migration = module_from_spec(MIGRATION_SPEC)
MIGRATION_SPEC.loader.exec_module(catalog_migration)
EMOJI_MIGRATION_PATH = Path(__file__).resolve().parents[3] / "db" / "migrations" / "versions" / "catalog_category_emoji.py"
EMOJI_MIGRATION_SPEC = spec_from_file_location("catalog_category_emoji_migration", EMOJI_MIGRATION_PATH)
assert EMOJI_MIGRATION_SPEC and EMOJI_MIGRATION_SPEC.loader
emoji_migration = module_from_spec(EMOJI_MIGRATION_SPEC)
EMOJI_MIGRATION_SPEC.loader.exec_module(emoji_migration)


@pytest.fixture
def catalog_engine() -> Generator[Engine]:
    configured = os.getenv("DATABASE_URL")
    if not configured:
        pytest.skip("Catalog PostgreSQL integration tests require DATABASE_URL for meal_planner_disposable_test.")
    url = make_url(configured)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_DATABASE:
        pytest.fail("Catalog integration tests may only use meal_planner_disposable_test.")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            actual = connection.execute(text("SELECT current_database()")).scalar_one()
        if actual != DISPOSABLE_DATABASE:
            pytest.fail("The connected PostgreSQL database is not meal_planner_disposable_test.")
        yield engine
    finally:
        engine.dispose()


def insert_user(connection, email: str) -> str:
    return connection.execute(text("""
        INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
        VALUES ('test', :subject, :email, 'Catalog Tester') RETURNING id::text
    """), {"subject": str(uuid4()), "email": email}).scalar_one()


def insert_household(connection, owner_id: str, *, name: str) -> str:
    household_id = connection.execute(text("""
        INSERT INTO households (name, time_zone, created_by_user_id)
        VALUES (:name, 'America/Phoenix', :owner_id) RETURNING id::text
    """), {"name": name, "owner_id": owner_id}).scalar_one()
    connection.execute(text("""
        INSERT INTO household_members (household_id, user_id, role)
        VALUES (:household_id, :user_id, 'owner')
    """), {"household_id": household_id, "user_id": owner_id})
    return household_id


async def call_as(client: AsyncClient, user_id: str, method: str, path: str, **kwargs):
    app.dependency_overrides[require_current_user] = lambda: CurrentUser(user_id, f"{user_id}@example.test", "Catalog Tester")
    return await client.request(method, path, **kwargs)


def cleanup(engine: Engine, household_ids: list[str], user_ids: list[str]) -> None:
    with engine.begin() as connection:
        for household_id in household_ids:
            connection.execute(text("DELETE FROM catalog_household_seed_sets WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_shopping_units WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_stores WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_categories WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("""
                DELETE FROM shopping_list_items WHERE shopping_list_id IN
                    (SELECT id FROM shopping_lists WHERE household_id = :id)
            """), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
        for user_id in user_ids:
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_member_can_manage_catalog_and_archived_choices_are_excluded_and_rejected(catalog_engine: Engine) -> None:
    owner_id = member_id = household_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"owner-{uuid4()}@example.test")
            member_id = insert_user(connection, f"member-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Catalog {uuid4()}")
            connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:h, :u, 'member')"), {"h": household_id, "u": member_id})

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            options = await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/units")
            assert options.status_code == 200
            payload = options.json()
            assert {unit["label"] for unit in payload["shopping_units"]["built_in"]} == {
                "Unit", "Bag", "Bottle", "Box", "Bunch", "Can", "Carton", "Dozen", "Jar", "Loaf", "Pack", "Roll", "Tub",
                "Milliliter", "Liter", "Teaspoon", "Tablespoon", "Fluid ounce", "Cup", "Pint", "Quart", "Gallon", "Gram", "Kilogram", "Ounce", "Pound",
            }
            assert {unit["dimension"] for unit in payload["recipe_measurement_units"]} == {"volume", "mass", "count"}

            category = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/categories", json={"item_type": "food", "name": "Produce", "emoji": "🥬"})
            assert category.status_code == 201
            assert category.json()["category"]["emoji"] == "🥬"
            assert category.json()["category"]["active_item_count"] == 0
            category_id = category.json()["category"]["id"]
            listed_category = await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/categories?item_type=food")
            assert listed_category.json()["categories"] == [
                {**category.json()["category"], "active_item_count": 0}
            ]
            store = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/stores", json={"name": "Farmers Market"})
            assert store.status_code == 201
            store_id = store.json()["store"]["id"]
            custom_unit = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/shopping-units", json={"name": "Crate"})
            assert custom_unit.status_code == 201
            unit_id = custom_unit.json()["unit"]["id"]

            created = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/items", json={
                "name": "  Red   Apple ", "item_type": "food", "category_id": category_id,
                "custom_shopping_unit_id": unit_id, "preferred_store_id": store_id,
                "recipe_measurement_dimension": "mass", "recipe_measurement_unit_code": "gram",
            })
            assert created.status_code == 201, created.text
            item = created.json()["item"]
            assert item["name"] == "Red   Apple"
            assert item["category_name"] == "Produce"
            assert item["shopping_unit_label"] == "Crate"
            assert item["preferred_store_name"] == "Farmers Market"
            assert item["recipe_measurement_unit_label"] == "Gram"

            same_name_rename = await call_as(client, member_id, "PATCH", f"/v1/households/{household_id}/catalog/items/{item['id']}", json={"name": "Red   Apple"})
            assert same_name_rename.status_code == 200, same_name_rename.text
            second_item = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "Green Apple", "item_type": "food"})
            assert second_item.status_code == 201, second_item.text
            duplicate_rename = await call_as(client, member_id, "PATCH", f"/v1/households/{household_id}/catalog/items/{second_item.json()['item']['id']}", json={"name": "red apple"})
            assert duplicate_rename.status_code == 409
            assert duplicate_rename.json()["detail"]["code"] == "CATALOG_ITEM_ALREADY_EXISTS"

            stale_category_count = await call_as(client, member_id, "DELETE", f"/v1/households/{household_id}/catalog/categories/{category_id}?expected_active_item_count=0")
            assert stale_category_count.status_code == 409
            assert stale_category_count.json()["detail"]["code"] == "CATALOG_CATEGORY_COUNT_CHANGED"

            for choice_path in (f"stores/{store_id}", f"shopping-units/{unit_id}"):
                in_use = await call_as(client, member_id, "DELETE", f"/v1/households/{household_id}/catalog/{choice_path}")
                assert in_use.status_code == 409
                assert in_use.json()["detail"]["code"] == "CATALOG_CHOICE_IN_USE"

            renamed_category = await call_as(client, member_id, "PATCH", f"/v1/households/{household_id}/catalog/categories/{category_id}", json={"name": "Vegetables", "emoji": "🥕"})
            renamed_store = await call_as(client, member_id, "PATCH", f"/v1/households/{household_id}/catalog/stores/{store_id}", json={"name": "Grocery"})
            renamed_unit = await call_as(client, member_id, "PATCH", f"/v1/households/{household_id}/catalog/shopping-units/{unit_id}", json={"name": "Tote"})
            assert renamed_category.status_code == renamed_store.status_code == renamed_unit.status_code == 200
            assert renamed_category.json()["category"]["emoji"] == "🥕"
            assert renamed_category.json()["category"]["active_item_count"] == 1
            renamed_item = await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/items/{item['id']}")
            assert renamed_item.json()["item"]["category_name"] == "Vegetables"
            assert renamed_item.json()["item"]["preferred_store_name"] == "Grocery"
            assert renamed_item.json()["item"]["shopping_unit_label"] == "Tote"

            duplicate = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "red apple", "item_type": "household"})
            assert duplicate.status_code == 409
            assert duplicate.json()["detail"]["code"] == "CATALOG_ITEM_ALREADY_EXISTS"

            removed_item = await call_as(client, member_id, "DELETE", f"/v1/households/{household_id}/catalog/items/{item['id']}")
            assert removed_item.status_code == 204
            rearchived_category = await call_as(client, member_id, "DELETE", f"/v1/households/{household_id}/catalog/categories/{category_id}?expected_active_item_count=0")
            assert rearchived_category.status_code == 204
            assert (await call_as(client, member_id, "DELETE", f"/v1/households/{household_id}/catalog/stores/{store_id}")).status_code == 204
            assert (await call_as(client, member_id, "DELETE", f"/v1/households/{household_id}/catalog/shopping-units/{unit_id}")).status_code == 204
            categories = await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/categories")
            assert categories.json()["categories"] == []
            assert (await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/stores")).json()["stores"] == []
            assert (await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/units")).json()["shopping_units"]["household"] == []
            stale_reference = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "Pear", "item_type": "food", "category_id": category_id})
            assert stale_reference.status_code == 409
            assert stale_reference.json()["detail"]["code"] == "CATALOG_REFERENCE_ARCHIVED"
            listed = await call_as(client, member_id, "GET", f"/v1/households/{household_id}/catalog/items")
            listed_items = listed.json()["items"]
            assert [(listed_item["id"], listed_item["name"]) for listed_item in listed_items] == [
                (second_item.json()["item"]["id"], "Green Apple"),
            ]
            assert item["id"] not in {listed_item["id"] for listed_item in listed_items}
            recreated = await call_as(client, member_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "red apple", "item_type": "household"})
            assert recreated.status_code == 201
    finally:
        if household_id:
            cleanup(catalog_engine, [household_id], [uid for uid in (owner_id, member_id) if uid])


@pytest.mark.anyio
async def test_catalog_is_household_scoped_and_deleted_household_records_are_retained(catalog_engine: Engine) -> None:
    owner_id = outsider_id = removed_id = household_id = other_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"owner-{uuid4()}@example.test")
            outsider_id = insert_user(connection, f"other-{uuid4()}@example.test")
            removed_id = insert_user(connection, f"removed-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Home {uuid4()}")
            other_id = insert_household(connection, outsider_id, name=f"Other {uuid4()}")
            connection.execute(text("""
                INSERT INTO household_members (household_id, user_id, role, removed_at)
                VALUES (:household_id, :user_id, 'member', CURRENT_TIMESTAMP)
            """), {"household_id": household_id, "user_id": removed_id})
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            item_response = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "Shared", "item_type": "household"})
            assert item_response.status_code == 201
            item_id = item_response.json()["item"]["id"]
            category_response = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/categories", json={"item_type": "food", "name": "Produce"})
            assert category_response.status_code == 201
            store_response = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/stores", json={"name": "Market"})
            assert store_response.status_code == 201
            foreign_category = await call_as(client, outsider_id, "POST", f"/v1/households/{other_id}/catalog/categories", json={"item_type": "food", "name": "Other produce"})
            foreign_category_id = foreign_category.json()["category"]["id"]
            foreign_reference = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "Foreign category", "item_type": "food", "category_id": foreign_category_id})
            assert foreign_reference.status_code == 404
            for suffix in ("/catalog/items", "/catalog/categories", "/catalog/stores", "/catalog/units"):
                denied = await call_as(client, removed_id, "GET", f"/v1/households/{household_id}{suffix}")
                assert denied.status_code == 404
            removed_write = await call_as(client, removed_id, "POST", f"/v1/households/{household_id}/catalog/items", json={"name": "Removed write", "item_type": "food"})
            assert removed_write.status_code == 404
            for method, suffix, body in (
                ("GET", "/catalog/items", None),
                ("GET", "/catalog/categories", None),
                ("GET", "/catalog/stores", None),
                ("GET", "/catalog/units", None),
                ("POST", "/catalog/items", {"name": "Foreign write", "item_type": "food"}),
                ("PATCH", f"/catalog/items/{item_id}", {"name": "Changed"}),
                ("DELETE", f"/catalog/items/{item_id}", None),
            ):
                denied = await call_as(client, outsider_id, method, f"/v1/households/{household_id}{suffix}", json=body)
                assert denied.status_code == 404
            with catalog_engine.connect() as connection:
                assert connection.execute(text("SELECT name FROM catalog_items WHERE id = :id"), {"id": item_id}).scalar_one() == "Shared"

            malformed_household = await call_as(client, owner_id, "GET", "/v1/households/not-a-uuid/catalog/items")
            malformed_item = await call_as(client, owner_id, "GET", f"/v1/households/{other_id}/catalog/items/not-a-uuid")
            assert malformed_household.status_code == 422
            assert malformed_item.status_code == 422

            deleted = await call_as(client, owner_id, "DELETE", f"/v1/households/{household_id}")
            assert deleted.status_code == 204
            for method, suffix, body in (
                ("GET", "/catalog/items", None),
                ("GET", "/catalog/categories", None),
                ("GET", "/catalog/stores", None),
                ("GET", "/catalog/units", None),
                ("POST", "/catalog/items", {"name": "Blocked", "item_type": "food"}),
                ("PATCH", f"/catalog/items/{item_id}", {"name": "Blocked"}),
                ("DELETE", f"/catalog/items/{item_id}", None),
            ):
                denied = await call_as(client, owner_id, method, f"/v1/households/{household_id}{suffix}", json=body)
                assert denied.status_code == 404
            with catalog_engine.connect() as connection:
                assert connection.execute(text("SELECT name, archived_at FROM catalog_items WHERE id = :id"), {"id": item_id}).one() == ("Shared", None)
    finally:
        ids = [value for value in (household_id, other_id) if value]
        users = [value for value in (owner_id, outsider_id, removed_id) if value]
        if ids:
            cleanup(catalog_engine, ids, users)


@pytest.mark.anyio
async def test_archived_store_and_custom_unit_cannot_be_reused_from_a_stale_form(catalog_engine: Engine) -> None:
    owner_id = household_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"owner-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Stale choices {uuid4()}")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            store = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/stores", json={"name": "Old store"})
            unit = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/shopping-units", json={"name": "Bundle"})
            store_id, unit_id = store.json()["store"]["id"], unit.json()["unit"]["id"]
            assert (await call_as(client, owner_id, "DELETE", f"/v1/households/{household_id}/catalog/stores/{store_id}")).status_code == 204
            assert (await call_as(client, owner_id, "DELETE", f"/v1/households/{household_id}/catalog/shopping-units/{unit_id}")).status_code == 204
            created = await call_as(client, owner_id, "POST", f"/v1/households/{household_id}/catalog/items", json={
                "name": "Stale references", "item_type": "food", "preferred_store_id": store_id, "custom_shopping_unit_id": unit_id,
            })
            assert created.status_code == 409
            assert created.json()["detail"]["code"] == "CATALOG_REFERENCE_ARCHIVED"
            stores = await call_as(client, owner_id, "GET", f"/v1/households/{household_id}/catalog/stores")
            options = await call_as(client, owner_id, "GET", f"/v1/households/{household_id}/catalog/units")
            assert stores.json()["stores"] == []
            assert options.json()["shopping_units"]["household"] == []
    finally:
        if household_id:
            cleanup(catalog_engine, [household_id], [owner_id] if owner_id else [])


@pytest.mark.anyio
async def test_category_delete_confirms_count_moves_active_items_and_preserves_archived_history(catalog_engine: Engine) -> None:
    owner_id = household_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"category-delete-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Category deletion {uuid4()}")
            category_id = connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name, emoji)
                VALUES (:household_id, 'food', 'Produce', 'produce', '🥬') RETURNING id::text
            """), {"household_id": household_id}).scalar_one()
            active_id = connection.execute(text("""
                INSERT INTO catalog_items (household_id, item_type, category_id, name, normalized_name)
                VALUES (:household_id, 'food', :category_id, 'Apples', 'apples') RETURNING id::text
            """), {"household_id": household_id, "category_id": category_id}).scalar_one()
            archived_id = connection.execute(text("""
                INSERT INTO catalog_items (household_id, item_type, category_id, name, normalized_name, archived_at)
                VALUES (:household_id, 'food', :category_id, 'Old apples', 'old apples', CURRENT_TIMESTAMP) RETURNING id::text
            """), {"household_id": household_id, "category_id": category_id}).scalar_one()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            categories = await call_as(client, owner_id, "GET", f"/v1/households/{household_id}/catalog/categories")
            assert categories.json()["categories"][0]["active_item_count"] == 1
            stale = await call_as(client, owner_id, "DELETE", f"/v1/households/{household_id}/catalog/categories/{category_id}?expected_active_item_count=0")
            assert stale.status_code == 409
            current = await call_as(client, owner_id, "DELETE", f"/v1/households/{household_id}/catalog/categories/{category_id}?expected_active_item_count=1")
            assert current.status_code == 204
            with catalog_engine.connect() as connection:
                active_category_id = connection.execute(text("SELECT category_id::text FROM catalog_items WHERE id = :id"), {"id": active_id}).scalar_one()
                archived_category_id = connection.execute(text("SELECT category_id::text FROM catalog_items WHERE id = :id"), {"id": archived_id}).scalar_one()
                category_archived = connection.execute(text("SELECT archived_at IS NOT NULL FROM catalog_categories WHERE id = :id"), {"id": category_id}).scalar_one()
            assert active_category_id is None
            assert archived_category_id == category_id
            assert category_archived is True
    finally:
        if household_id:
            cleanup(catalog_engine, [household_id], [owner_id] if owner_id else [])


def test_catalog_migration_seeds_exact_units_and_enforces_core_constraints(catalog_engine: Engine) -> None:
    owner_id = household_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"migration-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Constraint check {uuid4()}")
            shopping_labels = set(connection.execute(text("SELECT label FROM catalog_shopping_units")).scalars())
            assert len(shopping_labels) == 26
            assert "Each" not in shopping_labels
            assert {"Unit", "Loaf", "Tub"}.issubset(shopping_labels)
            assert not {"Container", "Package"}.intersection(shopping_labels)

            category_id = connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name)
                VALUES (:household_id, 'food', 'Produce', 'produce') RETURNING id::text
            """), {"household_id": household_id}).scalar_one()
            connection.execute(text("""
                INSERT INTO catalog_items (household_id, item_type, category_id, name, normalized_name)
                VALUES (:household_id, 'food', :category_id, 'Apple', 'apple')
            """), {"household_id": household_id, "category_id": category_id})

            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("""
                    INSERT INTO catalog_categories (household_id, item_type, name, normalized_name)
                    VALUES (:household_id, 'food', ' Produce ', 'produce')
                """), {"household_id": household_id})
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("""
                    INSERT INTO catalog_items (household_id, item_type, name, normalized_name)
                    VALUES (:household_id, 'household', ' apple ', 'apple')
                """), {"household_id": household_id})
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("""
                    INSERT INTO catalog_items (household_id, item_type, category_id, name, normalized_name)
                    VALUES (:household_id, 'household', :category_id, 'Dish soap', 'dish soap')
                """), {"household_id": household_id, "category_id": category_id})
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("""
                    INSERT INTO catalog_items (household_id, item_type, name, normalized_name)
                    VALUES (:household_id, 'food', 'Mismatched name', 'different')
                """), {"household_id": household_id})
    finally:
        if household_id:
            cleanup(catalog_engine, [household_id], [owner_id] if owner_id else [])


def test_starter_category_backfill_is_active_only_idempotent_and_respects_archived_matches(catalog_engine: Engine) -> None:
    owner_id = household_id = deleted_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"seed-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Seed backfill {uuid4()}")
            deleted_id = insert_household(connection, owner_id, name=f"Deleted seed {uuid4()}")
            connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": deleted_id})
            archived = connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name, archived_at)
                VALUES (:household_id, 'food', 'Produce', 'produce', CURRENT_TIMESTAMP)
                RETURNING id::text
            """), {"household_id": household_id}).scalar_one()
            connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name)
                VALUES (:household_id, 'household', 'Custom room', 'custom room')
            """), {"household_id": deleted_id})
            before_deleted = connection.execute(text("""
                SELECT item_type, name, normalized_name, archived_at
                FROM catalog_categories WHERE household_id = :household_id ORDER BY item_type, name
            """), {"household_id": deleted_id}).all()

            assert catalog_migration.seed_active_household_categories(connection, household_id) is True
            assert catalog_migration.seed_active_household_categories(connection, household_id) is False
            assert catalog_migration.seed_active_household_categories(connection, deleted_id) is False

            categories = connection.execute(text("""
                SELECT item_type, name, archived_at FROM catalog_categories
                WHERE household_id = :household_id ORDER BY item_type, name
            """), {"household_id": household_id}).all()
            assert len(categories) == 10
            assert next(row for row in categories if row.name == "Produce").archived_at is not None
            assert sum(row.name == "Produce" for row in categories) == 1
            after_deleted = connection.execute(text("""
                SELECT item_type, name, normalized_name, archived_at
                FROM catalog_categories WHERE household_id = :household_id ORDER BY item_type, name
            """), {"household_id": deleted_id}).all()
            assert after_deleted == before_deleted
            assert connection.execute(text("""
                SELECT 1 FROM catalog_household_seed_sets WHERE household_id = :household_id
            """), {"household_id": deleted_id}).scalar_one_or_none() is None

            connection.execute(text("""
                UPDATE catalog_categories SET name = 'Fresh Produce', normalized_name = 'fresh produce'
                WHERE household_id = :household_id AND item_type = 'food' AND name = 'Bakery'
            """), {"household_id": household_id})
            connection.execute(text("""
                UPDATE catalog_categories SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE household_id = :household_id AND item_type = 'food' AND name = 'Frozen'
            """), {"household_id": household_id})
            assert catalog_migration.seed_active_household_categories(connection, household_id) is False
            active_food_names = connection.execute(text("""
                SELECT name FROM catalog_categories WHERE household_id = :household_id AND item_type = 'food'
            """), {"household_id": household_id}).scalars().all()
            assert set(active_food_names) == {"Produce", "Dairy & Eggs", "Meat & Seafood", "Fresh Produce", "Pantry Staples", "Frozen", "Beverages"}
            assert connection.execute(text("""
                SELECT archived_at IS NOT NULL FROM catalog_categories
                WHERE household_id = :household_id AND name = 'Frozen'
            """), {"household_id": household_id}).scalar_one()
            assert archived
    finally:
        if household_id or deleted_id:
            cleanup(catalog_engine, [value for value in (household_id, deleted_id) if value], [owner_id] if owner_id else [])


def test_new_household_creation_seeds_the_starter_categories_transactionally(catalog_engine: Engine) -> None:
    owner_id = household_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"new-household-{uuid4()}@example.test")
        result = create_household(CurrentUser(owner_id, f"{owner_id}@example.test", "Catalog Owner"), f"New home {uuid4()}", "America/Phoenix", catalog_engine)
        household_id = result["id"]
        with catalog_engine.connect() as connection:
            categories = connection.execute(text("""
                SELECT item_type, name, emoji FROM catalog_categories WHERE household_id = :household_id ORDER BY item_type, name
            """), {"household_id": household_id}).all()
            ledger = connection.execute(text("""
                SELECT seed_set FROM catalog_household_seed_sets WHERE household_id = :household_id
            """), {"household_id": household_id}).scalar_one()
            member_role = connection.execute(text("""
                SELECT role FROM household_members WHERE household_id = :household_id AND user_id = :user_id AND removed_at IS NULL
            """), {"household_id": household_id, "user_id": owner_id}).scalar_one()
        assert result["role"] == member_role == "owner"
        assert ledger == "starter_categories_v1"
        assert {(row.item_type, row.name, row.emoji) for row in categories} == set(STARTER_CATALOG_CATEGORIES)
    finally:
        if household_id:
            cleanup(catalog_engine, [household_id], [owner_id] if owner_id else [])
        elif owner_id:
            with catalog_engine.begin() as connection:
                connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})


def test_pantry_rename_and_emoji_backfill_preserve_custom_archived_and_deleted_rows(catalog_engine: Engine) -> None:
    owner_id = household_id = conflict_id = deleted_id = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"category-backfill-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Pantry rename {uuid4()}")
            conflict_id = insert_household(connection, owner_id, name=f"Pantry conflict {uuid4()}")
            deleted_id = insert_household(connection, owner_id, name=f"Deleted categories {uuid4()}")
            connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": deleted_id})

            starter_pantry = connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name)
                VALUES (:household_id, 'food', 'Pantry Staples', 'pantry staples') RETURNING id::text
            """), {"household_id": household_id}).scalar_one()
            custom_emoji = connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name, emoji)
                VALUES (:household_id, 'food', 'Produce', 'produce', '🌱') RETURNING id::text
            """), {"household_id": household_id}).scalar_one()

            connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name)
                VALUES (:household_id, 'food', 'Pantry Staples', 'pantry staples')
            """), {"household_id": conflict_id})
            connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name)
                VALUES (:household_id, 'food', 'Pantry', 'pantry')
            """), {"household_id": conflict_id})
            archived_pantry = connection.execute(text("""
                INSERT INTO catalog_categories (household_id, item_type, name, normalized_name, archived_at)
                VALUES (:household_id, 'food', 'Pantry Staples', 'pantry staples', CURRENT_TIMESTAMP) RETURNING id::text
            """), {"household_id": deleted_id}).scalar_one()
            before_deleted = connection.execute(text("""
                SELECT name, normalized_name, emoji, archived_at FROM catalog_categories WHERE id = :id
            """), {"id": archived_pantry}).one()

            assert emoji_migration.update_active_household_categories(connection, household_id) is True
            assert emoji_migration.update_active_household_categories(connection, conflict_id) is True
            assert emoji_migration.update_active_household_categories(connection, deleted_id) is False
            assert emoji_migration.update_active_household_categories(connection, household_id) is True

            renamed = connection.execute(text("SELECT name, normalized_name, emoji FROM catalog_categories WHERE id = :id"), {"id": starter_pantry}).one()
            assert tuple(renamed) == ("Pantry", "pantry", "🫙")
            assert connection.execute(text("SELECT emoji FROM catalog_categories WHERE id = :id"), {"id": custom_emoji}).scalar_one() == "🌱"
            conflict_names = set(connection.execute(text("""
                SELECT name FROM catalog_categories WHERE household_id = :household_id AND archived_at IS NULL
            """), {"household_id": conflict_id}).scalars())
            assert {"Pantry Staples", "Pantry"}.issubset(conflict_names)
            after_deleted = connection.execute(text("""
                SELECT name, normalized_name, emoji, archived_at FROM catalog_categories WHERE id = :id
            """), {"id": archived_pantry}).one()
            assert after_deleted == before_deleted
    finally:
        ids = [value for value in (household_id, conflict_id, deleted_id) if value]
        if ids:
            cleanup(catalog_engine, ids, [owner_id] if owner_id else [])


def _wait_for_lock_wait(engine: Engine, application_name: str) -> None:
    deadline = monotonic() + 10
    while monotonic() < deadline:
        with engine.connect() as connection:
            waiting = connection.execute(text("""
                SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                    WHERE application_name = :application_name AND wait_event_type = 'Lock')
            """), {"application_name": application_name}).scalar_one()
        if waiting:
            return
        sleep(0.02)
    raise AssertionError(f"PostgreSQL session {application_name} did not block on the household row lock")


@pytest.mark.parametrize("seed_first", [True, False], ids=["seed-then-archive", "archive-then-seed"])
def test_starter_backfill_serializes_with_household_archive(catalog_engine: Engine, seed_first: bool) -> None:
    owner_id = household_id = None
    suffix = uuid4().hex[:8]
    seed_app = f"catalog_seed_{suffix}"
    archive_app = f"catalog_archive_{suffix}"
    seed_engine = create_engine(catalog_engine.url, pool_size=1, max_overflow=0, connect_args={"application_name": seed_app})
    archive_engine = create_engine(catalog_engine.url, pool_size=1, max_overflow=0, connect_args={"application_name": archive_app})
    archive_update_reached = Event()
    release_archive = Event()
    archive_hook = None
    try:
        with catalog_engine.begin() as connection:
            owner_id = insert_user(connection, f"race-{uuid4()}@example.test")
            household_id = insert_household(connection, owner_id, name=f"Seed race {uuid4()}")

        if seed_first:
            with seed_engine.connect() as connection:
                transaction = connection.begin()
                assert catalog_migration.seed_active_household_categories(connection, household_id)
                with ThreadPoolExecutor(max_workers=1) as pool:
                    archive_future = pool.submit(delete_household, CurrentUser(owner_id, f"{owner_id}@example.test", "Owner"), household_id, archive_engine)
                    _wait_for_lock_wait(catalog_engine, archive_app)
                    transaction.commit()
                    archive_future.result(timeout=10)
        else:
            def pause_after_archive(_conn, _cursor, statement, _parameters, _context, _executemany):
                if "UPDATE households SET deleted_at" in statement:
                    archive_update_reached.set()
                    if not release_archive.wait(10):
                        raise AssertionError("Timed out waiting to release the household archive")

            archive_hook = pause_after_archive
            event.listen(archive_engine, "after_cursor_execute", archive_hook)
            with ThreadPoolExecutor(max_workers=2) as pool:
                archive_future = pool.submit(delete_household, CurrentUser(owner_id, f"{owner_id}@example.test", "Owner"), household_id, archive_engine)
                assert archive_update_reached.wait(10), "Archive did not reach its household update"
                seed_future = pool.submit(lambda: _seed_in_transaction(seed_engine, household_id))
                _wait_for_lock_wait(catalog_engine, seed_app)
                release_archive.set()
                archive_future.result(timeout=10)
                assert seed_future.result(timeout=10) is False

        with catalog_engine.connect() as connection:
            deleted_at = connection.execute(text("SELECT deleted_at FROM households WHERE id = :id"), {"id": household_id}).scalar_one()
            count = connection.execute(text("SELECT count(*) FROM catalog_categories WHERE household_id = :id"), {"id": household_id}).scalar_one()
            ledger = connection.execute(text("SELECT 1 FROM catalog_household_seed_sets WHERE household_id = :id"), {"id": household_id}).scalar_one_or_none()
        assert deleted_at is not None
        if seed_first:
            assert count == 10
            assert ledger is not None
        else:
            assert count == 0
            assert ledger is None
    finally:
        release_archive.set()
        if archive_hook is not None:
            event.remove(archive_engine, "after_cursor_execute", archive_hook)
        seed_engine.dispose()
        archive_engine.dispose()
        if household_id:
            cleanup(catalog_engine, [household_id], [owner_id] if owner_id else [])


def _seed_in_transaction(engine: Engine, household_id: str) -> bool:
    with engine.begin() as connection:
        return catalog_migration.seed_active_household_categories(connection, household_id)
