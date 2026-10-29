import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier, Event
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from meal_planner_api import shopping_lists
from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user
from meal_planner_api.shopping_lists import add_item, clear_purchased_items, update_item

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture
def disposable_engine() -> Generator[Engine]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is not configured.")
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail("Shopping-list integration tests require the explicitly named disposable PostgreSQL database.")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            if connection.execute(text("SELECT current_database()")).scalar_one() != DISPOSABLE_TEST_DATABASE:
                pytest.fail("The connected database is not meal_planner_disposable_test.")
        yield engine
    finally:
        engine.dispose()


def insert_user(connection, email: str) -> str:
    return connection.execute(
        text(
            """INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
            VALUES ('test', :subject, :email, 'Test User') RETURNING id::text"""
        ),
        {"subject": str(uuid4()), "email": email},
    ).scalar_one()


def insert_household(connection, owner_id: str) -> tuple[str, str]:
    household_id = connection.execute(
        text(
            """INSERT INTO households (name, time_zone, created_by_user_id)
            VALUES (:name, 'America/Phoenix', :owner_id) RETURNING id::text"""
        ),
        {"name": f"Household {uuid4()}", "owner_id": owner_id},
    ).scalar_one()
    connection.execute(
        text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'owner')"),
        {"household_id": household_id, "user_id": owner_id},
    )
    list_id = connection.execute(
        text("INSERT INTO shopping_lists (household_id) VALUES (:household_id) RETURNING id::text"),
        {"household_id": household_id},
    ).scalar_one()
    return household_id, list_id


def insert_item(connection, list_id: str, creator_id: str, name: str) -> str:
    catalog_id = connection.execute(text("""
        INSERT INTO catalog_items (household_id, item_type, name, normalized_name, created_by_user_id)
        SELECT household_id, 'food', :name, lower(btrim(regexp_replace(:name, '[[:space:]]+', ' ', 'g'))), :creator_id
        FROM shopping_lists WHERE id=:list_id RETURNING id::text
    """), {"list_id": list_id, "name": name, "creator_id": creator_id}).scalar_one()
    return connection.execute(
        text(
            """INSERT INTO shopping_list_items (household_id, shopping_list_id, name, catalog_item_id, created_by_user_id)
            SELECT household_id, id, :name, :catalog_id, :creator_id FROM shopping_lists WHERE id=:list_id RETURNING id::text"""
        ),
        {"list_id": list_id, "name": name, "catalog_id": catalog_id, "creator_id": creator_id},
    ).scalar_one()


def insert_catalog_item(connection, household_id: str, creator_id: str, name: str) -> str:
    return connection.execute(text("""
        INSERT INTO catalog_items (household_id, item_type, name, normalized_name, created_by_user_id)
        VALUES (:household_id, 'food', :name, lower(btrim(regexp_replace(:name, '[[:space:]]+', ' ', 'g'))), :creator_id)
        RETURNING id::text
    """), {"household_id": household_id, "creator_id": creator_id, "name": name}).scalar_one()


def item_snapshot(connection, item_id: str) -> tuple:
    return connection.execute(
        text(
            """SELECT id::text, shopping_list_id::text, name, is_checked, checked_at,
                      checked_by_user_id::text, created_by_user_id::text, created_at, updated_at
            FROM shopping_list_items WHERE id = :item_id"""
        ),
        {"item_id": item_id},
    ).one()


async def call_as(user_id: str, email: str, client: AsyncClient, method: str, url: str, **kwargs):
    app.dependency_overrides[require_current_user] = lambda: CurrentUser(user_id, email, "Test User")
    return await client.request(method, url, **kwargs)


