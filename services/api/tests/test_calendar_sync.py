"""Timed projection and fenced native-writer authority on disposable PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from test_member_permissions_integration import data as data  # noqa: PLC0414
from test_recipes_integration import recipe_engine as recipe_engine  # noqa: PLC0414

from meal_planner_api import calendar_sync as sync
from meal_planner_api import household_management as households
from meal_planner_api import meal_planning


@pytest.mark.parametrize(
    ("day", "clock", "zone", "expected"),
    [
        ("2026-03-08", "02:30", "America/New_York", "2026-03-08T07:30:00+00:00"),
        ("2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:00+00:00"),
        ("2026-10-04", "02:15", "Australia/Lord_Howe", "2026-10-03T15:45:00+00:00"),
        ("2028-02-29", "00:00", "America/Phoenix", "2028-02-29T07:00:00+00:00"),
    ],
)
def test_household_wall_clock_dst(day, clock, zone, expected):
    assert (
        sync.resolve_start(date.fromisoformat(day), clock, zone).isoformat() == expected
    )


@pytest.mark.parametrize(
    ("kind", "detail", "title"),
    [
        ("recipe", None, "Dinner · Chicken tacos"),
        ("leftovers", "Chicken tacos", "Dinner · Leftovers — Chicken tacos"),
        ("leftovers", None, "Dinner · Leftovers"),
        ("eating_out", "Restaurant", "Dinner · Eating out — Restaurant"),
    ],
)
def test_titles_and_elapsed_length(kind, detail, title):
    row = {"dinner_time": "01:30", "duration_minutes": 60}
    entry = {
        "id": uuid4(),
        "planned_for": date(2026, 11, 1),
        "meal_slot": "dinner",
        "entry_type": kind,
        "detail": detail,
        "recipe_name": "Chicken tacos",
    }
    event = sync.project_entry(entry, row, "America/New_York", "Family")
    assert event["title"] == title
    assert datetime.fromisoformat(event["end_date"]) - datetime.fromisoformat(
        event["start_date"]
    ) == timedelta(hours=1)
    assert "ingredients" not in event and "directions" not in event


def registration(d, user=None, secret=None, takeover=False):
    user = user or d["owner"]
    state = sync.get_status(user, d["home"], d["engine"])
    secret = secret or (str(uuid4()) + str(uuid4()))
    result = sync.register(
        user,
        d["home"],
        {
            "expected_revision": state["revision"],
            "writer_id": str(uuid4()),
            "writer_secret": secret,
            "writer_label": "Phone",
            "takeover_confirmed": takeover,
        },
        d["engine"],
    )
    return result, secret


def enable(d):
    state, secret = registration(d)
    state = sync.configure(
        d["owner"],
        d["home"],
        {
            "enabled": True,
            "expected_revision": state["revision"],
            "writer_secret": secret,
            "breakfast_time": "08:00",
            "lunch_time": "12:00",
            "dinner_time": "18:00",
            "duration_minutes": 60,
        },
        d["engine"],
    )
    return state, {
        "writer_secret": secret,
        "expected_revision": state["revision"],
        "run_id": str(uuid4()),
        "known_ids": [],
    }


def test_disabled_creator_default_and_private_member_summary(data):
    d = data
    state = sync.get_status(d["owner"], d["home"], d["engine"])
    assert state["is_manager"] and not state["enabled"] and not state["writer_linked"]
    state, _ = registration(d)
    member = sync.get_status(d["member"], d["home"], d["engine"])
    assert not member["is_manager"] and member["writer_linked"]
    assert member["writer_id"] is None and member["writer_label"] is None
    assert "writer_secret" not in member and "writer_digest" not in member
    with pytest.raises(HTTPException) as denied:
        registration(d, d["member"])
    assert denied.value.status_code == 403


def test_scope_and_settings_validation(data):
    d = data
    with d["engine"].begin() as c:
        c.execute(
            text(
                "UPDATE household_members SET removed_at=CURRENT_TIMESTAMP WHERE household_id=:home AND user_id=:user"
            ),
            {"home": d["other"], "user": d["owner"].id},
        )
    with pytest.raises(HTTPException) as denied:
        sync.get_status(d["owner"], d["other"], d["engine"])
    assert denied.value.status_code == 404
    state, secret = registration(d)
    for changes in [{"breakfast_time": "25:00"}, {"duration_minutes": 1}]:
        payload = {
            "enabled": True,
            "expected_revision": state["revision"],
            "writer_secret": secret,
            "breakfast_time": "08:00",
            "lunch_time": "12:00",
            "dinner_time": "18:00",
            "duration_minutes": 60,
        } | changes
        with pytest.raises(HTTPException) as invalid:
            sync.configure(d["owner"], d["home"], payload, d["engine"])
        assert invalid.value.status_code == 422


def test_pending_run_blocks_replacement_even_after_deadline(data):
    d = data
    state, payload = enable(d)
    sync.run(d["owner"], d["home"], payload, d["engine"])
    with d["engine"].begin() as c:
        c.execute(
            text(
                "UPDATE household_calendar_integrations SET run_deadline=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE household_id=:home"
            ),
            {"home": d["home"]},
        )
    with pytest.raises(HTTPException):
        registration(d, takeover=True)
    assert sync.authorize(d["owner"], d["home"], payload, d["engine"])["authorized"]
    sync.finish(d["owner"], d["home"], payload | {"success": True}, d["engine"])
    replacement, _ = registration(d, takeover=True)
    assert (
        not replacement["enabled"] and replacement["binding_id"] == state["binding_id"]
    )
    with pytest.raises(HTTPException):
        sync.run(d["owner"], d["home"], payload, d["engine"])


def test_complete_snapshot_renames_special_meals_moves_and_deletes(data):
    d = data
    _state, payload = enable(d)
    today = (
        datetime.now(UTC)
        .astimezone(__import__("zoneinfo").ZoneInfo("America/Phoenix"))
        .date()
    )
    with d["engine"].begin() as c:
        c.execute(
            text(
                "UPDATE household_meal_plan_entries SET planned_for=:day WHERE id=:id"
            ),
            {"day": today, "id": d["entry"]["id"]},
        )
        c.execute(
            text(
                "UPDATE household_recipes SET name='Renamed',normalized_name='renamed' WHERE id=:id"
            ),
            {"id": d["recipe"]["id"]},
        )
    meal_planning.create_entry(
        d["owner"],
        d["home"],
        today.isoformat(),
        "lunch",
        None,
        d["engine"],
        entry_type="leftovers",
        detail="Tacos",
    )
    result = sync.run(d["owner"], d["home"], payload, d["engine"])
    assert result["complete"] and len(result["events"]) == 2
    assert {e["title"] for e in result["events"]} == {
        "Dinner · Renamed",
        "Lunch · Leftovers — Tacos",
    }
    assert result["range_start"] == (today - timedelta(days=7)).isoformat()
    assert result["range_end"] == (today + timedelta(days=90)).isoformat()
    with d["engine"].begin() as c:
        c.execute(
            text(
                "UPDATE household_meal_plan_entries SET planned_for=:day WHERE id=:id"
            ),
            {"day": today + timedelta(days=120), "id": d["entry"]["id"]},
        )
    tracked = payload | {"known_ids": [d["entry"]["id"]]}
    moved = sync.run(d["owner"], d["home"], tracked, d["engine"])
    assert any(
        e["planned_for"] == (today + timedelta(days=120)).isoformat()
        for e in moved["events"]
    )
    with d["engine"].begin() as c:
        c.execute(
            text("DELETE FROM household_meal_plan_entries WHERE id=:id"),
            {"id": d["entry"]["id"]},
        )
    deleted = sync.run(d["owner"], d["home"], tracked, d["engine"])
    assert all(e["id"] != d["entry"]["id"] for e in deleted["events"])
    sync.finish(d["owner"], d["home"], payload | {"success": True}, d["engine"])
    assert sync.get_status(d["owner"], d["home"], d["engine"])["last_success_at"]


def test_demotion_revokes_run_and_falls_back_without_grants_changes(data):
    d = data
    households.set_member_role(
        d["owner"], d["home"], d["membership"], "owner", d["engine"]
    )
    _state, payload = enable(d)
    sync.run(d["owner"], d["home"], payload, d["engine"])
    with d["engine"].connect() as c:
        old = c.execute(
            text(
                "SELECT id::text FROM household_members WHERE household_id=:home AND user_id=:user"
            ),
            {"home": d["home"], "user": d["owner"].id},
        ).scalar_one()
    households.set_member_role(d["member"], d["home"], old, "member", d["engine"])
    fallback = sync.get_status(d["member"], d["home"], d["engine"])
    assert (
        fallback["is_manager"] and not fallback["enabled"] and fallback["run_pending"]
    )
    with pytest.raises(HTTPException):
        sync.authorize(d["owner"], d["home"], payload, d["engine"])
    with pytest.raises(HTTPException):
        registration(d, d["member"], takeover=True)
    sync.finish(d["owner"], d["home"], payload | {"success": False}, d["engine"])
    registration(d, d["member"], takeover=True)


def test_transfer_and_one_registration_wins_revision_race(data):
    d = data
    state = sync.get_status(d["owner"], d["home"], d["engine"])

    def attempt(_):
        try:
            return sync.register(
                d["owner"],
                d["home"],
                {
                    "expected_revision": state["revision"],
                    "writer_id": str(uuid4()),
                    "writer_secret": str(uuid4()) + str(uuid4()),
                    "writer_label": "Phone",
                    "takeover_confirmed": False,
                },
                d["engine"],
            )
        except HTTPException as e:
            return e.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))
    assert len([r for r in results if isinstance(r, dict)]) == 1 and 409 in results
    households.set_member_role(
        d["owner"], d["home"], d["membership"], "owner", d["engine"]
    )
    state = sync.get_status(d["owner"], d["home"], d["engine"])
    sync.transfer(
        d["owner"], d["home"], d["membership"], state["revision"], d["engine"]
    )
    state = sync.get_status(d["member"], d["home"], d["engine"])
    assert state["is_manager"] and not state["enabled"] and not state["writer_linked"]


@pytest.mark.anyio
async def test_http_contract_rejects_time_overrides_and_member_writes(
    data, monkeypatch
):
    from httpx2 import ASGITransport, AsyncClient

    from meal_planner_api.main import app
    from meal_planner_api.onboarding import require_current_user

    d = data
    monkeypatch.setattr(sync, "get_engine", lambda: d["engine"])
    app.dependency_overrides[require_current_user] = lambda: d["owner"]
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            base = f"/v1/households/{d['home']}"
            result = await client.get(base + "/calendar-sync")
            assert result.status_code == 200 and not result.json()["enabled"]
            body = {
                "writer_secret": "a" * 64,
                "writer_id": str(uuid4()),
                "writer_label": "Phone",
                "expected_revision": result.json()["revision"],
                "takeover_confirmed": False,
            }
            result = await client.post(base + "/calendar-sync/writer", json=body)
            assert result.status_code == 200
            invalid = await client.post(
                base + "/meal-plan/calendar-run",
                json={
                    "writer_secret": "a" * 64,
                    "expected_revision": result.json()["revision"],
                    "run_id": str(uuid4()),
                    "dinner_time": "22:00",
                },
            )
            assert invalid.status_code == 422
            app.dependency_overrides[require_current_user] = lambda: d["member"]
            result = await client.post(base + "/calendar-sync/writer", json=body)
            assert result.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_migration_backfill_and_saved_configuration_downgrade_guard(recipe_engine):
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = (
        Path(__file__).resolve().parents[3]
        / "db/migrations/versions/20261102_calendar_sync.py"
    )
    spec = importlib.util.spec_from_file_location("calendar_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    schema = "calendar_test_" + uuid4().hex
    with recipe_engine.begin() as c:
        c.execute(text(f"CREATE SCHEMA {schema}"))
        c.execute(text(f"SET LOCAL search_path TO {schema}"))
        c.execute(
            text(
                "CREATE TABLE households (id uuid PRIMARY KEY,created_by_user_id uuid,deleted_at timestamptz)"
            )
        )
        c.execute(
            text(
                "CREATE TABLE household_members (id uuid PRIMARY KEY,household_id uuid,user_id uuid,role text,removed_at timestamptz,joined_at timestamptz DEFAULT CURRENT_TIMESTAMP)"
            )
        )
        home, creator, owner, membership = [str(uuid4()) for _ in range(4)]
        c.execute(
            text("INSERT INTO households(id,created_by_user_id) VALUES (:h,:u)"),
            {"h": home, "u": creator},
        )
        c.execute(
            text(
                "INSERT INTO household_members(id,household_id,user_id,role) VALUES (:m,:h,:u,'owner')"
            ),
            {"h": home, "u": owner, "m": membership},
        )
        migration.op = Operations(MigrationContext.configure(c))
        migration.upgrade()
        row = (
            c.execute(text("SELECT * FROM household_calendar_integrations"))
            .mappings()
            .one()
        )
        assert str(row["manager_membership_id"]) == membership and not row["enabled"]
        c.execute(text("UPDATE household_calendar_integrations SET revision=2"))
        with pytest.raises(RuntimeError, match="back up"):
            migration.downgrade()
        c.execute(text("UPDATE household_calendar_integrations SET revision=1"))
        migration.downgrade()
        c.execute(text(f"DROP SCHEMA {schema} CASCADE"))


def test_possible_exports_survive_takeover_and_verified_cleanup_resets_ledger(data):
    d = data
    state, payload = enable(d)
    with d["engine"].begin() as c:
        c.execute(
            text(
                "UPDATE household_meal_plan_entries SET planned_for=timezone('America/Phoenix',CURRENT_TIMESTAMP)::date WHERE id=:id"
            ),
            {"id": d["entry"]["id"]},
        )
    initial = sync.run(d["owner"], d["home"], payload, d["engine"])
    assert len(initial["events"]) == 1
    assert initial["previous_exports"] == []
    sync.authorize(
        d["owner"],
        d["home"],
        payload | {"operation": "create", "source_id": d["entry"]["id"]},
        d["engine"],
    )
    # Retry sees the actual create intention, even if the OS response was lost.
    repeated = sync.run(d["owner"], d["home"], payload, d["engine"])
    assert set(repeated["previous_exports"]) == {e["id"] for e in initial["events"]}
    sync.finish(d["owner"], d["home"], payload | {"success": True}, d["engine"])
    state, secret = registration(d, takeover=True)
    configured = sync.configure(
        d["owner"],
        d["home"],
        {
            "enabled": False,
            "expected_revision": state["revision"],
            "breakfast_time": "08:00",
            "lunch_time": "12:00",
            "dinner_time": "18:00",
            "duration_minutes": 60,
        },
        d["engine"],
    )
    cleanup = {
        "writer_secret": secret,
        "run_id": str(uuid4()),
        "expected_revision": configured["revision"],
        "cleanup": True,
    }
    sync.run(d["owner"], d["home"], cleanup, d["engine"])
    sync.finish(
        d["owner"],
        d["home"],
        cleanup | {"success": True, "cleanup_complete": True},
        d["engine"],
    )
    with d["engine"].connect() as c:
        assert (
            c.execute(
                text(
                    "SELECT cardinality(exported_source_ids) FROM household_calendar_integrations WHERE household_id=:home"
                ),
                {"home": d["home"]},
            ).scalar_one()
            == 0
        )


def test_separate_destination_requires_released_writer_and_rotates_binding(data):
    d = data
    state, secret = registration(d)
    body = {
        "writer_id": str(uuid4()),
        "writer_secret": str(uuid4()) + str(uuid4()),
        "writer_label": "Phone",
        "expected_revision": state["revision"],
        "takeover_confirmed": True,
        "new_destination_confirmed": True,
    }
    with pytest.raises(HTTPException):
        sync.register(d["owner"], d["home"], body, d["engine"])
    disconnected = sync.disconnect(
        d["owner"], d["home"], secret, state["revision"], d["engine"]
    )
    body["expected_revision"] = disconnected["revision"]
    separate = sync.register(d["owner"], d["home"], body, d["engine"])
    assert separate["binding_id"] != state["binding_id"] and not separate["enabled"]


def test_household_deletion_revokes_in_flight_authority(data):
    d = data
    _state, payload = enable(d)
    sync.run(d["owner"], d["home"], payload, d["engine"])
    households.delete_household(d["owner"], d["home"], d["engine"])
    with pytest.raises(HTTPException):
        sync.authorize(d["owner"], d["home"], payload, d["engine"])
    sync.finish(d["owner"], d["home"], payload | {"success": True}, d["engine"])
    with d["engine"].connect() as c:
        row = (
            c.execute(
                text(
                    "SELECT enabled,last_success_at,run_id FROM household_calendar_integrations WHERE household_id=:home"
                ),
                {"home": d["home"]},
            )
            .mappings()
            .one()
        )
        assert (
            not row["enabled"]
            and row["last_success_at"] is None
            and row["run_id"] is None
        )
