"""Disposable-PostgreSQL coverage for household meal plans and shopping review."""

import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from meal_planner_api.household_management import delete_household
from meal_planner_api.main import app
from meal_planner_api.meal_planning import (
    add_reviewed_needs,
    create_entry,
    get_shopping_review,
)
from meal_planner_api.onboarding import CurrentUser, require_current_user

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture
def meal_plan_engine() -> Generator[Engine]:
    configured = os.getenv("DATABASE_URL")
    if not configured:
        pytest.skip("DATABASE_URL is not configured; meal-plan PostgreSQL tests were not run.")
    parsed = make_url(configured)
    if parsed.drivername != "postgresql+psycopg" or parsed.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail("Meal-plan tests require the explicitly named disposable PostgreSQL database.")
    engine = create_engine(parsed)
    try:
        with engine.connect() as connection:
            if connection.execute(text("SELECT current_database()")).scalar_one() != DISPOSABLE_TEST_DATABASE:
                pytest.fail("The connected database is not meal_planner_disposable_test.")
        yield engine
    finally:
        engine.dispose()


def _user(connection, label: str) -> str:
    return connection.execute(text("""
        INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
        VALUES ('test', :subject, :email, 'Meal Plan Test') RETURNING id::text
    """), {"subject": str(uuid4()), "email": f"{label}-{uuid4()}@example.com"}).scalar_one()


def _household(connection, owner_id: str, name: str) -> str:
    household_id = connection.execute(text("""
        INSERT INTO households (name, time_zone, created_by_user_id)
        VALUES (:name, 'America/Phoenix', :owner) RETURNING id::text
    """), {"name": name, "owner": owner_id}).scalar_one()
    connection.execute(text("INSERT INTO household_members (household_id,user_id,role) VALUES (:household,:user,'owner')"), {"household": household_id, "user": owner_id})
    connection.execute(text("INSERT INTO shopping_lists (household_id) VALUES (:household)"), {"household": household_id})
    return household_id


def _food(connection, household_id: str, name: str) -> str:
    return connection.execute(text("""
        INSERT INTO catalog_items (household_id,item_type,name,normalized_name)
        VALUES (:household,'food',:name,lower(:name)) RETURNING id::text
    """), {"household": household_id, "name": name}).scalar_one()


def _recipe(connection, household_id: str, owner_id: str, ingredients: list[tuple[str, str | None, str | None, str | None]]) -> str:
    recipe_id = connection.execute(text("""
        INSERT INTO household_recipes (household_id,created_by_user_id,create_request_id,name,normalized_name)
        VALUES (:household,:owner,:request,:name,lower(:name)) RETURNING id::text
    """), {"household": household_id, "owner": owner_id, "request": str(uuid4()), "name": f"Recipe {uuid4()}"}).scalar_one()
    for position, (item_id, amount, unit_code, custom) in enumerate(ingredients):
        dimension = connection.execute(text("SELECT dimension FROM recipe_measurement_units WHERE code=:code"), {"code": unit_code}).scalar_one_or_none() if unit_code else None
        connection.execute(text("""
            INSERT INTO household_recipe_ingredients
                (household_id,recipe_id,catalog_item_id,position,amount,recipe_unit_code,recipe_unit_dimension,custom_unit_label)
            VALUES (:household,:recipe,:item,:position,:amount,:unit,:dimension,:custom)
        """), {"household": household_id, "recipe": recipe_id, "item": item_id, "position": position,
                "amount": amount, "unit": unit_code, "dimension": dimension, "custom": custom})
    return recipe_id


def _cleanup(engine: Engine, households: list[str], users: list[str]) -> None:
    with engine.begin() as connection:
        for household_id in households:
            connection.execute(text("DELETE FROM shopping_list_items WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_list_meal_plan_requests WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_meal_plan_entries WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_recipe_steps WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_recipe_ingredients WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_recipes WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM catalog_items WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id=:id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id=:id"), {"id": household_id})
        for user_id in users:
            connection.execute(text("DELETE FROM users WHERE id=:id"), {"id": user_id})


