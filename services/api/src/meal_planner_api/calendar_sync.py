"""Native calendar authority. No provider credentials or native calendar contents."""

import hashlib
import re
import secrets
from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import Engine, text

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household


def conflict(message: str):
    return HTTPException(
        409, detail={"code": "CALENDAR_SYNC_CONFLICT", "message": message}
    )


def ensure_integration(connection, household_id):
    # The household lock serializes lazy initialization for newly created homes.
    connection.execute(
        text("""INSERT INTO household_calendar_integrations (household_id,manager_membership_id)
        SELECT h.id, (SELECT m.id FROM household_members m WHERE m.household_id=h.id
            AND m.role='owner' AND m.removed_at IS NULL
            ORDER BY (m.user_id=h.created_by_user_id) DESC, m.joined_at, m.id LIMIT 1)
        FROM households h WHERE h.id=:home ON CONFLICT (household_id) DO NOTHING"""),
        {"home": household_id},
    )


def reconcile_manager(connection, household_id):
    """Called inside the administration household lock after role/removal changes."""
    ensure_integration(connection, household_id)
    connection.execute(
        text("""UPDATE household_calendar_integrations c SET
        manager_membership_id=(SELECT m.id FROM household_members m JOIN households h ON h.id=m.household_id
            WHERE m.household_id=c.household_id AND m.role='owner' AND m.removed_at IS NULL
            ORDER BY (m.user_id=h.created_by_user_id) DESC,m.joined_at,m.id LIMIT 1),
        enabled=false, revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE c.household_id=:home AND NOT EXISTS (SELECT 1 FROM household_members m
            WHERE m.id=c.manager_membership_id AND m.household_id=c.household_id
                AND m.role='owner' AND m.removed_at IS NULL)"""),
        {"home": household_id},
    )
    # Retain an outstanding run/digest until that writer acknowledges quiescence.
    # A timeout is NOT proof that an OS write stopped; never auto-expire its lock.


def _row(connection, home):
    row = (
        connection.execute(
            text("""SELECT c.*, m.user_id::text AS manager_user_id,
        m.id::text AS manager_id, u.display_name AS manager_name
        FROM household_calendar_integrations c
        LEFT JOIN household_members m ON m.id=c.manager_membership_id AND m.household_id=c.household_id
        LEFT JOIN users u ON u.id=m.user_id WHERE c.household_id=:home"""),
            {"home": home},
        )
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(404, detail="Household calendar connection not found")
    return dict(row)


def _summary(row, user):
    manager = row["manager_user_id"] == user.id
    return {
        "manager_membership_id": row["manager_id"],
        "manager_name": row["manager_name"],
        "is_manager": manager,
        "enabled": row["enabled"],
        "revision": row["revision"],
        "binding_id": str(row["binding_id"]),
        "writer_linked": bool(row["writer_digest"]),
        "recovery_required": row["scan_start"] is not None,
        "writer_label": row["writer_label"] if manager else None,
        "writer_id": str(row["writer_id"]) if manager and row["writer_id"] else None,
        "run_pending": row["run_id"] is not None,
        "last_success_at": row["last_success_at"],
        "breakfast_time": row["breakfast_time"],
        "lunch_time": row["lunch_time"],
        "dinner_time": row["dinner_time"],
        "duration_minutes": row["duration_minutes"],
    }


def _manager(row, user):
    if row["manager_user_id"] != user.id:
        raise HTTPException(
            403,
            detail={
                "code": "CALENDAR_MANAGER_REQUIRED",
                "message": "Only the calendar manager can change this connection.",
            },
        )


def _revision(row, revision):
    if row["revision"] != revision:
        raise conflict("Calendar settings changed. Refresh before trying again.")


def _writer(row, secret):
    digest = hashlib.sha256(secret.encode()).hexdigest()
    if not row["writer_digest"] or not secrets.compare_digest(
        row["writer_digest"], digest
    ):
        raise conflict(
            "This phone is not the linked calendar writer. Reconnect in Calendar sync."
        )


def get_status(user: CurrentUser, home: str, engine: Engine | None = None):
    with (engine or get_engine()).begin() as connection:
        household = lock_household(connection, home, user.id)
        reconcile_manager(connection, home)
        return _summary(_row(connection, home), user) | {
            "time_zone": household["time_zone"]
        }


def configure(user, home, payload, engine=None):
    with (engine or get_engine()).begin() as connection:
        household = lock_household(connection, home, user.id)
        reconcile_manager(connection, home)
        row = _row(connection, home)
        _manager(row, user)
        _revision(row, payload["expected_revision"])
        if row["run_id"]:
            raise conflict(
                "The linked phone has unfinished calendar work. Resume it before changing settings."
            )
        if payload["enabled"]:
            _writer(row, payload.get("writer_secret") or "")
        for slot in ("breakfast", "lunch", "dinner"):
            if not re.fullmatch(
                r"([01][0-9]|2[0-3]):[0-5][0-9]", payload[slot + "_time"]
            ):
                raise HTTPException(422, detail="Use a time in HH:MM format.")
        if payload["duration_minutes"] not in (15, 30, 60, 90, 120):
            raise HTTPException(422, detail="Choose a supported event length.")
        connection.execute(
            text("""UPDATE household_calendar_integrations SET enabled=:enabled,
            breakfast_time=:breakfast_time,lunch_time=:lunch_time,dinner_time=:dinner_time,
            duration_minutes=:duration_minutes,revision=revision+1,updated_at=CURRENT_TIMESTAMP
            WHERE household_id=:home"""),
            payload | {"home": home},
        )
        return _summary(_row(connection, home), user) | {
            "time_zone": household["time_zone"]
        }


def transfer(user, home, membership_id, revision, engine=None):
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, home, user.id, owner=True)
        reconcile_manager(connection, home)
        row = _row(connection, home)
        _revision(row, revision)
        if row["run_id"]:
            raise conflict(
                "Finish calendar work on the linked phone before transferring management."
            )
        eligible = connection.execute(
            text("""SELECT 1 FROM household_members WHERE id=:id
            AND household_id=:home AND role='owner' AND removed_at IS NULL"""),
            {"home": home, "id": membership_id},
        ).scalar_one_or_none()
        if not eligible:
            raise HTTPException(404, detail="Active owner not found")
        connection.execute(
            text("""UPDATE household_calendar_integrations SET manager_membership_id=:id,
            enabled=false,writer_digest=NULL,writer_id=NULL,writer_label=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP
            WHERE household_id=:home"""),
            {"home": home, "id": membership_id},
        )
        return _summary(_row(connection, home), user)


