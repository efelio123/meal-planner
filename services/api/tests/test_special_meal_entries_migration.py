"""Transactional migration checks on the identity-verified disposable database."""
import importlib.util
import os
from pathlib import Path

import alembic.op
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from test_meal_planning_integration import _household, _recipe, _user


@pytest.fixture
def meal_plan_engine():
    configured = os.getenv("DATABASE_URL")
    if not configured:
        pytest.skip("DATABASE_URL is not configured; special-meal migrations were not tested.")
    url = make_url(configured)
    if url.drivername != "postgresql+psycopg" or url.database != "meal_planner_disposable_test":
        pytest.fail("Special-meal migration tests require meal_planner_disposable_test.")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == "meal_planner_disposable_test"
        yield engine
    finally:
        engine.dispose()


def revision():
    path = Path(__file__).resolve().parents[3] / "db/migrations/versions/meal_plan_special_entries.py"
    spec = importlib.util.spec_from_file_location("special_meal_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_preserves_populated_recipe_rows_and_enforces_entry_variants(meal_plan_engine, monkeypatch):
    migration = revision()
    with meal_plan_engine.connect() as connection:
        transaction = connection.begin()
        try:
            monkeypatch.setattr(alembic.op, "execute", lambda sql: connection.execute(text(sql)))
            migration.downgrade()
            owner = _user(connection, "migration-owner")
            home = _household(connection, owner, "Migration meals")
            recipe = _recipe(connection, home, owner, [])
            entry = connection.execute(text("INSERT INTO household_meal_plan_entries (household_id,created_by_user_id,planned_for,meal_slot,recipe_id,edit_revision) VALUES (:home,:owner,'2026-10-05','dinner',:recipe,7) RETURNING id"), {"home": home, "owner": owner, "recipe": recipe}).scalar_one()
            before = dict(connection.execute(text("SELECT * FROM household_meal_plan_entries WHERE id=:id"), {"id": entry}).mappings().one())
            migration.upgrade()
            after = dict(connection.execute(text("SELECT * FROM household_meal_plan_entries WHERE id=:id"), {"id": entry}).mappings().one())
            assert {key: after[key] for key in before} == before
            assert after["entry_type"] == "recipe" and after["detail"] is None
            for kind, recipe_id, detail in [("recipe", None, None), ("leftovers", recipe, None), ("unknown", None, None), ("eating_out", None, "x" * 161), ("recipe", recipe, "Cafe")]:
                with pytest.raises(IntegrityError) as caught, connection.begin_nested():
                    connection.execute(text("INSERT INTO household_meal_plan_entries (household_id,created_by_user_id,planned_for,meal_slot,recipe_id,entry_type,detail) VALUES (:home,:owner,'2026-10-05','lunch',:recipe,:kind,:detail)"), {"home": home, "owner": owner, "recipe": recipe_id, "kind": kind, "detail": detail})
                assert caught.value.orig.sqlstate == "23514"
        finally:
            transaction.rollback()


def test_downgrade_refuses_special_meals_without_changing_their_data(meal_plan_engine, monkeypatch):
    migration = revision()
    with meal_plan_engine.connect() as connection:
        transaction = connection.begin()
        try:
            monkeypatch.setattr(alembic.op, "execute", lambda sql: connection.execute(text(sql)))
            owner = _user(connection, "downgrade-owner")
            home = _household(connection, owner, "Keep special meals")
            entry = connection.execute(text("INSERT INTO household_meal_plan_entries (household_id,created_by_user_id,planned_for,meal_slot,entry_type,detail) VALUES (:home,:owner,'2026-10-05','lunch','eating_out','Cafe') RETURNING id"), {"home": home, "owner": owner}).scalar_one()
            with pytest.raises(DBAPIError, match="Cannot downgrade"), connection.begin_nested():
                migration.downgrade()
            row = connection.execute(text("SELECT recipe_id,entry_type,detail FROM household_meal_plan_entries WHERE id=:id"), {"id": entry}).mappings().one()
            assert dict(row) == {"recipe_id": None, "entry_type": "eating_out", "detail": "Cafe"}
            connection.execute(text("DELETE FROM household_meal_plan_entries WHERE id=:id"), {"id": entry})
            migration.downgrade()
            assert connection.execute(text("SELECT is_nullable FROM information_schema.columns WHERE table_name='household_meal_plan_entries' AND column_name='recipe_id'")).scalar_one() == "NO"
            migration.upgrade()
        finally:
            transaction.rollback()
