"""Limited native-widget authority. No Clerk token is stored or returned here."""

import hashlib
import json
import re
import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household
from meal_planner_api.permissions import access_snapshot, require_permissions
from meal_planner_api.shopping_lists import _ITEM_SELECT, _serialize, set_checked

MAX_SHOPPING_ROWS = 40
MAX_MEALS = 500


def reconnect():
    return HTTPException(
        401,
        {
            "code": "WIDGET_RECONNECT_REQUIRED",
            "message": "Reconnect widgets in Meal Planner.",
        },
    )


def digest(secret):
    return hashlib.sha256(secret.encode()).hexdigest()


def device_result(row):
    return (
        {"device_id": str(row["id"])}
        | {key: str(row[key]) for key in ("generation", "household_id", "user_id")}
        | {"expires_at": row["expires_at"], "week_start": row["week_start"]}
    )


def register(user, home, device_id, payload, engine=None):
    secret = payload["secret"]
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret):
        raise HTTPException(422, "Invalid widget credential.")
    with (engine or get_engine()).begin() as c:
        lock_household(c, home, user.id)
        grants = access_snapshot(c, home, user.id)
        values = {
            "id": device_id,
            "home": home,
            "user": user.id,
            "member": grants["membership_id"],
            "generation": payload["generation"],
            "digest": digest(secret),
            "revision": grants["permissions_revision"],
            "role": grants["role"],
            "weekday": payload["week_start"],
        }
        # Atomic insert-before-validation also fences concurrent attempts to bind the
        # same identifier to different households. Never update an unchecked conflict.
        try:
            with c.begin_nested():
                c.execute(
                    text("""INSERT INTO widget_devices(id,household_id,user_id,membership_id,generation,
                    secret_digest,permissions_revision,registered_role,week_start,expires_at)
                    VALUES (:id,:home,:user,:member,:generation,:digest,:revision,:role,:weekday,CURRENT_TIMESTAMP+INTERVAL '7 days')
                    ON CONFLICT(id) DO NOTHING"""),
                    values,
                )
        except IntegrityError as error:
            if getattr(error.orig, "sqlstate", None) == "23505":
                raise HTTPException(
                    409, "Widget credential is already bound."
                ) from error
            raise
        row = (
            c.execute(
                text("SELECT * FROM widget_devices WHERE id=:id FOR UPDATE"),
                {"id": device_id},
            )
            .mappings()
            .one()
        )
        if row and (str(row["user_id"]) != user.id or str(row["household_id"]) != home):
            raise HTTPException(409, "Widget device identifier is already bound.")
        if row and (
            row["revoked_at"]
            or str(row["generation"]) != payload["generation"]
            or not secrets.compare_digest(row["secret_digest"], digest(secret))
            or row["permissions_revision"] != grants["permissions_revision"]
            or row["registered_role"] != grants["role"]
            or str(row["membership_id"]) != grants["membership_id"]
        ):
            raise HTTPException(
                409,
                {
                    "code": "WIDGET_RECONNECT_REQUIRED",
                    "message": "Reconnect this widget binding.",
                },
            )
        row = (
            c.execute(
                text("""UPDATE widget_devices SET week_start=:weekday,
            expires_at=CURRENT_TIMESTAMP+INTERVAL '7 days',updated_at=CURRENT_TIMESTAMP
            WHERE id=:id RETURNING *"""),
                values,
            )
            .mappings()
            .one()
        )
        return device_result(row)


def _token(header):
    prefix, _, secret = (header or "").partition(" ")
    if prefix != "Widget" or not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret):
        raise reconnect()
    return digest(secret)


def authorize(c, header):
    fingerprint = _token(header)
    candidate = (
        c.execute(
            text(
                "SELECT household_id::text, user_id::text FROM widget_devices WHERE secret_digest=:digest"
            ),
            {"digest": fingerprint},
        )
        .mappings()
        .one_or_none()
    )
    if not candidate:
        raise reconnect()
    # Consistent lock order with all app mutations and membership/permission changes.
    try:
        household = lock_household(c, candidate["household_id"], candidate["user_id"])
        grants = access_snapshot(c, candidate["household_id"], candidate["user_id"])
    except HTTPException as error:
        raise reconnect() from error
    row = (
        c.execute(
            text("""SELECT d.*,u.normalized_email,u.display_name FROM widget_devices d
        JOIN users u ON u.id=d.user_id WHERE secret_digest=:digest AND u.deleted_at IS NULL
        FOR UPDATE OF d"""),
            {"digest": fingerprint},
        )
        .mappings()
        .one_or_none()
    )
    now = c.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one()
    if (
        not row
        or row["revoked_at"]
        or row["expires_at"] <= now
        or str(row["membership_id"]) != grants["membership_id"]
        or row["permissions_revision"] != grants["permissions_revision"]
        or row["registered_role"] != grants["role"]
    ):
        raise reconnect()
    user = CurrentUser(
        str(row["user_id"]), row["normalized_email"], row["display_name"]
    )
    return row, user, household, grants


def revoke(header, engine=None):
    # A removed/expired member can still revoke their own credential; never grants read/write.
    with (engine or get_engine()).begin() as c:
        c.execute(
            text("""UPDATE widget_devices SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),
            updated_at=CURRENT_TIMESTAMP WHERE secret_digest=:digest"""),
            {"digest": _token(header)},
        )


def remove_device(user, home, device_id, engine=None):
    with (engine or get_engine()).begin() as c:
        lock_household(c, home, user.id)
        c.execute(
            text("""UPDATE widget_devices SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),
            updated_at=CURRENT_TIMESTAMP WHERE id=:id AND household_id=:home AND user_id=:user"""),
            {"id": device_id, "home": home, "user": user.id},
        )


