"""Household-shared recipe operations."""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import Engine, text

from meal_planner_api.catalog import _clean_emoji
from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Recipe not found")


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": code, "message": message})


def _clean_name(value: str) -> tuple[str, str]:
    name = re.sub(r"\s+", " ", value.strip())
    if not name or len(name) > 160:
        raise _invalid("Recipe name must contain between 1 and 160 characters.")
    if any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in name):
        raise _invalid("Recipe name cannot contain control characters.")
    return name, name.lower()


def _clean_text(value: str | None, *, limit: int, label: str) -> str | None:
    if value is None:
        return None
    clean = value.strip()
    if len(clean) > limit:
        raise _invalid(f"{label} must be {limit} characters or fewer.")
    if any(ord(character) < 32 and character not in "\n\r\t" or 127 <= ord(character) <= 159 for character in clean):
        raise _invalid(f"{label} cannot contain control characters.")
    return clean or None


def _clean_source_url(value: str | None) -> str | None:
    source = _clean_text(value, limit=2048, label="Source link")
    if source is None:
        return None
    try:
        parsed = urlsplit(source)
    except ValueError as error:
        raise _invalid("Source link must be a valid http or https URL.") from error
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise _invalid("Source link must be a valid http or https URL.")
    return source


def _parse_amount(value: str | None) -> Decimal | None:
    if value is None or not value.strip():
        return None
    amount_text = value.strip()
    try:
        if re.fullmatch(r"\d+\s+\d+/\d+", amount_text):
            whole, fraction = amount_text.split(maxsplit=1)
            numerator, denominator = fraction.split("/", maxsplit=1)
            parsed = Decimal(whole) + Decimal(numerator) / Decimal(denominator)
        elif re.fullmatch(r"\d+/\d+", amount_text):
            numerator, denominator = amount_text.split("/", maxsplit=1)
            parsed = Decimal(numerator) / Decimal(denominator)
        elif re.fullmatch(r"\d+(?:\.\d+)?", amount_text):
            parsed = Decimal(amount_text)
        else:
            raise _invalid("Amount must be a positive number or fraction. Put ranges in the note.")
    except (ArithmeticError, InvalidOperation) as error:
        raise _invalid("Amount must be a positive number or fraction. Put ranges in the note.") from error
    if not parsed.is_finite() or parsed <= 0:
        raise _invalid("Amount must be greater than zero. Put ranges in the note.")
    try:
        rounded = parsed.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    except InvalidOperation as error:
        raise _invalid("Amount is too large or precise to save.") from error
    if rounded >= Decimal(1000000000000):
        raise _invalid("Amount is too large.")
    return rounded


_RECIPE_SELECT_BASE = """
    SELECT r.id::text AS id, r.household_id::text AS household_id,
        r.name, r.cover_kind, r.cover_emoji, r.servings, r.prep_minutes,
        r.cook_minutes, r.notes, r.source_url, r.edit_revision,
        r.created_at, r.updated_at, r.archived_at,
        (SELECT count(*)::int FROM household_recipe_ingredients i
         WHERE i.household_id = r.household_id AND i.recipe_id = r.id) AS ingredient_count
    FROM household_recipes r
    JOIN households h ON h.id = r.household_id
    JOIN household_members hm ON hm.household_id = h.id
    WHERE r.household_id = :household_id
      AND hm.user_id = :user_id AND hm.removed_at IS NULL AND h.deleted_at IS NULL
"""
_RECIPE_SELECT = _RECIPE_SELECT_BASE + "AND r.id = :recipe_id\n"


def _validate_cover(values: dict) -> tuple[str, str | None]:
    kind = values.get("cover_kind", "initials")
    emoji = _clean_emoji(values.get("cover_emoji"))
    if kind not in {"initials", "emoji"}:
        raise _invalid("Recipe cover must use initials or one emoji.")
    if kind == "emoji" and emoji is None:
        raise _invalid("Choose an emoji or use initials for the recipe cover.")
    if kind == "initials":
        emoji = None
    return kind, emoji