def test_meal_plan_migration_has_household_scoped_keys_and_preserves_manual_shopping_rows(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "household_meal_planning"
        entry_constraints = set(connection.execute(text("""
            SELECT conname FROM pg_constraint WHERE conrelid='household_meal_plan_entries'::regclass
        """)).scalars())
        item_constraints = set(connection.execute(text("""
            SELECT conname FROM pg_constraint WHERE conrelid='shopping_list_items'::regclass
        """)).scalars())
        columns = set(connection.execute(text("""
            SELECT column_name FROM information_schema.columns WHERE table_name='shopping_list_items'
        """)).scalars())
    assert {"household_meal_plan_household_recipe_fk", "household_meal_plan_household_date_slot_unique"} <= entry_constraints
    assert {"shopping_list_items_household_list_fk", "shopping_list_items_household_catalog_fk", "shopping_list_items_meal_plan_request_fk"} <= item_constraints
    assert {"household_id", "catalog_item_id", "amount", "recipe_unit_code", "meal_plan_request_id"} <= columns


async def _as(client: AsyncClient, user_id: str, method: str, path: str, **kwargs):
    app.dependency_overrides[require_current_user] = lambda: CurrentUser(user_id, "meal-plan@example.com", "Meal Plan Test")
    return await client.request(method, path, **kwargs)


@pytest.mark.anyio
async def test_plan_entries_are_household_scoped_unique_and_revision_checked(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "plan-owner")
        member = _user(connection, "plan-member")
        outsider = _user(connection, "plan-outsider")
        removed = _user(connection, "plan-removed")
        household = _household(connection, owner, "Meal plan household")
        other = _household(connection, outsider, "Other household")
        connection.execute(text("INSERT INTO household_members (household_id,user_id,role) VALUES (:household,:user,'member')"), {"household": household, "user": member})
        connection.execute(text("INSERT INTO household_members (household_id,user_id,role,removed_at) VALUES (:household,:user,'member',CURRENT_TIMESTAMP)"), {"household": household, "user": removed})
        item = _food(connection, household, "Beans")
        recipe = _recipe(connection, household, owner, [(item, "1", "cup", None)])
        other_item = _food(connection, other, "Other beans")
        other_recipe = _recipe(connection, other, outsider, [(other_item, "1", "cup", None)])

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            week = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            assert week.status_code == 200, week.text
            monday = week.json()["week_start"]
            assert week.json()["time_zone"] == "America/Phoenix"
            assert date.fromisoformat(monday).weekday() == 0
            assert date.fromisoformat(week.json()["week_end"]) - date.fromisoformat(monday) == timedelta(days=6)
            assert monday <= week.json()["local_today"] <= week.json()["week_end"]
            previous_week = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan?week_offset=-1")
            assert previous_week.status_code == 200
            assert date.fromisoformat(previous_week.json()["week_start"]) == date.fromisoformat(monday) - timedelta(days=7)
            assert previous_week.json()["week_offset"] == -1
            entry_path = f"/v1/households/{household}/meal-plan/entries"
            other_week = await _as(client, outsider, "GET", f"/v1/households/{other}/meal-plan")
            other_monday = other_week.json()["week_start"]
            other_entry = await _as(client, outsider, "POST", f"/v1/households/{other}/meal-plan/entries", json={"planned_for": other_monday, "meal_slot": "dinner", "recipe_id": other_recipe})
            assert other_entry.status_code == 201, other_entry.text
            created = await _as(client, owner, "POST", entry_path, json={"planned_for": monday, "meal_slot": "dinner", "recipe_id": recipe})
            assert created.status_code == 201, created.text
            entry = created.json()["entry"]
            assert entry["planned_for"] == monday and entry["edit_revision"] == 1

            member_create = await _as(client, member, "POST", entry_path, json={"planned_for": monday, "meal_slot": "breakfast", "recipe_id": recipe})
            assert member_create.status_code == 201, member_create.text
            invalid_day = await _as(client, owner, "POST", entry_path, json={"planned_for": "2026-02-30", "meal_slot": "lunch", "recipe_id": recipe})
            assert invalid_day.status_code == 422
            cross_household_recipe = await _as(client, owner, "POST", entry_path, json={"planned_for": monday, "meal_slot": "lunch", "recipe_id": other_recipe})
            assert cross_household_recipe.status_code == 404

            duplicate = await _as(client, owner, "POST", entry_path, json={"planned_for": monday, "meal_slot": "dinner", "recipe_id": recipe})
            assert duplicate.status_code == 409
            assert duplicate.json()["detail"]["code"] == "MEAL_PLAN_SLOT_OCCUPIED"

            patch_path = f"/v1/households/{household}/meal-plan/entries/{entry['id']}"
            updated = await _as(client, owner, "PATCH", patch_path, json={"planned_for": monday, "meal_slot": "lunch", "recipe_id": recipe, "expected_revision": 1})
            assert updated.status_code == 200 and updated.json()["entry"]["edit_revision"] == 2
            occupied_move = await _as(client, owner, "PATCH", patch_path, json={"planned_for": monday, "meal_slot": "breakfast", "recipe_id": recipe, "expected_revision": 2})
            assert occupied_move.status_code == 409 and occupied_move.json()["detail"]["code"] == "MEAL_PLAN_SLOT_OCCUPIED"
            stale = await _as(client, owner, "PATCH", patch_path, json={"planned_for": monday, "meal_slot": "breakfast", "recipe_id": recipe, "expected_revision": 1})
            assert stale.status_code == 409 and stale.json()["detail"]["code"] == "MEAL_PLAN_REVISION_CONFLICT"
            member_entry_id = member_create.json()["entry"]["id"]
            member_updated = await _as(client, member, "PATCH", f"/v1/households/{household}/meal-plan/entries/{member_entry_id}", json={"planned_for": (date.fromisoformat(monday) + timedelta(days=1)).isoformat(), "meal_slot": "lunch", "recipe_id": recipe, "expected_revision": 1})
            assert member_updated.status_code == 200 and member_updated.json()["entry"]["edit_revision"] == 2
            member_path = f"/v1/households/{household}/meal-plan/entries/{member_entry_id}?expected_revision=2"
            assert (await _as(client, member, "DELETE", member_path)).status_code == 204
            outsider_read = await _as(client, outsider, "GET", f"/v1/households/{household}/meal-plan")
            outsider_write = await _as(client, outsider, "POST", f"/v1/households/{household}/meal-plan/entries", json={"planned_for": monday, "meal_slot": "breakfast", "recipe_id": recipe})
            removed_write = await _as(client, removed, "POST", entry_path, json={"planned_for": monday, "meal_slot": "breakfast", "recipe_id": recipe})
            removed_read = await _as(client, removed, "GET", f"/v1/households/{household}/meal-plan")
            cross_household_update = await _as(client, owner, "PATCH", f"/v1/households/{household}/meal-plan/entries/{other_entry.json()['entry']['id']}", json={"planned_for": monday, "meal_slot": "lunch", "recipe_id": recipe, "expected_revision": 1})
            cross_household_delete = await _as(client, owner, "DELETE", f"/v1/households/{household}/meal-plan/entries/{other_entry.json()['entry']['id']}?expected_revision=1")
            assert outsider_read.status_code == outsider_write.status_code == removed_read.status_code == removed_write.status_code == 404
            assert cross_household_update.status_code == cross_household_delete.status_code == 404
            other_after_denials = await _as(client, outsider, "GET", f"/v1/households/{other}/meal-plan")
            assert other_after_denials.json()["entries"][0]["id"] == other_entry.json()["entry"]["id"]
            assert other_after_denials.json()["entries"][0]["edit_revision"] == 1
            deleted = await _as(client, owner, "DELETE", f"/v1/households/{household}/meal-plan/entries/{entry['id']}?expected_revision=2")
            assert deleted.status_code == 204
            listed = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            assert listed.json()["entries"] == []
    finally:
        app.dependency_overrides.clear()
        _cleanup(meal_plan_engine, [household, other], [owner, member, outsider, removed])


@pytest.mark.anyio
async def test_archived_recipe_remains_visible_and_unchanged_assignment_can_move_but_not_be_added(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "archived-plan-owner")
        household = _household(connection, owner, "Archived recipe plan")
        item = _food(connection, household, "Tomatoes")
        archived_recipe = _recipe(connection, household, owner, [(item, "1", "unit", None)])
        active_recipe = _recipe(connection, household, owner, [(item, "2", "unit", None)])

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            week = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            monday = week.json()["week_start"]
            created = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/entries", json={"planned_for": monday, "meal_slot": "dinner", "recipe_id": archived_recipe})
            assert created.status_code == 201, created.text
            entry = created.json()["entry"]
            with meal_plan_engine.begin() as connection:
                connection.execute(text("UPDATE household_recipes SET archived_at=CURRENT_TIMESTAMP WHERE id=:id"), {"id": archived_recipe})

            visible = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            assert visible.json()["entries"][0]["archived_at"] is not None
            cannot_add = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/entries", json={"planned_for": monday, "meal_slot": "lunch", "recipe_id": archived_recipe})
            assert cannot_add.status_code == 409
            assert cannot_add.json()["detail"]["code"] == "MEAL_PLAN_RECIPE_ARCHIVED"

            moved_day = (date.fromisoformat(monday) + timedelta(days=1)).isoformat()
            unchanged_recipe = await _as(client, owner, "PATCH", f"/v1/households/{household}/meal-plan/entries/{entry['id']}", json={"planned_for": moved_day, "meal_slot": "dinner", "recipe_id": archived_recipe, "expected_revision": 1})
            assert unchanged_recipe.status_code == 200, unchanged_recipe.text
            changed_recipe = await _as(client, owner, "PATCH", f"/v1/households/{household}/meal-plan/entries/{entry['id']}", json={"planned_for": moved_day, "meal_slot": "dinner", "recipe_id": active_recipe, "expected_revision": 2})
            assert changed_recipe.status_code == 200 and changed_recipe.json()["entry"]["recipe_id"] == active_recipe
    finally:
        app.dependency_overrides.clear()
        _cleanup(meal_plan_engine, [household], [owner])


@pytest.mark.anyio
async def test_shopping_review_aggregates_exact_units_keeps_unknown_separate_and_retries_idempotently(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "review-owner")
        member = _user(connection, "review-member")
        outsider = _user(connection, "review-outsider")
        household = _household(connection, owner, "Review household")
        connection.execute(text("INSERT INTO household_members (household_id,user_id,role) VALUES (:household,:member,'member')"), {"household": household, "member": member})
        beans = _food(connection, household, "Beans")
        rice = _food(connection, household, "Rice")
        first_recipe = _recipe(connection, household, owner, [(beans, "1", "cup", None), (rice, None, None, None)])
        second_recipe = _recipe(connection, household, owner, [(beans, "0.5", "cup", None), (beans, "2", "gram", None)])
        list_id = connection.execute(text("SELECT id::text FROM shopping_lists WHERE household_id=:id"), {"id": household}).scalar_one()
        # Exact catalog/unit match and a possible name-only manual match remain unchanged.
        connection.execute(text("""INSERT INTO shopping_list_items (household_id,shopping_list_id,name,created_by_user_id,catalog_item_id,amount,recipe_unit_code,recipe_unit_dimension)
            VALUES (:household,:list,'Beans',:owner,:beans,3,'milliliter','volume')"""), {"household": household, "list": list_id, "owner": owner, "beans": beans})
        connection.execute(text("""INSERT INTO shopping_list_items (household_id,shopping_list_id,name,created_by_user_id,catalog_item_id)
            VALUES (:household,:list,'Rice',:owner,:rice)"""), {"household": household, "list": list_id, "owner": owner, "rice": rice})
        manual_rice_id = connection.execute(text("INSERT INTO shopping_list_items (household_id,shopping_list_id,name,created_by_user_id) VALUES (:household,:list,'Rice',:owner) RETURNING id::text"), {"household": household, "list": list_id, "owner": owner}).scalar_one()

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            week = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            monday = week.json()["week_start"]
            created_entries = {}
            for slot, recipe in (("breakfast", first_recipe), ("dinner", second_recipe)):
                response = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/entries", json={"planned_for": monday, "meal_slot": slot, "recipe_id": recipe})
                assert response.status_code == 201, response.text
                created_entries[slot] = response.json()["entry"]
            review_path = f"/v1/households/{household}/meal-plan/shopping-review?week_start={monday}"
            review_response = await _as(client, owner, "GET", review_path)
            assert review_response.status_code == 200, review_response.text
            review = review_response.json()
            outsider_read = await _as(client, outsider, "GET", review_path)
            outsider_write = await _as(client, outsider, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                "week_start": monday, "review_token": review["review_token"], "request_id": str(uuid4()),
                "selected_need_keys": [review["needs"][0]["need_key"]],
                "amount_overrides": {review["needs"][0]["need_key"]: "1"},
            })
            assert outsider_read.status_code == outsider_write.status_code == 404
            beans_cup = next(need for need in review["needs"] if need["name"] == "Beans" and need["unit_label"] == "Cup")
            beans_gram = next(need for need in review["needs"] if need["name"] == "Beans" and need["unit_label"] == "Gram")
            rice_need = next(need for need in review["needs"] if need["name"] == "Rice")
            assert beans_cup["amount"] == "1.5" and len(beans_cup["sources"]) == 2
            assert beans_cup["default_selected"] is True
            assert beans_gram["amount"] == "2"
            assert rice_need["amount"] is None and rice_need["default_selected"] is False
            assert {match["kind"] for match in rice_need["existing_matches"]} == {"exact", "possible"}

            # A same-week slot change keeps the quantities and source order,
            # but the old review must not confirm an out-of-date meal source.
            breakfast = created_entries["breakfast"]
            moved = await _as(client, owner, "PATCH", f"/v1/households/{household}/meal-plan/entries/{breakfast['id']}", json={
                "planned_for": monday, "meal_slot": "lunch", "recipe_id": first_recipe,
                "expected_revision": breakfast["edit_revision"],
            })
            assert moved.status_code == 200, moved.text
            stale_plan = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                "week_start": monday, "review_token": review["review_token"], "request_id": str(uuid4()),
                "selected_need_keys": [beans_cup["need_key"]],
                "amount_overrides": {beans_cup["need_key"]: "1"},
            })
            assert stale_plan.status_code == 409
            assert stale_plan.json()["detail"]["code"] == "MEAL_PLAN_REVIEW_STALE"
            review_response = await _as(client, owner, "GET", review_path)
            assert review_response.status_code == 200, review_response.text
            review = review_response.json()
            beans_cup = next(need for need in review["needs"] if need["name"] == "Beans" and need["unit_label"] == "Cup")
            assert {source["meal_slot"] for source in beans_cup["sources"]} == {"lunch", "dinner"}

            # Editing a recipe after preview makes the review token stale.
            with meal_plan_engine.begin() as connection:
                connection.execute(text("UPDATE household_recipes SET edit_revision=edit_revision+1 WHERE id=:id"), {"id": first_recipe})
            stale_payload = {"week_start": monday, "review_token": review["review_token"], "request_id": str(uuid4()),
                             "selected_need_keys": [beans_cup["need_key"]], "amount_overrides": {beans_cup["need_key"]: "1"}}
            stale = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json=stale_payload)
            assert stale.status_code == 409 and stale.json()["detail"]["code"] == "MEAL_PLAN_REVIEW_STALE"
            review_response = await _as(client, owner, "GET", review_path)
            review = review_response.json()
            beans_cup = next(need for need in review["needs"] if need["name"] == "Beans" and need["unit_label"] == "Cup")
            with meal_plan_engine.begin() as connection:
                connection.execute(text("UPDATE catalog_items SET name='Black Beans', normalized_name='black beans' WHERE id=:id"), {"id": beans})
            renamed_item_stale = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                "week_start": monday, "review_token": review["review_token"], "request_id": str(uuid4()),
                "selected_need_keys": [beans_cup["need_key"]],
            })
            assert renamed_item_stale.status_code == 409
            assert renamed_item_stale.json()["detail"]["code"] == "MEAL_PLAN_REVIEW_STALE"
            review_response = await _as(client, owner, "GET", review_path)
            review = review_response.json()
            beans_cup = next(need for need in review["needs"] if need["name"] == "Black Beans" and need["unit_label"] == "Cup")
            rice_need = next(need for need in review["needs"] if need["name"] == "Rice")

            # A manual Shopping edit after preview invalidates the confirmation
            # token even when it does not match a planned need.
            with meal_plan_engine.begin() as connection:
                connection.execute(text("UPDATE shopping_list_items SET name='Brown rice' WHERE id=:id"), {"id": manual_rice_id})
            changed_shopping = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                "week_start": monday, "review_token": review["review_token"], "request_id": str(uuid4()),
                "selected_need_keys": [beans_cup["need_key"]],
            })
            assert changed_shopping.status_code == 409
            assert changed_shopping.json()["detail"]["code"] == "MEAL_PLAN_REVIEW_STALE"
            review_response = await _as(client, owner, "GET", review_path)
            review = review_response.json()
            beans_cup = next(need for need in review["needs"] if need["name"] == "Black Beans" and need["unit_label"] == "Cup")
            rice_need = next(need for need in review["needs"] if need["name"] == "Rice")

            request_id = str(uuid4())
            payload = {"week_start": monday, "review_token": review["review_token"], "request_id": request_id,
                       "selected_need_keys": [beans_cup["need_key"], rice_need["need_key"]]}
            added = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json=payload)
            assert added.status_code == 201, added.text
            assert len(added.json()["items"]) == 2 and added.json()["replayed"] is False
            shopping_after_add = await _as(client, owner, "GET", f"/v1/households/{household}/shopping-list")
            assert shopping_after_add.status_code == 200, shopping_after_add.text
            generated_beans = next(item for item in shopping_after_add.json()["shopping_list"]["items"] if item["id"] in {row["id"] for row in added.json()["items"]} and item["name"] == "Black Beans")
            generated_rice = next(item for item in shopping_after_add.json()["shopping_list"]["items"] if item["id"] in {row["id"] for row in added.json()["items"]} and item["name"] == "Rice")
            manual_brown_rice = next(item for item in shopping_after_add.json()["shopping_list"]["items"] if item["id"] == manual_rice_id)
            assert (generated_beans["amount"], generated_beans["recipe_unit_label"], generated_beans["meal_plan_source"]) == ("1.5", "Cup", True)
            assert (generated_rice["amount"], generated_rice["meal_plan_source"]) == (None, True)
            assert (manual_brown_rice["amount"], manual_brown_rice["meal_plan_source"]) == (None, False)
            retry = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json=payload)
            assert retry.status_code == 201 and retry.json()["replayed"] is True
            assert [row["id"] for row in retry.json()["items"]] == [row["id"] for row in added.json()["items"]]
            reused_for_different_selection = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={**payload, "selected_need_keys": [beans_cup["need_key"]]})
            assert reused_for_different_selection.status_code == 409
            assert reused_for_different_selection.json()["detail"]["code"] == "MEAL_PLAN_REQUEST_REUSED"
            another_member_replay = await _as(client, member, "POST", f"/v1/households/{household}/meal-plan/shopping", json=payload)
            assert another_member_replay.status_code == 409
            assert another_member_replay.json()["detail"]["code"] == "MEAL_PLAN_REQUEST_REUSED"
            with meal_plan_engine.connect() as connection:
                assert connection.execute(text("SELECT count(*) FROM shopping_list_items WHERE household_id=:id"), {"id": household}).scalar_one() == 5
                generated = connection.execute(text("""
                    SELECT name, amount::text AS amount, recipe_unit_code, catalog_item_id::text AS catalog_item_id,
                           meal_plan_request_id::text AS request_id
                    FROM shopping_list_items WHERE household_id=:household AND meal_plan_request_id=:request
                """), {"household": household, "request": request_id}).mappings().all()
                assert {(row["name"], row["amount"], row["recipe_unit_code"], row["catalog_item_id"]) for row in generated} == {
                    ("Black Beans", "1.500000", "cup", beans), ("Rice", None, None, rice),
                }
                manual_rice = connection.execute(text("SELECT name,amount,is_checked FROM shopping_list_items WHERE id=:id"), {"id": manual_rice_id}).one()
                assert manual_rice.name == "Brown rice" and manual_rice.amount is None and manual_rice.is_checked is False
    finally:
        app.dependency_overrides.clear()
        _cleanup(meal_plan_engine, [household], [owner, member, outsider])


