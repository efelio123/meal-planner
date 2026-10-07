"""PostgreSQL authorization, migration, and concurrency coverage for recipes.

The suite intentionally refuses any database except meal_planner_disposable_test.
"""

import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user
from meal_planner_api.recipes import update_recipe

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture
def recipe_engine() -> Generator[Engine]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is not configured; PostgreSQL recipe tests were not run.")
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail("Recipe integration tests require the explicitly named disposable PostgreSQL database.")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            actual_database = connection.execute(text("SELECT current_database()")).scalar_one()
        if actual_database != DISPOSABLE_TEST_DATABASE:
            pytest.fail("The connected PostgreSQL database is not meal_planner_disposable_test.")
        yield engine
    finally:
        engine.dispose()


def insert_user(connection, email: str) -> str:
    return connection.execute(text("""
        INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
        VALUES ('test', :subject, :email, 'Recipe Test User') RETURNING id::text
    """), {"subject": str(uuid4()), "email": email}).scalar_one()


def insert_household(connection, owner_id: str) -> str:
    household_id = connection.execute(text("""
        INSERT INTO households (name, time_zone, created_by_user_id)
        VALUES (:name, 'America/Phoenix', :owner_id) RETURNING id::text
    """), {"name": f"Recipe household {uuid4()}", "owner_id": owner_id}).scalar_one()
    connection.execute(text("""
        INSERT INTO household_members (household_id, user_id, role)
        VALUES (:household_id, :user_id, 'owner')
    """), {"household_id": household_id, "user_id": owner_id})
    return household_id


def insert_food(connection, household_id: str, name: str) -> str:
    return connection.execute(text("""
        INSERT INTO catalog_items (household_id, item_type, name, normalized_name)
        VALUES (:household_id, 'food', :name, lower(:name)) RETURNING id::text
    """), {"household_id": household_id, "name": name}).scalar_one()


def insert_recipe(connection, household_id: str, user_id: str, item_id: str) -> str:
    recipe_id = connection.execute(text("""
        INSERT INTO household_recipes (household_id, created_by_user_id, create_request_id, name, normalized_name)
        VALUES (:household_id, :user_id, :request_id, 'Test recipe', 'test recipe') RETURNING id::text
    """), {"household_id": household_id, "user_id": user_id, "request_id": str(uuid4())}).scalar_one()
    connection.execute(text("""
        INSERT INTO household_recipe_ingredients (household_id, recipe_id, catalog_item_id, position, amount)
        VALUES (:household_id, :recipe_id, :item_id, 0, 1)
    """), {"household_id": household_id, "recipe_id": recipe_id, "item_id": item_id})
    return recipe_id


async def call_as(user_id: str, email: str, client: AsyncClient, method: str, url: str, **kwargs):
    app.dependency_overrides[require_current_user] = lambda: CurrentUser(user_id, email, "Recipe Test User")
    return await client.request(method, url, **kwargs)


def cleanup_household(engine: Engine, household_ids: list[str], user_ids: list[str]) -> None:
    with engine.begin() as connection:
        for household_id in household_ids:
            connection.execute(text("DELETE FROM household_recipe_steps WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_recipe_ingredients WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_recipes WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
        for user_id in user_ids:
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})


def test_recipe_migration_is_current_and_keeps_household_scoped_foreign_keys(recipe_engine: Engine) -> None:
    with recipe_engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "household_recipes"
        constraints = set(connection.execute(text("""
            SELECT conname FROM pg_constraint
            WHERE conrelid IN (
                'household_recipes'::regclass,
                'household_recipe_ingredients'::regclass,
                'household_recipe_steps'::regclass
            )
        """)).scalars())
        catalog_item_constraints = {
            row.conname: (row.contype, row.definition)
            for row in connection.execute(text("""
                SELECT conname, contype, pg_get_constraintdef(oid) AS definition
                FROM pg_constraint
                WHERE conrelid = 'catalog_items'::regclass
            """))
        }
    assert "household_recipe_ingredients_recipe_fk" in constraints
    assert "household_recipe_ingredients_catalog_item_fk" in constraints
    assert "household_recipe_steps_recipe_fk" in constraints
    assert catalog_item_constraints.get("catalog_items_household_id_id_unique") == (
        "u",
        "UNIQUE (household_id, id)",
    )