def _validate_ingredients(connection, household_id: str, ingredients: list[dict]) -> list[dict]:
    if not ingredients:
        raise _invalid("A recipe needs at least one Food Catalog ingredient.")
    prepared: list[dict] = []
    for position, ingredient in enumerate(ingredients):
        catalog_item_id = str(ingredient["catalog_item_id"])
        catalog_item = connection.execute(text("""
            SELECT item_type, archived_at FROM catalog_items
            WHERE household_id = :household_id AND id = :item_id
        """), {"household_id": household_id, "item_id": catalog_item_id}).mappings().one_or_none()
        if catalog_item is None:
            raise _not_found()
        if catalog_item["archived_at"] is not None:
            raise _conflict("RECIPE_CATALOG_ITEM_ARCHIVED", "That Food Catalog item is archived. Refresh and choose an active item.")
        if catalog_item["item_type"] != "food":
            raise _invalid("Recipes can link only to Food Catalog items.")

        unit_code = ingredient.get("unit_code")
        unit_dimension = None
        if unit_code is not None:
            unit_dimension = connection.execute(text("""
                SELECT dimension FROM recipe_measurement_units WHERE code = :code
            """), {"code": unit_code}).scalar_one_or_none()
            if unit_dimension is None:
                raise _invalid("Choose a supported recipe measurement unit.")
        custom_unit = _clean_text(ingredient.get("custom_unit_label"), limit=40, label="Custom unit")
        if unit_code is not None and custom_unit is not None:
            raise _invalid("Choose a built-in or custom unit, not both.")
        prepared.append({
            "catalog_item_id": catalog_item_id,
            "position": position,
            "amount": _parse_amount(ingredient.get("amount")),
            "unit_code": unit_code,
            "unit_dimension": unit_dimension,
            "custom_unit_label": custom_unit,
            "note": _clean_text(ingredient.get("note"), limit=1000, label="Ingredient note"),
        })
    return prepared


def _prepare_steps(steps: list[str] | None) -> list[str]:
    prepared: list[str] = []
    for step in steps or []:
        clean = _clean_text(step, limit=4000, label="Direction")
        if clean:
            prepared.append(clean)
    return prepared


def _insert_children(connection, household_id: str, recipe_id: str, ingredients: list[dict], steps: list[str]) -> None:
    for ingredient in ingredients:
        connection.execute(text("""
            INSERT INTO household_recipe_ingredients (
                household_id, recipe_id, catalog_item_id, position, amount,
                recipe_unit_code, recipe_unit_dimension, custom_unit_label, note
            ) VALUES (
                :household_id, :recipe_id, :catalog_item_id, :position, :amount,
                :unit_code, :unit_dimension, :custom_unit_label, :note
            )
        """), {**ingredient, "household_id": household_id, "recipe_id": recipe_id})
    for position, instruction in enumerate(steps):
        connection.execute(text("""
            INSERT INTO household_recipe_steps (household_id, recipe_id, position, instruction)
            VALUES (:household_id, :recipe_id, :position, :instruction)
        """), {"household_id": household_id, "recipe_id": recipe_id, "position": position, "instruction": instruction})


def _read_recipe_children(connection, household_id: str, recipe_id: str) -> tuple[list[dict], list[dict]]:
    ingredients = connection.execute(text("""
        SELECT i.id::text AS id, i.catalog_item_id::text AS catalog_item_id,
            ci.name AS catalog_item_name, c.emoji AS category_emoji,
            i.position, i.amount, i.recipe_unit_code AS unit_code,
            units.label AS unit_label, i.custom_unit_label, i.note
        FROM household_recipe_ingredients i
        JOIN catalog_items ci ON ci.household_id = i.household_id AND ci.id = i.catalog_item_id
        LEFT JOIN catalog_categories c ON c.household_id = ci.household_id AND c.id = ci.category_id
        LEFT JOIN recipe_measurement_units units
            ON units.code = i.recipe_unit_code AND units.dimension = i.recipe_unit_dimension
        WHERE i.household_id = :household_id AND i.recipe_id = :recipe_id
        ORDER BY i.position, i.id
    """), {"household_id": household_id, "recipe_id": recipe_id}).mappings().all()
    steps = connection.execute(text("""
        SELECT id::text AS id, position, instruction
        FROM household_recipe_steps
        WHERE household_id = :household_id AND recipe_id = :recipe_id
        ORDER BY position, id
    """), {"household_id": household_id, "recipe_id": recipe_id}).mappings().all()
    return [dict(row) for row in ingredients], [dict(row) for row in steps]


