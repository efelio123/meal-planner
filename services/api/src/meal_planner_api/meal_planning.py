"""Household-scoped weekly plans and deliberate shopping review."""

import hashlib
import json
import re
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household

SLOTS = {"breakfast", "lunch", "dinner"}


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Household or planned meal not found")


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": code, "message": message})


def _date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise _invalid("Use a valid calendar date.") from error
    if parsed.isoformat() != value:
        raise _invalid("Use a valid calendar date in YYYY-MM-DD format.")
    return parsed


def _week_start(value: str) -> date:
    week_start = _date(value)
    if week_start.weekday() != 0:
        raise _invalid("The shopping review must start on a Monday.")
    return week_start


def _week_range(local_today: date, week_offset: int = 0) -> tuple[date, date]:
    monday = local_today - timedelta(days=local_today.weekday()) + timedelta(weeks=week_offset)
    return monday, monday + timedelta(days=6)


def _entry(row) -> dict:
    result = dict(row)
    result["planned_for"] = result["planned_for"].isoformat()
    return result


def _amount_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _normalized_label(value: str | None) -> str | None:
    if value is None:
        return None
    return re.sub(r"\s+", " ", value.strip()).lower()


def get_week(user: CurrentUser, household_id: str, week_offset: int = 0, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text("""
            WITH authorized_week AS (
                SELECT authorized_household.*,
                    (authorized_household.local_today
                        - (EXTRACT(ISODOW FROM authorized_household.local_today)::integer - 1)
                        + CAST(:week_offset AS integer) * 7)::date AS week_start
                FROM (
                    SELECT h.id, h.time_zone,
                        (timezone(h.time_zone, CURRENT_TIMESTAMP))::date AS local_today
                    FROM households h JOIN household_members hm ON hm.household_id = h.id
                    WHERE h.id = :household_id AND hm.user_id = :user_id
                      AND hm.removed_at IS NULL AND h.deleted_at IS NULL
                ) authorized_household
            )
            SELECT authorized_week.time_zone, authorized_week.local_today,
                authorized_week.week_start,
                entry.id::text AS id, entry.planned_for, entry.meal_slot,
                entry.recipe_id::text AS recipe_id, entry.edit_revision,
                recipe.name AS recipe_name, recipe.cover_kind, recipe.cover_emoji,
                recipe.archived_at,
                (SELECT count(*)::int FROM household_recipe_ingredients ingredient
                 WHERE ingredient.household_id = entry.household_id AND ingredient.recipe_id = recipe.id) AS ingredient_count
            FROM authorized_week
            LEFT JOIN household_meal_plan_entries entry
                ON entry.household_id = authorized_week.id
                AND entry.planned_for BETWEEN authorized_week.week_start AND authorized_week.week_start + 6
            LEFT JOIN household_recipes recipe
                ON recipe.household_id = entry.household_id AND recipe.id = entry.recipe_id
            ORDER BY entry.planned_for,
                array_position(ARRAY['breakfast','lunch','dinner'], entry.meal_slot)
        """), {"household_id": household_id, "user_id": user.id, "week_offset": week_offset}).mappings().all()
        if not rows:
            raise _not_found()
        household = rows[0]
        today = household["local_today"]
        monday = household["week_start"]
        sunday = monday + timedelta(days=6)
    return {
        "time_zone": household["time_zone"],
        "local_today": today.isoformat(),
        "week_start": monday.isoformat(),
        "week_end": sunday.isoformat(),
        "week_offset": week_offset,
        "entries": [_entry(row) for row in rows if row["id"] is not None],
    }


def _validate_recipe(connection, household_id: str, recipe_id: str) -> None:
    recipe = connection.execute(text("""
        SELECT archived_at FROM household_recipes WHERE household_id = :household_id AND id = :recipe_id
    """), {"household_id": household_id, "recipe_id": recipe_id}).mappings().one_or_none()
    if recipe is None:
        raise _not_found()
    if recipe["archived_at"] is not None:
        raise _conflict("MEAL_PLAN_RECIPE_ARCHIVED", "Choose an active recipe for a planned meal.")