@pytest.mark.anyio
async def test_reviewed_shopping_amount_overrides_are_validated_and_idempotent(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "amount-override-owner")
        household = _household(connection, owner, "Amount override household")
        chicken = _food(connection, household, "Chicken")
        rice = _food(connection, household, "Rice")
        salt = _food(connection, household, "Salt")
        apples = _food(connection, household, "Apples")
        recipe = _recipe(connection, household, owner, [
            (chicken, "3", "pound", None),
            (rice, "2", "cup", None),
            (salt, None, None, None),
            (apples, "4", "unit", None),
        ])

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            week = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            monday = week.json()["week_start"]
            created_entry = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/entries", json={
                "planned_for": monday, "meal_slot": "dinner", "recipe_id": recipe,
            })
            assert created_entry.status_code == 201, created_entry.text
            review_path = f"/v1/households/{household}/meal-plan/shopping-review?week_start={monday}"
            initial_review = (await _as(client, owner, "GET", review_path)).json()
            needs = {need["name"]: need for need in initial_review["needs"]}
            payload = {
                "week_start": monday,
                "review_token": initial_review["review_token"],
                "request_id": str(uuid4()),
                "selected_need_keys": [need["need_key"] for need in needs.values()],
                "amount_overrides": {
                    needs["Chicken"]["need_key"]: "1 1/2",
                    needs["Rice"]["need_key"]: "5",
                },
            }

            added = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json=payload)
            assert added.status_code == 201, added.text
            list_response = await _as(client, owner, "GET", f"/v1/households/{household}/shopping-list")
            assert list_response.status_code == 200, list_response.text
            generated = {item["name"]: item for item in list_response.json()["shopping_list"]["items"]}
            assert (generated["Chicken"]["amount"], generated["Chicken"]["recipe_unit_label"]) == ("1.500000", "Pound")
            assert (generated["Rice"]["amount"], generated["Rice"]["recipe_unit_label"]) == ("5.000000", "Cup")
            assert (generated["Apples"]["amount"], generated["Apples"]["recipe_unit_label"]) == ("4.000000", "Unit")
            assert generated["Salt"]["amount"] is None

            replay = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json=payload)
            assert replay.status_code == 201 and replay.json()["replayed"] is True
            assert [item["id"] for item in replay.json()["items"]] == [item["id"] for item in added.json()["items"]]

            normalized_fraction_replay = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                **payload,
                "amount_overrides": {**payload["amount_overrides"], needs["Chicken"]["need_key"]: "1.5"},
            })
            assert normalized_fraction_replay.status_code == 201 and normalized_fraction_replay.json()["replayed"] is True

            changed_amount_replay = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                **payload,
                "amount_overrides": {**payload["amount_overrides"], needs["Chicken"]["need_key"]: "2"},
            })
            assert changed_amount_replay.status_code == 409
            assert changed_amount_replay.json()["detail"]["code"] == "MEAL_PLAN_REQUEST_REUSED"

            invalid_unselected = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                **payload,
                "request_id": str(uuid4()),
                "selected_need_keys": [needs["Chicken"]["need_key"]],
                "amount_overrides": {needs["Rice"]["need_key"]: "1"},
            })
            assert invalid_unselected.status_code == 422

            unknown_need = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                **payload,
                "request_id": str(uuid4()),
                "selected_need_keys": [needs["Chicken"]["need_key"]],
                "amount_overrides": {"not-a-need": "1"},
            })
            assert unknown_need.status_code == 422

            current_review = (await _as(client, owner, "GET", review_path)).json()
            current_salt = next(need for need in current_review["needs"] if need["name"] == "Salt")
            current_chicken = next(need for need in current_review["needs"] if need["name"] == "Chicken")
            invalid_value = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                "week_start": monday,
                "review_token": current_review["review_token"],
                "request_id": str(uuid4()),
                "selected_need_keys": [current_chicken["need_key"]],
                "amount_overrides": {current_chicken["need_key"]: "0"},
            })
            assert invalid_value.status_code == 422
            unknown_total = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/shopping", json={
                "week_start": monday,
                "review_token": current_review["review_token"],
                "request_id": str(uuid4()),
                "selected_need_keys": [current_salt["need_key"]],
                "amount_overrides": {current_salt["need_key"]: "1"},
            })
            assert unknown_total.status_code == 422

            with meal_plan_engine.connect() as connection:
                assert connection.execute(text("SELECT count(*) FROM shopping_list_items WHERE household_id=:id"), {"id": household}).scalar_one() == 4
    finally:
        app.dependency_overrides.clear()
        _cleanup(meal_plan_engine, [household], [owner])