def _serialize_recipe(connection, row) -> dict:
    result = dict(row)
    ingredients, steps = _read_recipe_children(connection, result["household_id"], result["id"])
    result["ingredients"] = ingredients
    result["steps"] = steps
    return result


def list_recipes(
    user: CurrentUser,
    household_id: str,
    *,
    archived: bool = False,
    search: str | None = None,
    engine: Engine | None = None,
) -> list[dict]:
    where_archive = "r.archived_at IS NOT NULL" if archived else "r.archived_at IS NULL"
    parameters: dict[str, object] = {"household_id": household_id, "user_id": user.id}
    where_search = ""
    clean_search = re.sub(r"\s+", " ", search.strip()).lower() if search and search.strip() else ""
    if clean_search:
        where_search = "AND r.normalized_name LIKE '%' || :search || '%'"
        parameters["search"] = clean_search
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text(f"""
            SELECT r.id::text AS id, r.household_id::text AS household_id,
                r.name, r.cover_kind, r.cover_emoji, r.servings, r.prep_minutes,
                r.cook_minutes, r.notes, r.source_url, r.edit_revision,
                r.created_at, r.updated_at, r.archived_at,
                (SELECT count(*)::int FROM household_recipe_ingredients i
                 WHERE i.household_id = r.household_id AND i.recipe_id = r.id) AS ingredient_count
            FROM household_recipes r
            JOIN households h ON h.id = r.household_id
            JOIN household_members hm ON hm.household_id = h.id
            WHERE r.household_id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
              AND {where_archive} {where_search}
            ORDER BY r.normalized_name, r.id
        """), parameters).mappings().all()
        if not rows:
            lock_household(connection, household_id, user.id)
    return [dict(row) for row in rows]