@pytest.mark.anyio
async def test_active_owners_and_members_can_read_add_toggle_and_remove(
    disposable_engine: Engine,
) -> None:
    with disposable_engine.begin() as connection:
        owner_id = insert_user(connection, f"owner-{uuid4()}@example.test")
        member_id = insert_user(connection, f"member-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, owner_id)
        connection.execute(
            text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
            {"household_id": household_id, "user_id": member_id},
        )
        owner_catalog_id = insert_catalog_item(connection, household_id, owner_id, "Owner oats")
        member_catalog_id = insert_catalog_item(connection, household_id, member_id, "Member oats")

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            for user_id, email, catalog_id in ((owner_id, "owner@example.test", owner_catalog_id), (member_id, "member@example.test", member_catalog_id)):
                loaded = await call_as(user_id, email, client, "GET", f"/v1/households/{household_id}/shopping-list")
                assert loaded.status_code == 200
                assert loaded.json()["shopping_list"]["items"] == []

                created = await call_as(
                    user_id, email, client, "POST", f"/v1/households/{household_id}/shopping-list/items",
                    json={"catalog_item_id": catalog_id},
                )
                assert created.status_code == 201
                item_id = created.json()["item"]["id"]
                with disposable_engine.begin() as connection:
                    connection.execute(
                        text("UPDATE shopping_list_items SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00' WHERE id = :id"),
                        {"id": item_id},
                    )

                checked = await call_as(
                    user_id, email, client, "PATCH",
                    f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                    json={"is_checked": True},
                )
                assert checked.status_code == 200
                assert checked.json()["item"]["is_checked"] is True
                assert checked.json()["item"]["checked_by_user_id"] == user_id
                with disposable_engine.connect() as connection:
                    assert connection.execute(
                        text("SELECT updated_at FROM shopping_list_items WHERE id = :id"), {"id": item_id}
                    ).scalar_one() > datetime(2000, 1, 1, tzinfo=UTC)

                unchecked = await call_as(
                    user_id, email, client, "PATCH",
                    f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                    json={"is_checked": False},
                )
                assert unchecked.status_code == 200
                assert unchecked.json()["item"]["is_checked"] is False
                assert unchecked.json()["item"]["checked_at"] is None
                assert unchecked.json()["item"]["checked_by_user_id"] is None

                removed = await call_as(
                    user_id, email, client, "DELETE",
                    f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                )
                assert removed.status_code == 204
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:owner, :member)"), {"owner": owner_id, "member": member_id})


@pytest.mark.anyio
async def test_get_item_contract_exposes_id_used_to_toggle_and_remove(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"list-contract-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)
        catalog_id = insert_catalog_item(connection, household_id, user_id, "Oat milk")

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            created = await call_as(
                user_id,
                "list-contract@example.test",
                client,
                "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": catalog_id},
            )
            assert created.status_code == 201

            loaded = await call_as(
                user_id,
                "list-contract@example.test",
                client,
                "GET",
                f"/v1/households/{household_id}/shopping-list",
            )
            assert loaded.status_code == 200
            item = loaded.json()["shopping_list"]["items"][0]
            item_id = item["id"]
            assert item["id"] == created.json()["item"]["id"]
            assert item["name"] == "Oat milk"
            assert item["catalog_item_id"] == catalog_id
            assert item["catalog_item_type"] == "food"
            assert item["is_checked"] is False
            assert item["amount"] is None
            assert item["unit_label"] is None
            assert item["store_id"] is None
            assert item["meal_plan_source"] is False
            assert isinstance(item["created_at"], str)

            checked = await call_as(
                user_id,
                "list-contract@example.test",
                client,
                "PATCH",
                f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                json={"is_checked": True},
            )
            assert checked.status_code == 200
            assert checked.json()["item"]["id"] == item_id
            assert checked.json()["item"]["is_checked"] is True

            removed = await call_as(
                user_id,
                "list-contract@example.test",
                client,
                "DELETE",
                f"/v1/households/{household_id}/shopping-list/items/{item_id}",
            )
            assert removed.status_code == 204
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})