@pytest.mark.anyio
async def test_custom_units_normalize_for_aggregation_and_existing_match_detection(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "custom-unit-owner")
        household = _household(connection, owner, "Custom unit household")
        salt = _food(connection, household, "Salt")
        recipes = [
            _recipe(connection, household, owner, [(salt, "1", None, "pinch")]),
            _recipe(connection, household, owner, [(salt, "2", None, "  Pinch   ")]),
        ]
        list_id = connection.execute(text("SELECT id::text FROM shopping_lists WHERE household_id=:id"), {"id": household}).scalar_one()
        existing_item_id = connection.execute(text("""
            INSERT INTO shopping_list_items (household_id,shopping_list_id,name,created_by_user_id,catalog_item_id,custom_unit_label)
            VALUES (:household,:list,'Salt',:owner,:salt,' PINCH ')
            RETURNING id::text
        """), {"household": household, "list": list_id, "owner": owner, "salt": salt}).scalar_one()

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            week = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            monday = week.json()["week_start"]
            for slot, recipe_id in (("breakfast", recipes[0]), ("dinner", recipes[1])):
                created = await _as(client, owner, "POST", f"/v1/households/{household}/meal-plan/entries", json={"planned_for": monday, "meal_slot": slot, "recipe_id": recipe_id})
                assert created.status_code == 201, created.text
            response = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan/shopping-review?week_start={monday}")
            assert response.status_code == 200, response.text
            need = next(value for value in response.json()["needs"] if value["name"] == "Salt")
            assert need["amount"] == "3"
            assert " ".join(need["custom_unit_label"].split()).casefold() == "pinch"
            assert need["default_selected"] is False
            assert need["existing_matches"] == [{"kind": "exact", "item_id": existing_item_id, "name": "Salt"}]
    finally:
        app.dependency_overrides.clear()
        _cleanup(meal_plan_engine, [household], [owner])


