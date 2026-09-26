import os
from collections.abc import Generator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user

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
    return connection.execute(
        text(
            """INSERT INTO shopping_list_items (shopping_list_id, name, created_by_user_id)
            VALUES (:list_id, :name, :creator_id) RETURNING id::text"""
        ),
        {"list_id": list_id, "name": name, "creator_id": creator_id},
    ).scalar_one()


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

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            for user_id, email in ((owner_id, "owner@example.test"), (member_id, "member@example.test")):
                loaded = await call_as(user_id, email, client, "GET", f"/v1/households/{household_id}/shopping-list")
                assert loaded.status_code == 200
                assert loaded.json()["shopping_list"]["items"] == []

                created = await call_as(
                    user_id, email, client, "POST", f"/v1/households/{household_id}/shopping-list/items",
                    json={"name": f"Item from {email}"},
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
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:owner, :member)"), {"owner": owner_id, "member": member_id})


@pytest.mark.anyio
async def test_get_item_contract_exposes_id_used_to_toggle_and_remove(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        user_id = insert_user(connection, f"list-contract-{uuid4()}@example.test")
        household_id, list_id = insert_household(connection, user_id)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            created = await call_as(
                user_id,
                "list-contract@example.test",
                client,
                "POST",
                f"/v1/households/{household_id}/shopping-list/items",
                json={"name": "Oat milk"},
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
            assert item == {
                "id": created.json()["item"]["id"],
                "name": "Oat milk",
                "is_checked": False,
                "checked_at": None,
                "checked_by_user_id": None,
                "created_by_user_id": user_id,
                "created_at": item["created_at"],
            }
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
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})


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
            assert (await call_as(member_id, "member@example.test", client, "POST", f"/v1/households/{other_household_id}/shopping-list/items", json={"name": "Intrusion"})).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "PATCH", f"/v1/households/{other_household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(member_id, "member@example.test", client, "DELETE", f"/v1/households/{other_household_id}/shopping-list/items/{target_item_id}")).status_code == 404

            # Even supplying the attacker's own household ID with a known foreign
            # item ID must not update or delete the foreign row.
            assert (await call_as(member_id, "member@example.test", client, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
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
            assert (await call_as(former_member_id, "former@example.test", client, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"name": "Denied"})).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(former_member_id, "former@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
        with disposable_engine.connect() as connection:
            assert item_snapshot(connection, target_item_id) == before
            assert connection.execute(text("SELECT count(*) FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id}).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
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
            assert (await call_as(owner_id, "owner@example.test", client, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"name": "Denied"})).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}", json={"is_checked": True})).status_code == 404
            assert (await call_as(owner_id, "owner@example.test", client, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{target_item_id}")).status_code == 404
        with disposable_engine.connect() as connection:
            assert item_snapshot(connection, target_item_id) == before
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM shopping_list_items WHERE shopping_list_id = :id"), {"id": list_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})