@pytest.mark.anyio
@pytest.mark.parametrize("unit_mode", ["built_in", "household", "recipe", "none"])
async def test_catalog_identity_duplicate_details_update_and_clear_contract(disposable_engine: Engine, unit_mode: str) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"list-details-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)
        catalog_id = insert_catalog_item(connection, household_id, user_id, "Apples")
        custom_unit_id = connection.execute(text("""
            INSERT INTO household_shopping_units (household_id, name, normalized_name)
            VALUES (:household_id, 'Crate', 'crate') RETURNING id::text
        """), {"household_id": household_id}).scalar_one()
        store_id = connection.execute(text("""
            INSERT INTO catalog_stores (household_id, name, normalized_name)
            VALUES (:household_id, 'Market', 'market') RETURNING id::text
        """), {"household_id": household_id}).scalar_one()
        connection.execute(text("""
            UPDATE catalog_items SET shopping_unit_code='gallon', preferred_store_id=:store_id
            WHERE id=:catalog_id
        """), {"store_id": store_id, "catalog_id": catalog_id})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            created = await call_as(
                user_id, "list-details@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": catalog_id, "amount": "2.0"},
            )
            assert created.status_code == 201, created.text
            item_id = created.json()["item"]["id"]

            duplicate = await call_as(
                user_id, "list-details@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": catalog_id},
            )
            assert duplicate.status_code == 409
            assert duplicate.json()["detail"]["code"] == "SHOPPING_ITEM_ALREADY_EXISTS"

            details = await call_as(
                user_id, "list-details@example.test", client, "GET",
                f"/v1/households/{household_id}/shopping-list/items/{item_id}",
            )
            assert details.status_code == 200, details.text
            assert details.json()["item"]["id"] == item_id
            assert details.json()["item"]["catalog_item_id"] == catalog_id
            assert details.json()["item"]["amount"] == "2"
            assert details.json()["item"]["unit_kind"] == "built_in"
            assert details.json()["item"]["unit_label"] == "Gallon"
            assert details.json()["item"]["store_id"] == store_id
            assert details.json()["item"]["store_name"] == "Market"
            assert details.json()["item"]["used_in_meals"] == []

            updated = await call_as(
                user_id, "list-details@example.test", client, "PATCH",
                f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                json={"amount": "1/2"},
            )
            assert updated.status_code == 200, updated.text
            assert updated.json()["item"]["amount"] == "0.5"

            # Model existing shopping entries with every supported unit source,
            # including a recipe-derived entry and a blank amount. Re-adding
            # must retain these choices even when Catalog defaults change.
            with disposable_engine.begin() as connection:
                connection.execute(text("""
                    UPDATE shopping_list_items SET
                        amount=:amount, shopping_unit_code=:built_in,
                        custom_shopping_unit_id=:custom, recipe_unit_code=:recipe,
                        recipe_unit_dimension=:dimension
                    WHERE id=:id
                """), {
                    "id": item_id, "amount": None if unit_mode == "none" else "0.5",
                    "built_in": "gallon" if unit_mode == "built_in" else None,
                    "custom": custom_unit_id if unit_mode == "household" else None,
                    "recipe": "tablespoon" if unit_mode == "recipe" else None,
                    "dimension": "volume" if unit_mode == "recipe" else None,
                })
                connection.execute(text("""
                    UPDATE catalog_items SET shopping_unit_code='bag', preferred_store_id=NULL WHERE id=:id
                """), {"id": catalog_id})
            checked = await call_as(
                user_id, "list-details@example.test", client, "PATCH",
                f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                json={"is_checked": True},
            )
            assert checked.status_code == 200, checked.text
            before = checked.json()["item"]
            assert before["is_checked"] is True
            assert before["checked_at"] is not None
            assert before["checked_by_user_id"] == user_id
            assert before["unit_kind"] == (None if unit_mode == "none" else unit_mode)

            for _ in range(2):  # Repeating Add is idempotent; never a toggle.
                readded = await call_as(
                    user_id, "list-details@example.test", client, "PATCH",
                    f"/v1/households/{household_id}/shopping-list/items/{item_id}",
                    json={"is_checked": False},
                )
                assert readded.status_code == 200, readded.text
                after = readded.json()["item"]
                assert after["is_checked"] is False
                assert after["checked_at"] is None
                assert after["checked_by_user_id"] is None
                for field in ("id", "catalog_item_id", "amount", "shopping_unit_code",
                              "custom_shopping_unit_id", "recipe_unit_code", "recipe_unit_dimension",
                              "unit_kind", "unit_label", "store_id", "store_name", "created_at"):
                    assert after[field] == before[field], field
                assert after["store_id"] == store_id

            cleared = await call_as(
                user_id, "list-details@example.test", client, "DELETE",
                f"/v1/households/{household_id}/shopping-list",
            )
            assert cleared.status_code == 200
            assert cleared.json() == {"removed_count": 1}
            loaded = await call_as(
                user_id, "list-details@example.test", client, "GET",
                f"/v1/households/{household_id}/shopping-list",
            )
            assert loaded.status_code == 200
            assert loaded.json()["shopping_list"]["items"] == []
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_shopping_units WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_stores WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})