def test_concurrent_slot_claims_allow_exactly_one_household_member(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "concurrent-owner")
        household = _household(connection, owner, "Concurrent meal plan")
        item = _food(connection, household, "Eggs")
        recipe = _recipe(connection, household, owner, [(item, "1", "unit", None)])
        today = connection.execute(text("SELECT (timezone(time_zone,CURRENT_TIMESTAMP))::date FROM households WHERE id=:id"), {"id": household}).scalar_one()
        monday = today.fromordinal(today.toordinal() - today.weekday()).isoformat()
    user = CurrentUser(owner, "concurrent@example.com", "Meal Plan Test")

    def claim():
        try:
            return create_entry(user, household, monday, "breakfast", recipe, meal_plan_engine)
        except HTTPException as error:  # The loser must receive the domain conflict, not a second row.
            return error

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: claim(), range(2)))
        assert sum(isinstance(result, dict) for result in results) == 1
        assert sum(isinstance(result, HTTPException) and result.status_code == 409 for result in results) == 1
        with meal_plan_engine.connect() as connection:
            assert connection.execute(text("SELECT count(*) FROM household_meal_plan_entries WHERE household_id=:id AND planned_for=:day AND meal_slot='breakfast'"), {"id": household, "day": monday}).scalar_one() == 1
    finally:
        _cleanup(meal_plan_engine, [household], [owner])