def create_entry(user: CurrentUser, household_id: str, planned_for: str, meal_slot: str, recipe_id: str, engine: Engine | None = None) -> dict:
    day = _date(planned_for)
    if meal_slot not in SLOTS:
        raise _invalid("Choose breakfast, lunch, or dinner.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        _validate_recipe(connection, household_id, recipe_id)
        try:
            row = connection.execute(text("""
                INSERT INTO household_meal_plan_entries (household_id, planned_for, meal_slot, recipe_id, created_by_user_id)
                VALUES (:household_id, :planned_for, :meal_slot, :recipe_id, :user_id)
                RETURNING id::text AS id, planned_for, meal_slot, recipe_id::text AS recipe_id, edit_revision
            """), {"household_id": household_id, "planned_for": day, "meal_slot": meal_slot, "recipe_id": recipe_id, "user_id": user.id}).mappings().one()
        except IntegrityError as error:
            if getattr(getattr(error, "orig", None), "sqlstate", None) == "23505":
                raise _conflict("MEAL_PLAN_SLOT_OCCUPIED", "That day and meal already has a planned recipe.") from error
            raise
        return _entry(row)


def update_entry(user: CurrentUser, household_id: str, entry_id: str, planned_for: str, meal_slot: str, recipe_id: str, expected_revision: int, engine: Engine | None = None) -> dict:
    day = _date(planned_for)
    if meal_slot not in SLOTS:
        raise _invalid("Choose breakfast, lunch, or dinner.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        current = connection.execute(text("""
            SELECT edit_revision, recipe_id::text AS recipe_id FROM household_meal_plan_entries
            WHERE household_id = :household_id AND id = :entry_id FOR UPDATE
        """), {"household_id": household_id, "entry_id": entry_id}).mappings().one_or_none()
        if current is None:
            raise _not_found()
        if current["edit_revision"] != expected_revision:
            raise _conflict("MEAL_PLAN_REVISION_CONFLICT", "This planned meal changed on another device. Refresh before saving.")
        if current["recipe_id"] != recipe_id:
            _validate_recipe(connection, household_id, recipe_id)
        try:
            row = connection.execute(text("""
                UPDATE household_meal_plan_entries
                SET planned_for = :planned_for, meal_slot = :meal_slot, recipe_id = :recipe_id,
                    edit_revision = edit_revision + 1, updated_at = CURRENT_TIMESTAMP
                WHERE household_id = :household_id AND id = :entry_id
                RETURNING id::text AS id, planned_for, meal_slot, recipe_id::text AS recipe_id, edit_revision
            """), {"household_id": household_id, "entry_id": entry_id, "planned_for": day, "meal_slot": meal_slot, "recipe_id": recipe_id}).mappings().one()
        except IntegrityError as error:
            if getattr(getattr(error, "orig", None), "sqlstate", None) == "23505":
                raise _conflict("MEAL_PLAN_SLOT_OCCUPIED", "That day and meal already has a planned recipe.") from error
            raise
        return _entry(row)


def delete_entry(user: CurrentUser, household_id: str, entry_id: str, expected_revision: int, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        deleted = connection.execute(text("""
            DELETE FROM household_meal_plan_entries
            WHERE household_id = :household_id AND id = :entry_id AND edit_revision = :revision
            RETURNING id
        """), {"household_id": household_id, "entry_id": entry_id, "revision": expected_revision}).scalar_one_or_none()
        if deleted is None:
            exists = connection.execute(text("SELECT 1 FROM household_meal_plan_entries WHERE household_id=:household_id AND id=:entry_id"), {"household_id": household_id, "entry_id": entry_id}).scalar_one_or_none()
            if exists is None:
                raise _not_found()
            raise _conflict("MEAL_PLAN_REVISION_CONFLICT", "This planned meal changed on another device. Refresh before removing it.")


def _review_snapshot(connection, household_id: str, week_start: date) -> dict:
    week_end = week_start + timedelta(days=6)
    rows = connection.execute(text("""
        SELECT entry.id::text AS entry_id, entry.planned_for, entry.meal_slot,
            recipe.id::text AS recipe_id, recipe.name AS recipe_name, recipe.edit_revision,
            ingredient.id::text AS ingredient_id, ingredient.catalog_item_id::text AS catalog_item_id,
            item.name AS catalog_item_name,
            ingredient.amount, ingredient.recipe_unit_code, ingredient.recipe_unit_dimension,
            units.label AS unit_label, ingredient.custom_unit_label, ingredient.note
        FROM household_meal_plan_entries entry
        JOIN household_recipes recipe ON recipe.household_id=entry.household_id AND recipe.id=entry.recipe_id
        JOIN household_recipe_ingredients ingredient ON ingredient.household_id=recipe.household_id AND ingredient.recipe_id=recipe.id
        JOIN catalog_items item ON item.household_id=ingredient.household_id AND item.id=ingredient.catalog_item_id
        LEFT JOIN recipe_measurement_units units ON units.code=ingredient.recipe_unit_code AND units.dimension=ingredient.recipe_unit_dimension
        WHERE entry.household_id=:household_id AND entry.planned_for BETWEEN :week_start AND :week_end
        ORDER BY entry.planned_for,
            array_position(ARRAY['breakfast','lunch','dinner'], entry.meal_slot),
            recipe.name, ingredient.position
    """), {"household_id": household_id, "week_start": week_start, "week_end": week_end}).mappings().all()
    shopping = connection.execute(text("""
        SELECT id::text AS id, name, lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) AS normalized_name,
            catalog_item_id::text AS catalog_item_id, amount, recipe_unit_code, recipe_unit_dimension,
            custom_unit_label, meal_plan_request_id::text AS meal_plan_request_id
        FROM shopping_list_items WHERE household_id=:household_id
        ORDER BY id
    """), {"household_id": household_id}).mappings().all()

    grouped: dict[tuple, dict] = {}
    sources: list[dict] = []
    for row in rows:
        known_amount = row["amount"] is not None
        custom_unit = _normalized_label(row["custom_unit_label"])
        identity = (row["catalog_item_id"], row["recipe_unit_code"], row["recipe_unit_dimension"], custom_unit, known_amount)
        key = json.dumps(identity, separators=(",", ":"))
        need = grouped.setdefault(key, {
            "need_key": key,
            "catalog_item_id": row["catalog_item_id"],
            "name": row["catalog_item_name"],
            "amount": Decimal(0) if known_amount else None,
            "recipe_unit_code": row["recipe_unit_code"],
            "recipe_unit_dimension": row["recipe_unit_dimension"],
            "unit_label": row["unit_label"] or row["custom_unit_label"],
            "custom_unit_label": row["custom_unit_label"],
            "sources": [],
        })
        if known_amount:
            need["amount"] += Decimal(row["amount"])
        source = {
            "planned_for": row["planned_for"].isoformat(),
            "meal_slot": row["meal_slot"],
            "recipe_name": row["recipe_name"],
            "amount": _amount_text(Decimal(row["amount"])) if row["amount"] is not None else None,
            "unit_label": row["unit_label"] or row["custom_unit_label"],
            "note": row["note"],
        }
        need["sources"].append(source)
        sources.append({"entry_id": row["entry_id"], "recipe_id": row["recipe_id"], "recipe_revision": row["edit_revision"], "ingredient_id": row["ingredient_id"], "catalog_item_name": row["catalog_item_name"], "amount": _amount_text(Decimal(row["amount"])) if row["amount"] is not None else None, "unit": identity})

    needs = []
    for need in grouped.values():
        exact = [item for item in shopping if item["catalog_item_id"] == need["catalog_item_id"]
                 and item["recipe_unit_code"] == need["recipe_unit_code"]
                 and item["recipe_unit_dimension"] == need["recipe_unit_dimension"]
                 and _normalized_label(item["custom_unit_label"]) == _normalized_label(need["custom_unit_label"])]
        possible = [item for item in shopping if item["catalog_item_id"] is None and item["normalized_name"] == _normalized_label(need["name"])]
        need["existing_matches"] = [{"kind": "exact", "item_id": item["id"], "name": item["name"]} for item in exact]
        need["existing_matches"].extend({"kind": "possible", "item_id": item["id"], "name": item["name"]} for item in possible)
        need["default_selected"] = not exact and not possible
        if need["amount"] is not None:
            need["amount"] = _amount_text(need["amount"])
        needs.append(need)
    needs.sort(key=lambda item: (item["name"].casefold(), item["unit_label"] or "", item["need_key"]))
    canonical = json.dumps({"week_start": week_start.isoformat(), "sources": sources, "shopping": [dict(row) for row in shopping]}, sort_keys=True, default=str, separators=(",", ":"))
    review_token = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {"week_start": week_start.isoformat(), "week_end": week_end.isoformat(), "review_token": review_token, "needs": needs}


def get_shopping_review(user: CurrentUser, household_id: str, week_start: str, engine: Engine | None = None) -> dict:
    monday = _week_start(week_start)
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        return _review_snapshot(connection, household_id, monday)


def add_reviewed_needs(user: CurrentUser, household_id: str, week_start: str, review_token: str, request_id: str, selected_need_keys: list[str], engine: Engine | None = None) -> dict:
    monday = _week_start(week_start)
    keys = sorted(set(selected_need_keys))
    if not keys:
        raise _invalid("Select at least one item to add.")
    request_hash = hashlib.sha256(json.dumps({"week_start": monday.isoformat(), "review_token": review_token, "keys": keys}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        existing = connection.execute(text("""
            SELECT request_hash, created_by_user_id::text AS created_by_user_id
            FROM shopping_list_meal_plan_requests
            WHERE household_id=:household_id AND request_id=:request_id
        """), {"household_id": household_id, "request_id": request_id}).mappings().one_or_none()
        if existing is not None:
            if existing["created_by_user_id"] != user.id or existing["request_hash"] != request_hash:
                raise _conflict("MEAL_PLAN_REQUEST_REUSED", "This request ID was already used for a different selection.")
            inserted = connection.execute(text("""
                SELECT id::text AS id, name FROM shopping_list_items
                WHERE household_id=:household_id AND meal_plan_request_id=:request_id
                ORDER BY created_at, id
            """), {"household_id": household_id, "request_id": request_id}).mappings().all()
            return {"items": [dict(row) for row in inserted], "replayed": True}

        snapshot = _review_snapshot(connection, household_id, monday)
        if snapshot["review_token"] != review_token:
            raise _conflict("MEAL_PLAN_REVIEW_STALE", "The plan or Shopping list changed. Refresh this review before adding items.")
        available = {item["need_key"]: item for item in snapshot["needs"]}
        if any(key not in available for key in keys):
            raise _conflict("MEAL_PLAN_REVIEW_STALE", "The selected needs changed. Refresh this review before adding items.")
        connection.execute(text("""
            INSERT INTO shopping_list_meal_plan_requests (household_id, request_id, created_by_user_id, request_hash)
            VALUES (:household_id, :request_id, :user_id, :request_hash)
        """), {"household_id": household_id, "request_id": request_id, "user_id": user.id, "request_hash": request_hash})
        created = []
        for key in keys:
            need = available[key]
            unit_code = need["recipe_unit_code"]
            unit_dimension = need["recipe_unit_dimension"]
            custom_unit = need["custom_unit_label"]
            list_item = connection.execute(text("""
                INSERT INTO shopping_list_items (
                    household_id, shopping_list_id, name, created_by_user_id, catalog_item_id, amount,
                    recipe_unit_code, recipe_unit_dimension, custom_unit_label,
                    meal_plan_request_id, meal_plan_need_key
                )
                SELECT :household_id, list.id, :name, :user_id, :catalog_item_id, :amount,
                    :unit_code, :unit_dimension, :custom_unit, :request_id, :need_key
                FROM shopping_lists list WHERE list.household_id=:household_id
                RETURNING id::text AS id, name
            """), {"household_id": household_id, "name": need["name"], "user_id": user.id,
                    "catalog_item_id": need["catalog_item_id"], "amount": need["amount"],
                    "unit_code": unit_code, "unit_dimension": unit_dimension,
                    "custom_unit": custom_unit, "request_id": request_id, "need_key": key}).mappings().one_or_none()
            if list_item is None:
                raise _not_found()
            created.append(dict(list_item))
        return {"items": created, "replayed": False}