@pytest.mark.anyio
async def test_add_rejects_archived_catalog_preferences_until_an_active_choice_is_submitted(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"stale-preference-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)
        unit_id = connection.execute(text("""
            INSERT INTO household_shopping_units (household_id, name, normalized_name)
            VALUES (:household_id, 'Crate', 'crate') RETURNING id::text
        """), {"household_id": household_id}).scalar_one()
        store_id = connection.execute(text("""
            INSERT INTO catalog_stores (household_id, name, normalized_name)
            VALUES (:household_id, 'Market', 'market') RETURNING id::text
        """), {"household_id": household_id}).scalar_one()
        unit_catalog_id = insert_catalog_item(connection, household_id, user_id, "Apples")
        store_catalog_id = insert_catalog_item(connection, household_id, user_id, "Bread")
        unit_replacement_catalog_id = insert_catalog_item(connection, household_id, user_id, "Cereal")
        unit_override_catalog_id = insert_catalog_item(connection, household_id, user_id, "Carrots")
        store_override_catalog_id = insert_catalog_item(connection, household_id, user_id, "Dates")
        independent_override_catalog_id = insert_catalog_item(connection, household_id, user_id, "Eggs")
        connection.execute(text("UPDATE catalog_items SET custom_shopping_unit_id=:unit WHERE id=:id"), {"unit": unit_id, "id": unit_catalog_id})
        connection.execute(text("UPDATE catalog_items SET preferred_store_id=:store WHERE id=:id"), {"store": store_id, "id": store_catalog_id})
        connection.execute(text("UPDATE catalog_items SET custom_shopping_unit_id=:unit WHERE id=:id"), {"unit": unit_id, "id": unit_replacement_catalog_id})
        connection.execute(text("UPDATE catalog_items SET custom_shopping_unit_id=:unit WHERE id=:id"), {"unit": unit_id, "id": unit_override_catalog_id})
        connection.execute(text("UPDATE catalog_items SET preferred_store_id=:store WHERE id=:id"), {"store": store_id, "id": store_override_catalog_id})
        connection.execute(text("UPDATE catalog_items SET custom_shopping_unit_id=:unit, preferred_store_id=:store WHERE id=:id"),
                           {"unit": unit_id, "store": store_id, "id": independent_override_catalog_id})
        active_store_id = connection.execute(text("""
            INSERT INTO catalog_stores (household_id, name, normalized_name)
            VALUES (:household_id, 'Corner Market', 'corner market') RETURNING id::text
        """), {"household_id": household_id}).scalar_one()
        # Model an archive racing with a previously saved Catalog preference.
        # Catalog management normally prevents archiving a choice while an
        # active Catalog item references it.
        connection.execute(text("UPDATE household_shopping_units SET archived_at=CURRENT_TIMESTAMP WHERE id=:id"), {"id": unit_id})
        connection.execute(text("UPDATE catalog_stores SET archived_at=CURRENT_TIMESTAMP WHERE id=:id"), {"id": store_id})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            for catalog_id in (unit_catalog_id, store_catalog_id):
                stale = await call_as(
                    user_id, "stale-preference@example.test", client, "POST",
                    f"/v1/households/{household_id}/shopping-list/items",
                    json={"catalog_item_id": catalog_id},
                )
                assert stale.status_code == 409, stale.text
                assert stale.json()["detail"]["code"] == "CATALOG_PREFERENCE_ARCHIVED"
                assert "saved Catalog" in stale.json()["detail"]["message"]
                assert "no longer active" in stale.json()["detail"]["message"]

                added = await call_as(
                    user_id, "stale-preference@example.test", client, "POST",
                    f"/v1/households/{household_id}/shopping-list/items",
                    json={
                        "catalog_item_id": catalog_id,
                        "shopping_unit_code": None,
                        "custom_shopping_unit_id": None,
                        "store_id": None,
                    },
                )
                assert added.status_code == 201, added.text
                assert added.json()["item"]["unit_label"] is None
                assert added.json()["item"]["store_id"] is None

            # Overriding one inherited preference does not implicitly clear or
            # validate only that field: the other resolved default is checked
            # independently and still blocks the add when it is archived.
            stale_store_with_unit_override = await call_as(
                user_id, "stale-preference@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": store_override_catalog_id, "shopping_unit_code": "bag"},
            )
            assert stale_store_with_unit_override.status_code == 409
            assert stale_store_with_unit_override.json()["detail"]["code"] == "CATALOG_PREFERENCE_ARCHIVED"
            assert "saved Catalog store" in stale_store_with_unit_override.json()["detail"]["message"]

            unit_replaced = await call_as(
                user_id, "stale-preference@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": unit_replacement_catalog_id, "shopping_unit_code": "bag"},
            )
            assert unit_replaced.status_code == 201, unit_replaced.text
            assert unit_replaced.json()["item"]["unit_label"] == "Bag"
            assert unit_replaced.json()["item"]["store_id"] is None

            stale_unit_with_store_override = await call_as(
                user_id, "stale-preference@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": unit_override_catalog_id, "store_id": active_store_id},
            )
            assert stale_unit_with_store_override.status_code == 409
            assert stale_unit_with_store_override.json()["detail"]["code"] == "CATALOG_PREFERENCE_ARCHIVED"
            assert "saved Catalog unit" in stale_unit_with_store_override.json()["detail"]["message"]

            # Explicitly replacing both archived defaults succeeds; replacing
            # only the store leaves the archived unit as the effective unit.
            replaced = await call_as(
                user_id, "stale-preference@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={
                    "catalog_item_id": independent_override_catalog_id,
                    "shopping_unit_code": "bag",
                    "store_id": active_store_id,
                },
            )
            assert replaced.status_code == 201, replaced.text
            assert replaced.json()["item"]["unit_label"] == "Bag"
            assert replaced.json()["item"]["store_id"] == active_store_id

            store_replaced = await call_as(
                user_id, "stale-preference@example.test", client, "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"catalog_item_id": store_override_catalog_id, "store_id": active_store_id},
            )
            assert store_replaced.status_code == 201, store_replaced.text
            assert store_replaced.json()["item"]["unit_label"] is None
            assert store_replaced.json()["item"]["store_id"] == active_store_id
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_shopping_units WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_stores WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})


