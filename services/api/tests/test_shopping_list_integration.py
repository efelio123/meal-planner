import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user
from meal_planner_api.shopping_lists import add_item

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
async def test_catalog_identity_duplicate_details_update_and_clear_contract(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"list-details-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)
        catalog_id = insert_catalog_item(connection, household_id, user_id, "Apples")
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