def register(user, home, payload, engine=None):
    with (engine or get_engine()).begin() as connection:
        household = lock_household(connection, home, user.id)
        reconcile_manager(connection, home)
        row = _row(connection, home)
        _manager(row, user)
        _revision(row, payload["expected_revision"])
        if row["run_id"]:
            raise conflict(
                "Unfinished calendar work must be resumed on the linked phone. A timeout cannot safely unlock it."
            )
        # The client persists the random secret BEFORE registration; a lost response
        # is recoverable by the same secret, without minting a second writer.
        secret = payload["writer_secret"]
        if len(secret) < 32 or len(secret) > 256:
            raise HTTPException(422, detail="Invalid device credential")
        digest = hashlib.sha256(secret.encode()).hexdigest()
        if row["writer_digest"] == digest:
            return _summary(row, user) | {"time_zone": household["time_zone"]}
        if row["writer_digest"] and not payload.get("takeover_confirmed"):
            raise conflict(
                "Another phone is linked. Explicitly confirm replacement before reconnecting."
            )
        connection.execute(
            text("""UPDATE household_calendar_integrations SET writer_digest=:digest,writer_id=:writer_id,
            writer_label=:label, enabled=false,revision=revision+1,updated_at=CURRENT_TIMESTAMP
            WHERE household_id=:home"""),
            {
                "home": home,
                "digest": digest,
                "writer_id": payload["writer_id"],
                "label": payload["writer_label"][:80],
            },
        )
        if payload.get("new_destination_confirmed"):
            if row["writer_digest"]:
                raise conflict(
                    "Disconnect the previous destination before starting a separate calendar."
                )
            connection.execute(
                text("""UPDATE household_calendar_integrations SET binding_id=:binding,
                exported_source_ids='{}',scan_start=NULL,scan_end=NULL,last_success_at=NULL
                WHERE household_id=:home"""),
                {"home": home, "binding": str(uuid4())},
            )
        # Recovery keeps binding_id and the possible-export ledger. Starting an
        # explicitly separate destination is allowed only after old writer release.
        return _summary(_row(connection, home), user) | {
            "time_zone": household["time_zone"]
        }