def test_concurrent_adds_of_one_catalog_item_create_exactly_one_list_row(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"concurrent-list-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)
        catalog_id = insert_catalog_item(connection, household_id, user_id, "Concurrent oats")
    barrier = Barrier(2)

    def add_once():
        barrier.wait()
        try:
            return add_item(CurrentUser(user_id, "concurrent-list@example.test", "Test User"), household_id, catalog_id, {}, disposable_engine)
        except HTTPException as error:
            return error

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: add_once(), range(2)))
        assert sum(isinstance(result, dict) for result in results) == 1
        errors = [result for result in results if isinstance(result, HTTPException)]
        assert len(errors) == 1
        assert errors[0].status_code == 409
        with disposable_engine.connect() as connection:
            assert connection.execute(
                text("SELECT count(*) FROM shopping_list_items WHERE household_id=:household_id AND catalog_item_id=:catalog_id"),
                {"household_id": household_id, "catalog_id": catalog_id},
            ).scalar_one() == 1
    finally:
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id=:id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id=:id"), {"id": user_id})


@pytest.mark.anyio
async def test_archived_catalog_row_remains_readable_and_removable_but_cannot_be_added_again(
    disposable_engine: Engine,
) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"archived-list-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)
        catalog_id = insert_catalog_item(connection, household_id, user_id, "Archived lentils")

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            created = await call_as(user_id, "archived-list@example.test", client, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"catalog_item_id": catalog_id})
            assert created.status_code == 201, created.text
            item_id = created.json()["item"]["id"]
            archived = await call_as(user_id, "archived-list@example.test", client, "DELETE", f"/v1/households/{household_id}/catalog/items/{catalog_id}")
            assert archived.status_code == 204

            listed = await call_as(user_id, "archived-list@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list")
            assert listed.status_code == 200
            assert listed.json()["shopping_list"]["items"][0]["catalog_item_archived"] is True
            details = await call_as(user_id, "archived-list@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list/items/{item_id}")
            assert details.status_code == 200
            rejected_add = await call_as(user_id, "archived-list@example.test", client, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"catalog_item_id": catalog_id})
            assert rejected_add.status_code == 404
            removed = await call_as(user_id, "archived-list@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{item_id}")
            assert removed.status_code == 204
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id=:id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id=:id"), {"id": user_id})