def test_household_archive_serializes_with_reviewed_shopping_write(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "archive-review-owner")
        household = _household(connection, owner, "Archive review race")
        catalog_item = _food(connection, household, "Apples")
        recipe = _recipe(connection, household, owner, [(catalog_item, "2", "unit", None)])
        today = connection.execute(text("SELECT (timezone(time_zone,CURRENT_TIMESTAMP))::date FROM households WHERE id=:id"), {"id": household}).scalar_one()
        monday = today.fromordinal(today.toordinal() - today.weekday()).isoformat()
        connection.execute(text("""
            INSERT INTO household_meal_plan_entries (household_id,planned_for,meal_slot,recipe_id,created_by_user_id)
            VALUES (:household,:day,'breakfast',:recipe,:owner)
        """), {"household": household, "day": monday, "recipe": recipe, "owner": owner})
    current_user = CurrentUser(owner, "archive-review@example.com", "Meal Plan Test")
    preview = get_shopping_review(current_user, household, monday, meal_plan_engine)
    request_id = str(uuid4())
    barrier = Barrier(2)

    def add():
        barrier.wait()
        try:
            return add_reviewed_needs(current_user, household, monday, preview["review_token"], request_id,
                                      [preview["needs"][0]["need_key"]], meal_plan_engine)
        except HTTPException as error:
            return error

    def archive():
        barrier.wait()
        try:
            delete_household(current_user, household, meal_plan_engine)
            return None
        except HTTPException as error:
            return error

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            add_result, archive_result = list(pool.map(lambda action: action(), (add, archive)))
        assert archive_result is None
        assert isinstance(add_result, dict) or isinstance(add_result, HTTPException) and add_result.status_code == 404
        with meal_plan_engine.connect() as connection:
            assert connection.execute(text("SELECT deleted_at IS NOT NULL FROM households WHERE id=:id"), {"id": household}).scalar_one()
            item_count = connection.execute(text("SELECT count(*) FROM shopping_list_items WHERE household_id=:id"), {"id": household}).scalar_one()
            assert item_count == (1 if isinstance(add_result, dict) else 0)
            assert connection.execute(text("SELECT count(*) FROM household_meal_plan_entries WHERE household_id=:id"), {"id": household}).scalar_one() == 1
    finally:
        _cleanup(meal_plan_engine, [household], [owner])


