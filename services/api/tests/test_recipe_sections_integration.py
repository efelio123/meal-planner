"""Section persistence, compatibility and migration on verified disposable PG."""
import importlib.util
from pathlib import Path
from uuid import uuid4

import alembic.op
import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from test_recipes_integration import (
    cleanup_household,
    insert_food,
    insert_household,
    insert_recipe,
    insert_user,
)
from test_recipes_integration import (
    recipe_engine as recipe_engine,  # noqa: PLC0414 -- register imported pytest fixture
)

from meal_planner_api.meal_planning import create_entry, get_shopping_review
from meal_planner_api.onboarding import CurrentUser
from meal_planner_api.recipes import create_recipe, get_recipe, update_recipe


def test_sections_roundtrip_legacy_guard_and_shopping_totals(recipe_engine):
    with recipe_engine.begin() as conn:
        user_id = insert_user(conn, f"sections-{uuid4()}@example.test")
        home = insert_household(conn, user_id)
        item = insert_food(conn, home, "Butter")
    user = CurrentUser(user_id, "sections@example.test", "Sections")
    try:
        draft = {"create_request_id": str(uuid4()), "name": "Dinner", "ingredients": [{"catalog_item_id": item, "amount": "1/2"}]}
        flat = create_recipe(user, home, draft, recipe_engine)
        assert flat["ingredient_sections"] == [] and flat["ingredients"][0]["section_position"] is None
        recipe_id = flat["id"]
        request = {"expected_revision": 1, "ingredient_sections": [{"name": " Chicken "}, {"name": "Mash"}, {"name": "Empty"}], "ingredients": [
            {"catalog_item_id": item, "amount": "2", "section_position": 1, "note": "potatoes"},
            {"catalog_item_id": item, "amount": "1/2", "section_position": 0, "note": "chicken"},
            {"catalog_item_id": item, "amount": None, "section_position": None, "note": "to taste"},
        ]}
        saved = update_recipe(user, home, recipe_id, request, set(request), recipe_engine)
        assert [s["name"] for s in saved["ingredient_sections"]] == ["Chicken", "Mash", "Empty"]
        assert [i["section_position"] for i in saved["ingredients"]] == [None, 0, 1]
        assert [i["note"] for i in saved["ingredients"]] == ["to taste", "chicken", "potatoes"]
        assert get_recipe(user, home, recipe_id, recipe_engine) == saved
        legacy = {"expected_revision": 2, "ingredients": draft["ingredients"]}
        with pytest.raises(HTTPException) as denied:
            update_recipe(user, home, recipe_id, legacy, set(legacy), recipe_engine)
        assert denied.value.detail["code"] == "RECIPE_SECTIONS_UPDATE_REQUIRED"
        assert get_recipe(user, home, recipe_id, recipe_engine) == saved
        invalid = {**request, "expected_revision": 2, "ingredients": [{"catalog_item_id": item, "section_position": 19}]}
        with pytest.raises(HTTPException):
            update_recipe(user, home, recipe_id, invalid, set(invalid), recipe_engine)
        assert get_recipe(user, home, recipe_id, recipe_engine) == saved
        metadata = {"expected_revision": 2, "name": "Family dinner"}
        named = update_recipe(user, home, recipe_id, metadata, set(metadata), recipe_engine)
        assert named["ingredient_sections"] == saved["ingredient_sections"]
        assert named["ingredients"] == saved["ingredients"]
        replay = create_recipe(user, home, draft, recipe_engine)
        assert replay["id"] == recipe_id and replay["ingredient_sections"] == saved["ingredient_sections"]
        create_entry(user, home, "2026-11-01", "dinner", recipe_id, recipe_engine)
        review = get_shopping_review(user, home, "2026-11-01", recipe_engine, week_end="2026-11-01")
        assert sorted((need["amount"] for need in review["needs"]), key=lambda x: x or "") == [None, "2.5"]
        reordered = {"expected_revision": 3, "ingredient_sections": [{"name": "Empty"}, {"name": "Mash"}, {"name": "Chicken"}], "ingredients": [
            {"catalog_item_id": item, "amount": "1/2", "section_position": 2, "note": "chicken"},
            {"catalog_item_id": item, "amount": "2", "section_position": 1, "note": "potatoes"},
            {"catalog_item_id": item, "amount": None, "note": "to taste"},
        ]}
        moved = update_recipe(user, home, recipe_id, reordered, set(reordered), recipe_engine)
        assert [i["note"] for i in moved["ingredients"]] == ["to taste", "potatoes", "chicken"]
        assert [s["name"] for s in moved["ingredient_sections"]] == ["Empty", "Mash", "Chicken"]
        flatten = {"expected_revision": 4, "ingredient_sections": [], "ingredients": draft["ingredients"]}
        result = update_recipe(user, home, recipe_id, flatten, set(flatten), recipe_engine)
        assert result["ingredient_sections"] == [] and len(result["ingredients"]) == 1
    finally:
        with recipe_engine.begin() as conn:
            conn.execute(text("DELETE FROM household_meal_plan_entries WHERE household_id=:id"), {"id": home})
        cleanup_household(recipe_engine, [home], [user_id])