@pytest.mark.anyio
async def test_cross_household_reads_and_mutations_leave_existing_target_unchanged(
    disposable_engine: Engine,
) -> None:
    with disposable_engine.begin() as connection:
        household_owner_id = insert_user(connection, f"household-owner-{uuid4()}@example.test")
        member_id = insert_user(connection, f"member-{uuid4()}@example.test")
        other_owner_id = insert_user(connection, f"other-{uuid4()}@example.test")
        household_id, own_list_id = insert_household(connection, household_owner_id)
        other_household_id, other_list_id = insert_household(connection, other_owner_id)
        target_item_id = insert_item(connection, other_list_id, other_owner_id, "Protected target")
        connection.execute(
            text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
            {"household_id": household_id, "user_id": member_id},
        )
        before = item_snapshot(connection, target_item_id)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            assert (await call_as(member_id, "member@example.test", client, "GET", f"/v1/households/{other_household_id}/shopping-list")).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "GET", f"/v1/households/{other_household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "POST", f"/v1/households/{other_household_id}/shopping-list/items", json={"catalog_item_id": str(uuid4())})).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "PATCH", f"/v1/households/{other_household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "DELETE", f"/v1/households/{other_household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "DELETE", f"/v1/households/{other_household_id}/shopping-list")).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "DELETE", f"/v1/households/{other_household_id}/shopping-list/purchased-items")).status_code == 404

            # Even supplying the attacker's own household ID with a known foreign
            # item ID must not update or delete the foreign row.
            assert (await call_as(member_id, "member@example.test", client, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404

        with disposable_engine.connect() as connection:
            assert item_snapshot(connection, target_item_id) == before
            assert connection.execute(
                text("SELECT count(*) FROM shopping_list_items WHERE shopping_list_id = :list_id"),
                {"list_id": other_list_id},
            ).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id IN (:a, :b)"), {"a": own_list_id, "b": other_list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM households WHERE id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(
                text("DELETE FROM users WHERE id IN (:a, :b, :c)"),
                {"a": household_owner_id, "b": member_id, "c": other_owner_id},
            )


@pytest.mark.anyio
async def test_removed_members_cannot_read_or_write_and_target_rows_stay_unchanged(
    disposable_engine: Engine,
) -> None:
    with disposable_engine.begin() as connection:
        owner_id = insert_user(connection, f"owner-{uuid4()}@example.test")
        former_member_id = insert_user(connection, f"former-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, owner_id)
        connection.execute(
            text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
            {"household_id": household_id, "user_id": former_member_id},
        )
        target_item_id = insert_item(connection, list_id, owner_id, "Keep after denial")
        connection.execute(
            text("UPDATE household_members SET removed_at = CURRENT_TIMESTAMP WHERE household_id = :household_id AND user_id = :user_id"),
            {"household_id": household_id, "user_id": former_member_id},
        )
        before = item_snapshot(connection, target_item_id)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            assert (await call_as(former_member_id, "former@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list")).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"catalog_item_id": str(uuid4())})).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list")).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/purchased-items")).status_code == 404
        with disposable_engine.connect() as connection:
            assert item_snapshot(connection, target_item_id) == before
            assert connection.execute(text("SELECT count(*) FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id}).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:a, :b)"), {"a": owner_id, "b": former_member_id})


@pytest.mark.anyio
async def test_soft_deleted_household_cannot_be_read_or_written_and_rows_stay_unchanged(
    disposable_engine: Engine,
) -> None:
    with disposable_engine.begin() as connection:
        owner_id = insert_user(connection, f"owner-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, owner_id)
        target_item_id = insert_item(connection, list_id, owner_id, "Keep in deleted household")
        connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": household_id})
        before = item_snapshot(connection, target_item_id)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            assert (await call_as(owner_id, "owner@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list")).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "GET", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"catalog_item_id": str(uuid4())})).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list")).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/purchased-items")).status_code == 404
        with disposable_engine.connect() as connection:
            assert item_snapshot(connection, target_item_id) == before
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})