def disconnect(user, home, secret, revision, engine=None):
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, home, user.id)
        reconcile_manager(connection, home)
        row = _row(connection, home)
        _manager(row, user)
        _revision(row, revision)
        _writer(row, secret)
        if row["run_id"]:
            raise conflict(
                "Finish or retry the pending cleanup on the linked phone first."
            )
        connection.execute(
            text("""UPDATE household_calendar_integrations SET enabled=false,
            writer_digest=NULL,writer_id=NULL,writer_label=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP
            WHERE household_id=:home"""),
            {"home": home},
        )
        return _summary(_row(connection, home), user)


def resolve_start(day: date, clock: str, zone_name: str):
    zone = ZoneInfo(zone_name)
    wall = datetime.combine(day, time.fromisoformat(clock))
    # fold=0 selects the earlier instant on an overlap. On a gap its UTC
    # round-trip lands after the transition, shifting by precisely that gap.
    instant = wall.replace(tzinfo=zone, fold=0).astimezone(UTC)
    round_trip = instant.astimezone(zone).replace(tzinfo=None)
    if round_trip < wall:
        instant = wall.replace(tzinfo=zone, fold=1).astimezone(UTC)
    return instant


def project_entry(entry, row, zone, household_name):
    label = {"breakfast": "Breakfast", "lunch": "Lunch", "dinner": "Dinner"}[
        entry["meal_slot"]
    ]
    kind = entry["entry_type"]
    name = (
        entry["recipe_name"]
        if kind == "recipe"
        else {"leftovers": "Leftovers", "eating_out": "Eating out"}[kind]
    )
    if kind != "recipe" and entry["detail"]:
        name += " — " + entry["detail"]
    start = resolve_start(entry["planned_for"], row[entry["meal_slot"] + "_time"], zone)
    return {
        "id": str(entry["id"]),
        "planned_for": entry["planned_for"].isoformat(),
        "title": label + " · " + name,
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(minutes=row["duration_minutes"])).isoformat(),
        "time_zone": zone,
        "notes": household_name + "\nEdit this meal in Meal Planner.",
    }


def run(user, home, payload, engine=None):
    """Begin/resume a run and return one complete, bounded source snapshot."""
    with (engine or get_engine()).begin() as connection:
        household = lock_household(connection, home, user.id)
        reconcile_manager(connection, home)
        row = _row(connection, home)
        _manager(row, user)
        _writer(row, payload["writer_secret"])
        _revision(row, payload["expected_revision"])
        if not row["enabled"] and not payload.get("cleanup"):
            raise conflict("Calendar sync is disabled.")
        if row["run_id"] and str(row["run_id"]) != payload["run_id"]:
            raise conflict("Resume the pending calendar run before starting another.")
        connection.execute(
            text("""UPDATE household_calendar_integrations SET run_id=:run,
            run_revision=revision,run_cleanup=:cleanup,run_deadline=CURRENT_TIMESTAMP+INTERVAL '30 seconds'
            WHERE household_id=:home"""),
            {
                "home": home,
                "run": payload["run_id"],
                "cleanup": bool(payload.get("cleanup")),
            },
        )
        today = connection.execute(
            text("SELECT timezone(:zone,CURRENT_TIMESTAMP)::date"),
            {"zone": household["time_zone"]},
        ).scalar_one()
        first, last = today - timedelta(days=7), today + timedelta(days=90)
        scan_start = min(first, row["scan_start"] or first)
        scan_end = max(last, row["scan_end"] or last)
        connection.execute(
            text("""UPDATE household_calendar_integrations SET scan_start=:first,
            scan_end=:last WHERE household_id=:home"""),
            {"home": home, "first": scan_start, "last": scan_end},
        )
        known = payload.get("known_ids", [])
        if len(known) > 2000:
            raise HTTPException(
                422,
                detail="Too many tracked meals; keep or clean up calendar history before reconnecting.",
            )
        entries = (
            connection.execute(
                text("""SELECT e.id,e.planned_for,e.meal_slot,e.entry_type,e.detail,r.name AS recipe_name
            FROM household_meal_plan_entries e LEFT JOIN household_recipes r
            ON r.id=e.recipe_id AND r.household_id=e.household_id
            WHERE e.household_id=:home AND (e.planned_for BETWEEN :first AND :last
                OR e.id=ANY(CAST(:known AS uuid[]))) ORDER BY e.planned_for,e.meal_slot"""),
                {"home": home, "first": first, "last": last, "known": known},
            )
            .mappings()
            .all()
        )
        previous_exports = [str(value) for value in row["exported_source_ids"]]
        return {
            "previous_exports": previous_exports,
            "binding_id": str(row["binding_id"]),
            "revision": row["revision"],
            "run_id": payload["run_id"],
            "range_start": first.isoformat(),
            "range_end": last.isoformat(),
            "time_zone": household["time_zone"],
            "complete": True,
            "scan_start": scan_start.isoformat(),
            "scan_end": scan_end.isoformat(),
            "events": [
                project_entry(e, row, household["time_zone"], household["name"])
                for e in entries
            ],
        }