def summary(header, engine=None):
    with (engine or get_engine()).begin() as c:
        device, user, household, grants = authorize(c, header)
        home = str(device["household_id"])
        count = c.execute(
            text(
                "SELECT count(*) FROM shopping_list_items WHERE household_id=:home AND is_checked IS FALSE"
            ),
            {"home": home},
        ).scalar_one()
        rows = (
            c.execute(
                text(
                    _ITEM_SELECT
                    + " AND item.is_checked IS FALSE ORDER BY item.created_at DESC,item.id LIMIT :limit"
                ),
                {"household_id": home, "user_id": user.id, "limit": MAX_SHOPPING_ROWS},
            )
            .mappings()
            .all()
        )
        items = []
        for row in rows:
            item = _serialize(row)
            items.append(
                {
                    key: item[key]
                    for key in (
                        "id",
                        "name",
                        "amount",
                        "unit_label",
                        "store_name",
                        "check_version",
                    )
                }
            )
        today = c.execute(
            text("SELECT timezone(:zone,CURRENT_TIMESTAMP)::date"),
            {"zone": household["time_zone"]},
        ).scalar_one()
        js_weekday = (today.weekday() + 1) % 7
        first = today - timedelta(days=(js_weekday - device["week_start"]) % 7)
        meals = (
            c.execute(
                text("""SELECT e.id::text,e.planned_for,e.meal_slot,e.entry_type,e.detail,
            e.recipe_id::text,r.name AS recipe_name FROM household_meal_plan_entries e
            LEFT JOIN household_recipes r ON r.id=e.recipe_id AND r.household_id=e.household_id
            WHERE e.household_id=:home AND e.planned_for BETWEEN :first AND :last
            ORDER BY e.planned_for,e.meal_slot,e.id LIMIT :limit"""),
                {
                    "home": home,
                    "first": first,
                    "last": first + timedelta(days=6),
                    "limit": MAX_MEALS + 1,
                },
            )
            .mappings()
            .all()
        )
        days = []
        for offset in range(7):
            day = first + timedelta(days=offset)
            entries = []
            for meal in meals[:MAX_MEALS]:
                if meal["planned_for"] != day:
                    continue
                title = (
                    meal["recipe_name"]
                    if meal["entry_type"] == "recipe"
                    else {"leftovers": "Leftovers", "eating_out": "Eating out"}[
                        meal["entry_type"]
                    ]
                )
                if meal["entry_type"] != "recipe" and meal["detail"]:
                    title += " — " + meal["detail"]
                entries.append(
                    {
                        "id": meal["id"],
                        "slot": meal["meal_slot"],
                        "title": title,
                        "recipe_id": meal["recipe_id"],
                    }
                )
            days.append({"date": day.isoformat(), "meals": entries})
        generated = c.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one()
        return {
            "schema_version": 1,
            "device_id": str(device["id"]),
            "generation": str(device["generation"]),
            "user_id": user.id,
            "household_id": home,
            "household_name": household["name"],
            "time_zone": household["time_zone"],
            "generated_at": generated,
            "expires_at": device["expires_at"],
            "can_check": "shopping.check" in grants["permissions"],
            "shopping": {
                "unpurchased_count": count,
                "items": items,
                "has_more": count > len(items),
            },
            "plan": {
                "start_date": first.isoformat(),
                "end_date": (first + timedelta(days=6)).isoformat(),
                "days": days,
                "truncated": len(meals) > MAX_MEALS,
            },
        }


def check_item(header, payload, engine=None):
    with (engine or get_engine()).begin() as c:
        device, user, _, _ = authorize(c, header)
        home = str(device["household_id"])
        require_permissions(c, home, user.id, "shopping.check")
        if payload["generation"] != str(device["generation"]):
            raise reconnect()
        request_digest = digest(
            json.dumps(payload, sort_keys=True, separators=(",", ":"))
        )
        previous = (
            c.execute(
                text(
                    "SELECT request_digest,result FROM widget_operations WHERE device_id=:device AND operation_id=:operation"
                ),
                {"device": str(device["id"]), "operation": payload["operation_id"]},
            )
            .mappings()
            .one_or_none()
        )
        if previous:
            if not secrets.compare_digest(previous["request_digest"], request_digest):
                raise HTTPException(
                    409,
                    {
                        "code": "WIDGET_OPERATION_REUSED",
                        "message": "This operation ID was already used.",
                    },
                )
            return previous["result"]
        row = (
            c.execute(
                text(
                    "SELECT check_version FROM shopping_list_items WHERE household_id=:home AND id=:id FOR UPDATE"
                ),
                {"home": home, "id": payload["item_id"]},
            )
            .mappings()
            .one_or_none()
        )
        if not row:
            outcome = "gone"
        elif row["check_version"] != payload["expected_version"]:
            outcome = "conflict"
        else:
            set_checked(c, user, home, payload["item_id"], payload["is_checked"])
            outcome = "confirmed"
        result = {
            "operation_id": payload["operation_id"],
            "generation": payload["generation"],
            "status": outcome,
        }
        c.execute(
            text(
                "INSERT INTO widget_operations(device_id,operation_id,request_digest,result) VALUES (:device,:operation,:digest,CAST(:result AS jsonb))"
            ),
            {
                "device": str(device["id"]),
                "operation": payload["operation_id"],
                "digest": request_digest,
                "result": json.dumps(result),
            },
        )
        return result