@pytest.mark.anyio
async def test_create_request_retry_is_idempotent_and_archived_request_cannot_be_reused(recipe_engine: Engine) -> None:
    with recipe_engine.begin() as connection:
        user_id = insert_user(connection, f"recipe-retry-{uuid4()}@example.test")
        household_id = insert_household(connection, user_id)
        item_id = insert_food(connection, household_id, "Retry test item")
    create_payload = {
        "create_request_id": str(uuid4()),
        "name": "Retry-safe recipe",
        "ingredients": [{"catalog_item_id": item_id}],
    }

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            first = await call_as(
                user_id,
                "recipe-retry@example.test",
                client,
                "POST",
                f"/v1/households/{household_id}/recipes",
                json=create_payload,
            )
            assert first.status_code == 201, first.text
            recipe_id = first.json()["recipe"]["id"]

            retry = await call_as(
                user_id,
                "recipe-retry@example.test",
                client,
                "POST",
                f"/v1/households/{household_id}/recipes",
                json=create_payload,
            )
            assert retry.status_code == 201, retry.text
            assert retry.json()["recipe"]["id"] == recipe_id

            with recipe_engine.connect() as connection:
                assert connection.execute(text(
                    "SELECT count(*) FROM household_recipes WHERE household_id = :household_id AND create_request_id = :request_id"
                ), {"household_id": household_id, "request_id": create_payload["create_request_id"]}).scalar_one() == 1

            archived = await call_as(
                user_id,
                "recipe-retry@example.test",
                client,
                "POST",
                f"/v1/households/{household_id}/recipes/{recipe_id}/archive",
            )
            assert archived.status_code == 204, archived.text

            reused = await call_as(
                user_id,
                "recipe-retry@example.test",
                client,
                "POST",
                f"/v1/households/{household_id}/recipes",
                json=create_payload,
            )
            assert reused.status_code == 409
            assert reused.json()["detail"]["code"] == "RECIPE_CREATE_REQUEST_ALREADY_USED"
            with recipe_engine.connect() as connection:
                assert connection.execute(text(
                    "SELECT count(*) FROM household_recipes WHERE household_id = :household_id AND create_request_id = :request_id"
                ), {"household_id": household_id, "request_id": create_payload["create_request_id"]}).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()
        cleanup_household(recipe_engine, [household_id], [user_id])