def test_section_fk_rejects_another_recipe_and_tenant(recipe_engine):
    with recipe_engine.begin() as conn:
        users = [insert_user(conn, f"sections-fk-{uuid4()}@example.test") for _ in range(2)]
        homes = [insert_household(conn, user) for user in users]
        foods = [insert_food(conn, home, "Salt") for home in homes]
        recipes = [insert_recipe(conn, home, user, food) for home, user, food in zip(homes, users, foods)]
        second = insert_recipe(conn, homes[0], users[0], foods[0])
        section = conn.execute(text("INSERT INTO household_recipe_sections(household_id,recipe_id,position,name) VALUES (:h,:r,0,'Sauce') RETURNING id"), {"h": homes[0], "r": recipes[0]}).scalar_one()
    try:
        for home, recipe, food in [(homes[0], second, foods[0]), (homes[1], recipes[1], foods[1])]:
            with pytest.raises(IntegrityError), recipe_engine.begin() as conn:
                conn.execute(text("INSERT INTO household_recipe_ingredients(household_id,recipe_id,catalog_item_id,position,section_id) VALUES (:h,:r,:f,1,:s)"), {"h": home, "r": recipe, "f": food, "s": section})
        outsider = CurrentUser(users[1], "other@example.test", "Other")
        with pytest.raises(HTTPException) as denied:
            get_recipe(outsider, homes[0], recipes[0], recipe_engine)
        assert denied.value.status_code == 404
    finally:
        cleanup_household(recipe_engine, homes, users)


def test_sections_migration_preserves_rows_and_guards_downgrade(recipe_engine, monkeypatch):
    path = Path(__file__).resolve().parents[3] / "db/migrations/versions/recipe_ingredient_sections.py"
    spec = importlib.util.spec_from_file_location("sections_revision", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with recipe_engine.connect() as conn:
        transaction = conn.begin()
        try:
            monkeypatch.setattr(alembic.op, "execute", lambda sql: conn.execute(text(sql)))
            migration.downgrade()
            user = insert_user(conn, f"sections-migration-{uuid4()}@example.test")
            home = insert_household(conn, user)
            food = insert_food(conn, home, "Flour")
            recipe = insert_recipe(conn, home, user, food)
            conn.execute(text("UPDATE household_recipe_ingredients SET amount=2.666667, custom_unit_label='scoops', note='legacy note' WHERE recipe_id=:r"), {"r": recipe})
            conn.execute(text("INSERT INTO household_recipe_ingredients(household_id,recipe_id,catalog_item_id,position,note) VALUES (:h,:r,:f,1,'to taste')"), {"h": home, "r": recipe, "f": food})
            before = [dict(row) for row in conn.execute(text("SELECT * FROM household_recipe_ingredients WHERE recipe_id=:r ORDER BY position"), {"r": recipe}).mappings()]
            migration.upgrade()
            after = [dict(row) for row in conn.execute(text("SELECT * FROM household_recipe_ingredients WHERE recipe_id=:r ORDER BY position"), {"r": recipe}).mappings()]
            assert [{k: row[k] for k in before[0]} for row in after] == before
            assert all(row["section_id"] is None for row in after)
            conn.execute(text("INSERT INTO household_recipe_sections(household_id,recipe_id,position,name) VALUES (:h,:r,0,'Dough')"), {"h": home, "r": recipe})
            with pytest.raises(DBAPIError), conn.begin_nested():
                migration.downgrade()
            assert conn.execute(text("SELECT count(*) FROM household_recipe_sections WHERE recipe_id=:r"), {"r": recipe}).scalar_one() == 1
        finally:
            transaction.rollback()