@pytest.mark.anyio
@pytest.mark.parametrize("role", ["owner", "member"])
@pytest.mark.parametrize("states", [(False, True, True), (False, False), (True, True), ()], ids=["mixed", "needed", "purchased", "empty"])
async def test_clear_purchased_is_conditional_idempotent_and_preserves_sources(disposable_engine, role, states):
    with disposable_engine.begin() as connection:
        owner = insert_user(connection, f"clear-owner-{uuid4()}@example.test")
        member = insert_user(connection, f"clear-member-{uuid4()}@example.test")
        household, list_id = insert_household(connection, owner)
        foreign_household, foreign_list = insert_household(connection, owner)
        foreign_row = insert_item(connection, foreign_list, owner, "Other household")
        connection.execute(text("UPDATE shopping_list_items SET is_checked=true, checked_at=CURRENT_TIMESTAMP, checked_by_user_id=:owner WHERE id=:id"), {"owner": owner, "id": foreign_row})
        foreign_before = item_snapshot(connection, foreign_row)
        connection.execute(text("INSERT INTO household_members (household_id,user_id,role) VALUES (:hh,:user,'member')"), {"hh": household, "user": member})
        stores = [connection.execute(text("INSERT INTO catalog_stores (household_id,name,normalized_name) VALUES (:hh,:name,:name) RETURNING id::text"), {"hh": household, "name": name}).scalar_one() for name in ("market", "warehouse")]
        rows = []
        removed = []
        needed = []
        for position, checked in enumerate(states):
            row = insert_item(connection, list_id, owner, f"Clear test {position}")
            connection.execute(text("""UPDATE shopping_list_items SET amount=2.5, shopping_unit_code='pound', shopping_store_id=:store,
                is_checked=:checked, checked_at=CASE WHEN :checked THEN CURRENT_TIMESTAMP ELSE NULL END,
                checked_by_user_id=CASE WHEN :checked THEN CAST(:owner AS uuid) ELSE NULL END WHERE id=:id"""),
                {"store": stores[position % 2], "checked": checked, "owner": owner, "id": row})
            rows.append(row)
            if checked:
                removed.append(row)
            else:
                needed.append(dict(connection.execute(text("SELECT * FROM shopping_list_items WHERE id=:id"), {"id": row}).mappings().one()))
        catalog = insert_catalog_item(connection, household, owner, "Recipe source")
        recipe = connection.execute(text("""INSERT INTO household_recipes (household_id,created_by_user_id,create_request_id,name,normalized_name)
            VALUES (:hh,:owner,:request,'Source recipe','source recipe') RETURNING id::text"""), {"hh": household, "owner": owner, "request": str(uuid4())}).scalar_one()
        connection.execute(text("INSERT INTO household_recipe_ingredients (household_id,recipe_id,catalog_item_id,position) VALUES (:hh,:recipe,:catalog,0)"), {"hh": household, "recipe": recipe, "catalog": catalog})
        connection.execute(text("""INSERT INTO household_meal_plan_entries (household_id,recipe_id,planned_for,meal_slot,created_by_user_id)
            VALUES (:hh,:recipe,'2026-10-29','dinner',:owner)"""), {"hh": household, "recipe": recipe, "owner": owner})
        if removed:
            connection.execute(text("UPDATE shopping_list_items SET catalog_item_id=:catalog,shopping_unit_code=NULL,recipe_unit_code='tablespoon',recipe_unit_dimension='volume' WHERE id=:id"), {"catalog": catalog, "id": removed[0]})
            connection.execute(text("UPDATE catalog_items SET archived_at=CURRENT_TIMESTAMP WHERE id=:id"), {"id": catalog})
        source_tables = ("catalog_items", "household_recipes", "household_recipe_ingredients", "household_meal_plan_entries", "catalog_stores")
        def sources(connection):
            return {table: [dict(row) for row in connection.execute(text(f"SELECT * FROM {table} WHERE household_id=:hh ORDER BY id"), {"hh": household}).mappings()] for table in source_tables}
        before = sources(connection)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            url = f"/v1/households/{household}/shopping-list/purchased-items"
            response = await call_as(owner if role == "owner" else member, "clear@example.test", client, "DELETE", url)
            assert response.status_code == 200
            assert response.json() == {"removed_count": len(removed), "removed_item_ids": sorted(removed)}
            repeated = await client.delete(url)
            assert repeated.status_code == 200
            assert repeated.json() == {"removed_count": 0, "removed_item_ids": []}
        with disposable_engine.connect() as connection:
            remaining = [dict(row) for row in connection.execute(text("SELECT * FROM shopping_list_items WHERE household_id=:hh ORDER BY id"), {"hh": household}).mappings()]
            assert sorted(remaining, key=lambda row: str(row["id"])) == sorted(needed, key=lambda row: str(row["id"]))
            assert sources(connection) == before
            assert item_snapshot(connection, foreign_row) == foreign_before
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            for table in ("household_meal_plan_entries", "household_recipe_ingredients", "household_recipes", "shopping_list_items", "catalog_items", "catalog_stores", "shopping_lists", "household_members"):
                connection.execute(text(f"DELETE FROM {table} WHERE household_id IN (:hh,:foreign)"), {"hh": household, "foreign": foreign_household})
            connection.execute(text("DELETE FROM households WHERE id IN (:hh,:foreign)"), {"hh": household, "foreign": foreign_household})
            connection.execute(text("DELETE FROM users WHERE id IN (:owner,:member)"), {"owner": owner, "member": member})