@pytest.mark.anyio
async def test_household_members_can_create_edit_search_archive_and_restore_recipes(recipe_engine: Engine) -> None:
    with recipe_engine.begin() as connection:
        owner_id = insert_user(connection, f"recipe-owner-{uuid4()}@example.test")
        member_id = insert_user(connection, f"recipe-member-{uuid4()}@example.test")
        household_id = insert_household(connection, owner_id)
        connection.execute(text("""
            INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'member')
        """), {"household_id": household_id, "user_id": member_id})
        item_id = insert_food(connection, household_id, "Red onion")
    create_payload = {
        "create_request_id": str(uuid4()), "name": "Weeknight soup", "servings": 4, "prep_hours": 0, "prep_minutes": 15,
        "cook_hours": 1, "cook_minutes": 5, "cover_kind": "emoji", "cover_emoji": "🍲",
        "ingredients": [{"catalog_item_id": item_id, "amount": "1 1/2", "unit_code": "pound", "note": "diced"}],
        "steps": ["Chop the onion", "Simmer"],
    }

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            created = await call_as(member_id, "recipe-member@example.test", client, "POST", f"/v1/households/{household_id}/recipes", json=create_payload)
            assert created.status_code == 201, created.text
            recipe = created.json()["recipe"]
            recipe_id = recipe["id"]
            assert recipe["prep_minutes"] == 15
            assert recipe["cook_minutes"] == 65
            assert recipe["ingredients"][0]["amount"] == "1.500000"
            assert recipe["ingredients"][0]["catalog_item_name"] == "Red onion"
            assert [step["instruction"] for step in recipe["steps"]] == ["Chop the onion", "Simmer"]

            retried = await call_as(member_id, "recipe-member@example.test", client, "POST", f"/v1/households/{household_id}/recipes", json=create_payload)
            assert retried.status_code == 201
            assert retried.json()["recipe"]["id"] == recipe_id

            listed = await call_as(owner_id, "recipe-owner@example.test", client, "GET", f"/v1/households/{household_id}/recipes?search=weeknight")
            assert listed.status_code == 200
            assert [value["id"] for value in listed.json()["recipes"]] == [recipe_id]

            edited = await call_as(owner_id, "recipe-owner@example.test", client, "PATCH", f"/v1/households/{household_id}/recipes/{recipe_id}", json={
                "expected_revision": recipe["edit_revision"], "name": "Tomato soup",
                "ingredients": [{"catalog_item_id": item_id, "amount": "1/2", "custom_unit_label": "small bowl"}],
                "steps": ["Simmer gently"],
            })
            assert edited.status_code == 200, edited.text
            assert edited.json()["recipe"]["name"] == "Tomato soup"
            assert edited.json()["recipe"]["ingredients"][0]["amount"] == "0.500000"
            assert edited.json()["recipe"]["ingredients"][0]["custom_unit_label"] == "small bowl"
            assert [step["instruction"] for step in edited.json()["recipe"]["steps"]] == ["Simmer gently"]

            stale = await call_as(member_id, "recipe-member@example.test", client, "PATCH", f"/v1/households/{household_id}/recipes/{recipe_id}", json={
                "expected_revision": recipe["edit_revision"], "name": "Stale edit",
            })
            assert stale.status_code == 409
            assert stale.json()["detail"]["code"] == "RECIPE_REVISION_CONFLICT"

            null_name = await call_as(owner_id, "recipe-owner@example.test", client, "PATCH", f"/v1/households/{household_id}/recipes/{recipe_id}", json={"expected_revision": edited.json()["recipe"]["edit_revision"], "name": None})
            assert null_name.status_code == 422
            null_ingredients = await call_as(owner_id, "recipe-owner@example.test", client, "PATCH", f"/v1/households/{household_id}/recipes/{recipe_id}", json={"expected_revision": edited.json()["recipe"]["edit_revision"], "ingredients": None})
            assert null_ingredients.status_code == 422

            archived = await call_as(member_id, "recipe-member@example.test", client, "POST", f"/v1/households/{household_id}/recipes/{recipe_id}/archive")
            assert archived.status_code == 204
            assert (await call_as(owner_id, "recipe-owner@example.test", client, "GET", f"/v1/households/{household_id}/recipes/{recipe_id}")).status_code == 404
            archived_list = await call_as(member_id, "recipe-member@example.test", client, "GET", f"/v1/households/{household_id}/recipes?archived=true")
            assert archived_list.status_code == 200
            assert archived_list.json()["recipes"][0]["id"] == recipe_id
            restored = await call_as(owner_id, "recipe-owner@example.test", client, "POST", f"/v1/households/{household_id}/recipes/{recipe_id}/restore")
            assert restored.status_code == 204
            assert (await call_as(member_id, "recipe-member@example.test", client, "GET", f"/v1/households/{household_id}/recipes/{recipe_id}")).status_code == 200
    finally:
        app.dependency_overrides.clear()
        cleanup_household(recipe_engine, [household_id], [owner_id, member_id])