def authorize(user, home, payload, engine=None):
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, home, user.id)
        reconcile_manager(connection, home)
        row = _row(connection, home)
        _manager(row, user)
        _writer(row, payload["writer_secret"])
        _revision(row, payload["expected_revision"])
        if (
            str(row["run_id"]) != payload["run_id"]
            or row["run_revision"] != row["revision"]
        ):
            raise conflict("Calendar run authority changed. Reopen Calendar sync.")
        if not row["enabled"] and not payload.get("cleanup"):
            raise conflict("Calendar sync is disabled.")
        source_id = payload.get("source_id")
        if payload.get("operation") == "create" and source_id:
            exists = connection.execute(
                text("""SELECT 1 FROM household_meal_plan_entries
                WHERE id=:source AND household_id=:home"""),
                {"source": source_id, "home": home},
            ).scalar_one_or_none()
            if not exists:
                raise conflict(
                    "The planned meal changed. Refresh before syncing again."
                )
            # Record only an actual create intention, not every projected meal.
            # A denied/read-only permission or lost snapshot never claims exports.
            connection.execute(
                text("""UPDATE household_calendar_integrations SET exported_source_ids=
                ARRAY(SELECT DISTINCT source FROM unnest(exported_source_ids || ARRAY[CAST(:source AS uuid)]) source)
                WHERE household_id=:home"""),
                {"source": source_id, "home": home},
            )
        connection.execute(
            text("""UPDATE household_calendar_integrations SET
            run_deadline=CURRENT_TIMESTAMP+INTERVAL '30 seconds' WHERE household_id=:home"""),
            {"home": home},
        )
        return {"authorized": True, "valid_for_seconds": 30}


def finish(user, home, payload, engine=None):
    with (engine or get_engine()).begin() as connection:
        # Even a demoted/removed former writer may acknowledge that its already
        # issued OS operation settled. It cannot read data or obtain new authority.
        connection.execute(
            text("SELECT id FROM households WHERE id=:home FOR UPDATE"), {"home": home}
        )
        row = _row(connection, home)
        _writer(row, payload["writer_secret"])
        if str(row["run_id"]) != payload["run_id"]:
            raise conflict("No matching pending calendar run.")
        current = (
            row["revision"] == row["run_revision"] and row["manager_user_id"] == user.id
        )
        success = bool(
            payload["success"] and row["enabled"] and current and not row["run_cleanup"]
        )
        cleanup_complete = bool(
            payload.get("cleanup_complete") and row["run_cleanup"] and current
        )
        removed = payload.get("removed_source_ids", []) if current else []
        connection.execute(
            text("""UPDATE household_calendar_integrations SET run_id=NULL,run_revision=NULL,
            run_cleanup=false,run_deadline=NULL,
            exported_source_ids=CASE WHEN :cleanup THEN '{}'::uuid[] ELSE
                ARRAY(SELECT source FROM unnest(exported_source_ids) AS source
                    WHERE NOT source=ANY(CAST(:removed AS uuid[]))) END,
            last_success_at=CASE WHEN :success THEN CURRENT_TIMESTAMP ELSE last_success_at END
            WHERE household_id=:home"""),
            {
                "home": home,
                "success": success,
                "cleanup": cleanup_complete,
                "removed": removed,
            },
        )
        return {"finished": True}