@pytest.mark.parametrize("ordering", ["uncheck-first", "readd-first", "clear-first", "clear-before-uncheck"])
def test_clear_purchased_serializes_with_other_phone_writes(disposable_engine, monkeypatch, ordering):
    with disposable_engine.begin() as connection:
        owner = insert_user(connection, f"concurrent-clear-{uuid4()}@example.test")
        household, list_id = insert_household(connection, owner)
        row = insert_item(connection, list_id, owner, "Shared milk")
        catalog = connection.execute(text("SELECT catalog_item_id::text FROM shopping_list_items WHERE id=:id"), {"id": row}).scalar_one()
        connection.execute(text("UPDATE shopping_list_items SET is_checked=true,checked_at=CURRENT_TIMESTAMP,checked_by_user_id=:owner WHERE id=:id"), {"owner": owner, "id": row})
    user = CurrentUser(owner, "concurrent@example.test", "Test User")
    holding, second_started, release = Event(), Event(), Event()
    original_lock = shopping_lists.lock_household
    def controlled_lock(connection, household_id, user_id):
        if holding.is_set():
            second_started.set()
            return original_lock(connection, household_id, user_id)
        result = original_lock(connection, household_id, user_id)
        holding.set()
        assert release.wait(10), "Timed out releasing first transaction"
        return result
    monkeypatch.setattr(shopping_lists, "lock_household", controlled_lock)
    def clear():
        return clear_purchased_items(user, household, disposable_engine)
    def uncheck_or_readd():
        # Both checkbox uncheck and B12 re-add use the explicit false PATCH.
        return update_item(user, household, row, {"is_checked": False}, {"is_checked"}, disposable_engine)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(clear if ordering.startswith("clear-") else uncheck_or_readd)
            try:
                assert holding.wait(10)
                if ordering == "clear-first":
                    second = pool.submit(add_item, user, household, catalog, {"amount": "1"}, disposable_engine)
                else:
                    second = pool.submit(uncheck_or_readd if ordering == "clear-before-uncheck" else clear)
                assert second_started.wait(10)
            finally:
                release.set()
            first_result = first.result(timeout=15)
            if ordering == "clear-before-uncheck":
                assert first_result == {"removed_count": 1, "removed_item_ids": [row]}
                with pytest.raises(HTTPException) as error:
                    second.result(timeout=15)
                assert error.value.status_code == 404
                with disposable_engine.connect() as connection:
                    assert connection.execute(text("SELECT count(*) FROM shopping_list_items WHERE household_id=:hh"), {"hh": household}).scalar_one() == 0
                return
            second_result = second.result(timeout=15)
        with disposable_engine.connect() as connection:
            remaining = connection.execute(text("SELECT id::text,is_checked,catalog_item_id::text FROM shopping_list_items WHERE household_id=:hh"), {"hh": household}).one()
            assert remaining.is_checked is False
            assert remaining.catalog_item_id == catalog
            if ordering == "clear-first":
                assert first_result == {"removed_count": 1, "removed_item_ids": [row]}
                assert remaining.id != row
                assert second_result["id"] == remaining.id
            else:
                assert remaining.id == row
                assert second_result == {"removed_count": 0, "removed_item_ids": []}
    finally:
        release.set()
        with disposable_engine.begin() as connection:
            for table in ("shopping_list_items", "catalog_items", "shopping_lists", "household_members"):
                connection.execute(text(f"DELETE FROM {table} WHERE household_id=:hh"), {"hh": household})
            connection.execute(text("DELETE FROM households WHERE id=:hh"), {"hh": household})
            connection.execute(text("DELETE FROM users WHERE id=:id"), {"id": owner})