@pytest.mark.anyio
async def test_recipes_are_isolated_from_foreign_removed_and_deleted_households(recipe_engine: Engine) -> None:
    with recipe_engine.begin() as connection:
        owner_a = insert_user(connection, f"recipe-owner-a-{uuid4()}@example.test")
        owner_b = insert_user(connection, f"recipe-owner-b-{uuid4()}@example.test")
        member = insert_user(connection, f"recipe-member-{uuid4()}@example.test")
        household_a = insert_household(connection, owner_a)
        household_b = insert_household(connection, owner_b)
        connection.execute(text("""
            INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'member')
        """), {"household_id": household_a, "user_id": member})
        item_b = insert_food(connection, household_b, "Foreign onion")
        target_recipe = insert_recipe(connection, household_b, owner_b, item_b)
        own_item = insert_food(connection, household_a, "Own onion")
        own_recipe = insert_recipe(connection, household_a, owner_a, own_item)
        connection.execute(text("UPDATE household_members SET removed_at = CURRENT_TIMESTAMP WHERE household_id = :id AND user_id = :user"), {"id": household_a, "user": member})
        connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": household_b})

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            outsider_list = await call_as(member, "recipe-member@example.test", client, "GET", f"/v1/households/{household_b}/recipes")
            assert outsider_list.status_code == 404
            outsider_create = await call_as(member, "recipe-member@example.test", client, "POST", f"/v1/households/{household_b}/recipes", json={"create_request_id": str(uuid4()), "name": "Outsider write", "ingredients": [{"catalog_item_id": item_b}]})
            assert outsider_create.status_code == 404
            foreign_get = await call_as(member, "recipe-member@example.test", client, "GET", f"/v1/households/{household_a}/recipes/{target_recipe}")
            assert foreign_get.status_code == 404
            foreign_update = await call_as(member, "recipe-member@example.test", client, "PATCH", f"/v1/households/{household_a}/recipes/{target_recipe}", json={"expected_revision": 1, "name": "Attempted"})
            assert foreign_update.status_code == 404
            assert (await call_as(member, "recipe-member@example.test", client, "POST", f"/v1/households/{household_b}/recipes/{target_recipe}/archive")).status_code == 404
            assert (await call_as(member, "recipe-member@example.test", client, "POST", f"/v1/households/{household_b}/recipes/{target_recipe}/restore")).status_code == 404
            removed_list = await call_as(member, "recipe-member@example.test", client, "GET", f"/v1/households/{household_a}/recipes")
            assert removed_list.status_code == 404
            assert (await call_as(member, "recipe-member@example.test", client, "PATCH", f"/v1/households/{household_a}/recipes/{own_recipe}", json={"expected_revision": 1, "name": "Removed member"})).status_code == 404
            deleted_list = await call_as(owner_b, "recipe-owner-b@example.test", client, "GET", f"/v1/households/{household_b}/recipes")
            assert deleted_list.status_code == 404
            deleted_update = await call_as(owner_b, "recipe-owner-b@example.test", client, "PATCH", f"/v1/households/{household_b}/recipes/{target_recipe}", json={"expected_revision": 1, "name": "Attempted"})
            assert deleted_update.status_code == 404
            assert (await call_as(owner_b, "recipe-owner-b@example.test", client, "POST", f"/v1/households/{household_b}/recipes/{target_recipe}/archive")).status_code == 404
        with recipe_engine.connect() as connection:
            assert connection.execute(text("SELECT name FROM household_recipes WHERE id = :id"), {"id": target_recipe}).scalar_one() == "Test recipe"
            assert connection.execute(text("SELECT name FROM household_recipes WHERE id = :id"), {"id": own_recipe}).scalar_one() == "Test recipe"
    finally:
        app.dependency_overrides.clear()
        with recipe_engine.begin() as connection:
            connection.execute(text("UPDATE households SET deleted_at = NULL WHERE id = :id"), {"id": household_b})
            connection.execute(text("UPDATE household_members SET removed_at = NULL WHERE household_id = :id AND user_id = :user"), {"id": household_a, "user": member})
        cleanup_household(recipe_engine, [household_a, household_b], [owner_a, owner_b, member])