def test_composite_foreign_keys_reject_cross_household_plan_and_shopping_references(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner_a = _user(connection, "fk-owner-a")
        owner_b = _user(connection, "fk-owner-b")
        household_a = _household(connection, owner_a, "FK household A")
        household_b = _household(connection, owner_b, "FK household B")
        item_a = _food(connection, household_a, "Cabbage")
        recipe_a = _recipe(connection, household_a, owner_a, [(item_a, "1", "unit", None)])
        list_b = connection.execute(text("SELECT id::text FROM shopping_lists WHERE household_id=:id"), {"id": household_b}).scalar_one()

        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("""
                INSERT INTO household_meal_plan_entries (household_id,planned_for,meal_slot,recipe_id,created_by_user_id)
                VALUES (:household,'2026-10-05','dinner',:recipe,:owner)
            """), {"household": household_b, "recipe": recipe_a, "owner": owner_b})
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("""
                INSERT INTO shopping_list_items (household_id,shopping_list_id,name,created_by_user_id)
                VALUES (:household,:list,'Cross household',:owner)
            """), {"household": household_a, "list": list_b, "owner": owner_a})
    _cleanup(meal_plan_engine, [household_a, household_b], [owner_a, owner_b])


@pytest.mark.anyio
async def test_deleted_household_hides_plan_while_retaining_entries(meal_plan_engine: Engine) -> None:
    with meal_plan_engine.begin() as connection:
        owner = _user(connection, "archive-plan-owner")
        household = _household(connection, owner, "Retained meal plan")
        item = _food(connection, household, "Lentils")
        recipe = _recipe(connection, household, owner, [(item, "1", "cup", None)])
        today = connection.execute(text("SELECT (timezone(time_zone,CURRENT_TIMESTAMP))::date FROM households WHERE id=:id"), {"id": household}).scalar_one()
        monday = today.fromordinal(today.toordinal() - today.weekday()).isoformat()
        entry_id = connection.execute(text("""
            INSERT INTO household_meal_plan_entries (household_id,planned_for,meal_slot,recipe_id,created_by_user_id)
            VALUES (:household,:day,'dinner',:recipe,:owner) RETURNING id::text
        """), {"household": household, "day": monday, "recipe": recipe, "owner": owner}).scalar_one()

    app.dependency_overrides.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            deleted = await _as(client, owner, "DELETE", f"/v1/households/{household}")
            assert deleted.status_code == 204, deleted.text
            hidden = await _as(client, owner, "GET", f"/v1/households/{household}/meal-plan")
            assert hidden.status_code == 404
            with meal_plan_engine.connect() as connection:
                assert connection.execute(text("SELECT count(*) FROM household_meal_plan_entries WHERE household_id=:id AND id=:entry"), {"id": household, "entry": entry_id}).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()
        _cleanup(meal_plan_engine, [household], [owner])