def get_recipe(user: CurrentUser, household_id: str, recipe_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        row = connection.execute(text(_RECIPE_SELECT + "AND r.id = :recipe_id AND r.archived_at IS NULL"), {
            "household_id": household_id, "user_id": user.id, "recipe_id": recipe_id,
        }).mappings().one_or_none()
        if row is None:
            raise _not_found()
        return _serialize_recipe(connection, row)


def create_recipe(user: CurrentUser, household_id: str, values: dict, engine: Engine | None = None) -> dict:
    name, normalized_name = _clean_name(values["name"])
    cover_kind, cover_emoji = _validate_cover(values)
    servings = values.get("servings")
    if servings is not None and servings <= 0:
        raise _invalid("Servings must be greater than zero.")
    prep_hours = values.get("prep_hours")
    prep_part_minutes = values.get("prep_minutes")
    cook_hours = values.get("cook_hours")
    cook_part_minutes = values.get("cook_minutes")
    for hours, minutes, label in ((prep_hours, prep_part_minutes, "Prep"), (cook_hours, cook_part_minutes, "Cook")):
        if hours is not None and hours < 0:
            raise _invalid(f"{label} hours cannot be negative.")
        if minutes is not None and not 0 <= minutes <= 59:
            raise _invalid(f"{label} minutes must be between 0 and 59.")
    prep_total = None if prep_hours is None and prep_part_minutes is None else (prep_hours or 0) * 60 + (prep_part_minutes or 0)
    cook_total = None if cook_hours is None and cook_part_minutes is None else (cook_hours or 0) * 60 + (cook_part_minutes or 0)
    notes = _clean_text(values.get("notes"), limit=10000, label="Recipe notes")
    source_url = _clean_source_url(values.get("source_url"))
    steps = _prepare_steps(values.get("steps"))
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        existing = connection.execute(text(
            _RECIPE_SELECT_BASE + "AND r.created_by_user_id = :user_id AND r.create_request_id = :request_id"
        ), {
            "household_id": household_id, "user_id": user.id, "request_id": values["create_request_id"],
        }).mappings().one_or_none()
        if existing is not None:
            if existing["archived_at"] is not None:
                raise _conflict("RECIPE_CREATE_REQUEST_ALREADY_USED", "This recipe draft was already used. Start a new recipe to continue.")
            return _serialize_recipe(connection, existing)
        ingredients = _validate_ingredients(connection, household_id, values.get("ingredients", []))
        recipe_id = connection.execute(text("""
            INSERT INTO household_recipes (
                household_id, created_by_user_id, create_request_id, name, normalized_name, cover_kind,
                cover_emoji, servings, prep_minutes, cook_minutes, notes, source_url
            ) VALUES (
                :household_id, :user_id, :create_request_id, :name, :normalized_name, :cover_kind,
                :cover_emoji, :servings, :prep_minutes, :cook_minutes, :notes, :source_url
            ) RETURNING id::text
        """), {
            "household_id": household_id, "user_id": user.id, "create_request_id": values["create_request_id"], "name": name,
            "normalized_name": normalized_name, "cover_kind": cover_kind,
            "cover_emoji": cover_emoji, "servings": servings, "prep_minutes": prep_total,
            "cook_minutes": cook_total, "notes": notes, "source_url": source_url,
        }).scalar_one()
        _insert_children(connection, household_id, recipe_id, ingredients, steps)
        row = connection.execute(text(_RECIPE_SELECT + "AND r.id = :recipe_id"), {
            "household_id": household_id, "user_id": user.id, "recipe_id": recipe_id,
        }).mappings().one()
        return _serialize_recipe(connection, row)


def update_recipe(
    user: CurrentUser,
    household_id: str,
    recipe_id: str,
    values: dict,
    fields: set[str],
    engine: Engine | None = None,
) -> dict:
    if "expected_revision" not in fields or values.get("expected_revision") is None:
        raise _invalid("An expected recipe revision is required to save changes.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        current = connection.execute(text("""
            SELECT id::text AS id, name, normalized_name, cover_kind, cover_emoji,
                servings, prep_minutes, cook_minutes, notes, source_url, edit_revision
            FROM household_recipes
            WHERE household_id = :household_id AND id = :recipe_id AND archived_at IS NULL
            FOR UPDATE
        """), {"household_id": household_id, "recipe_id": recipe_id}).mappings().one_or_none()
        if current is None:
            raise _not_found()
        if current["edit_revision"] != values["expected_revision"]:
            raise _conflict("RECIPE_REVISION_CONFLICT", "This recipe changed on another device. Reload it before saving.")

        name = current["name"]
        normalized_name = current["normalized_name"]
        if "name" in fields:
            if values.get("name") is None:
                raise _invalid("Recipe name cannot be blank.")
            name, normalized_name = _clean_name(values["name"])
        cover = {"cover_kind": current["cover_kind"], "cover_emoji": current["cover_emoji"]}
        if "cover_kind" in fields or "cover_emoji" in fields:
            cover.update({key: values[key] for key in ("cover_kind", "cover_emoji") if key in fields})
            if "cover_kind" not in fields:
                cover["cover_kind"] = "emoji" if cover.get("cover_emoji") else "initials"
            cover_kind, cover_emoji = _validate_cover(cover)
        else:
            cover_kind, cover_emoji = current["cover_kind"], current["cover_emoji"]

        servings = values.get("servings") if "servings" in fields else current["servings"]
        if servings is not None and servings <= 0:
            raise _invalid("Servings must be greater than zero.")
        durations: dict[str, int | None] = {}
        for prefix, database_field in (("prep", "prep_minutes"), ("cook", "cook_minutes")):
            hours_field, minutes_field = f"{prefix}_hours", f"{prefix}_minutes"
            if hours_field in fields or minutes_field in fields:
                old_total = current[database_field]
                old_hours = old_total // 60 if old_total is not None else 0
                old_minutes = old_total % 60 if old_total is not None else 0
                hours = (values.get(hours_field) or 0) if hours_field in fields else old_hours
                minutes = (values.get(minutes_field) or 0) if minutes_field in fields else old_minutes
                if hours < 0 or not 0 <= minutes <= 59:
                    raise _invalid(f"{prefix.title()} time must use nonnegative hours and minutes from 0 to 59.")
                durations[database_field] = hours * 60 + minutes
            else:
                durations[database_field] = current[database_field]
        notes = _clean_text(values.get("notes"), limit=10000, label="Recipe notes") if "notes" in fields else current["notes"]
        source_url = _clean_source_url(values.get("source_url")) if "source_url" in fields else current["source_url"]
        if "ingredients" in fields:
            if values["ingredients"] is None:
                raise _invalid("A recipe needs at least one Food Catalog ingredient.")
            ingredients = _validate_ingredients(connection, household_id, values["ingredients"])
        else:
            ingredients = None
        if "steps" in fields:
            steps = _prepare_steps(values["steps"])
        else:
            steps = None

        connection.execute(text("""
            UPDATE household_recipes SET name = :name, normalized_name = :normalized_name,
                cover_kind = :cover_kind, cover_emoji = :cover_emoji, servings = :servings,
                prep_minutes = :prep_minutes, cook_minutes = :cook_minutes, notes = :notes,
                source_url = :source_url, edit_revision = edit_revision + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :recipe_id
        """), {
            "household_id": household_id, "recipe_id": recipe_id, "name": name,
            "normalized_name": normalized_name, "cover_kind": cover_kind,
            "cover_emoji": cover_emoji, "servings": servings,
            "prep_minutes": durations["prep_minutes"], "cook_minutes": durations["cook_minutes"],
            "notes": notes, "source_url": source_url,
        })
        if ingredients is not None:
            connection.execute(text("DELETE FROM household_recipe_ingredients WHERE household_id = :household_id AND recipe_id = :recipe_id"), {
                "household_id": household_id, "recipe_id": recipe_id,
            })
            _insert_children(connection, household_id, recipe_id, ingredients, [])
        if steps is not None:
            connection.execute(text("DELETE FROM household_recipe_steps WHERE household_id = :household_id AND recipe_id = :recipe_id"), {
                "household_id": household_id, "recipe_id": recipe_id,
            })
            _insert_children(connection, household_id, recipe_id, [], steps)
        row = connection.execute(text(_RECIPE_SELECT + "AND r.id = :recipe_id"), {
            "household_id": household_id, "user_id": user.id, "recipe_id": recipe_id,
        }).mappings().one()
        return _serialize_recipe(connection, row)


def archive_recipe(user: CurrentUser, household_id: str, recipe_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        updated = connection.execute(text("""
            UPDATE household_recipes SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
                edit_revision = edit_revision + 1
            WHERE household_id = :household_id AND id = :recipe_id AND archived_at IS NULL
            RETURNING id
        """), {"household_id": household_id, "recipe_id": recipe_id}).scalar_one_or_none()
        if updated is None:
            raise _not_found()


def restore_recipe(user: CurrentUser, household_id: str, recipe_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        updated = connection.execute(text("""
            UPDATE household_recipes SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP,
                edit_revision = edit_revision + 1
            WHERE household_id = :household_id AND id = :recipe_id AND archived_at IS NOT NULL
            RETURNING id
        """), {"household_id": household_id, "recipe_id": recipe_id}).scalar_one_or_none()
        if updated is None:
            raise _not_found()