@pytest.mark.anyio
async def test_new_recipe_requires_active_food_item_in_same_household(recipe_engine: Engine) -> None:
    with recipe_engine.begin() as connection:
        owner_a = insert_user(connection, f"recipe-owner-{uuid4()}@example.test")
        owner_b = insert_user(connection, f"recipe-other-owner-{uuid4()}@example.test")
        household_a = insert_household(connection, owner_a)
        household_b = insert_household(connection, owner_b)
        household_item = insert_food(connection, household_a, "Household item")
        foreign_item = insert_food(connection, household_b, "Foreign food")
        nonfood_id = connection.execute(text("""
            INSERT INTO catalog_items (household_id, item_type, name, normalized_name)
            VALUES (:household_id, 'household', 'Dish soap', 'dish soap') RETURNING id::text
        """), {"household_id": household_a}).scalar_one()

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            for item_id, expected_status in ((foreign_item, 404), (nonfood_id, 422)):
                response = await call_as(owner_a, "recipe-owner@example.test", client, "POST", f"/v1/households/{household_a}/recipes", json={
                    "create_request_id": str(uuid4()), "name": "Invalid recipe", "ingredients": [{"catalog_item_id": item_id}],
                })
                assert response.status_code == expected_status
            created = await call_as(owner_a, "recipe-owner@example.test", client, "POST", f"/v1/households/{household_a}/recipes", json={
                "create_request_id": str(uuid4()), "name": "Valid recipe", "ingredients": [{"catalog_item_id": household_item}],
            })
            assert created.status_code == 201
            recipe_id = created.json()["recipe"]["id"]
            with recipe_engine.begin() as connection:
                connection.execute(text("UPDATE catalog_items SET archived_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": household_item})
            # Existing references remain readable after the Catalog item is archived.
            detail = await call_as(owner_a, "recipe-owner@example.test", client, "GET", f"/v1/households/{household_a}/recipes/{recipe_id}")
            assert detail.status_code == 200
            assert detail.json()["recipe"]["ingredients"][0]["catalog_item_name"] == "Household item"
            # Replacing ingredients with the now-archived Catalog item is rejected.
            edited = await call_as(owner_a, "recipe-owner@example.test", client, "PATCH", f"/v1/households/{household_a}/recipes/{recipe_id}", json={
                "expected_revision": detail.json()["recipe"]["edit_revision"], "ingredients": [{"catalog_item_id": household_item}],
            })
            assert edited.status_code == 409
    finally:
        app.dependency_overrides.clear()
        cleanup_household(recipe_engine, [household_a, household_b], [owner_a, owner_b])


def test_recipe_write_waiting_for_household_deletion_is_rejected_after_archive(recipe_engine: Engine) -> None:
    with recipe_engine.begin() as connection:
        owner_id = insert_user(connection, f"recipe-race-{uuid4()}@example.test")
        household_id = insert_household(connection, owner_id)
        item_id = insert_food(connection, household_id, "Race onion")
        recipe_id = insert_recipe(connection, household_id, owner_id, item_id)

    with ThreadPoolExecutor(max_workers=1) as pool:
        with recipe_engine.begin() as connection:
            connection.execute(text("SELECT id FROM households WHERE id = :id FOR UPDATE"), {"id": household_id}).one()
            pending = pool.submit(
                update_recipe,
                CurrentUser(owner_id, "recipe-race@example.test", "Recipe Test User"),
                household_id,
                recipe_id,
                {"expected_revision": 1, "name": "Must not commit"},
                {"expected_revision", "name"},
                recipe_engine,
            )
            connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": household_id})
        try:
            pending.result(timeout=10)
        except HTTPException as error:
            assert error.status_code == 404
        else:
            pytest.fail("The recipe write should be denied after household deletion commits first.")

    with recipe_engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM household_recipes WHERE id = :id"), {"id": recipe_id}).scalar_one() == "Test recipe"
    with recipe_engine.begin() as connection:
        connection.execute(text("UPDATE households SET deleted_at = NULL WHERE id = :id"), {"id": household_id})
    cleanup_household(recipe_engine, [household_id], [owner_id])
