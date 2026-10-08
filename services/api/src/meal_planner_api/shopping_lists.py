"""Catalog-backed, household-scoped Shopping list operations."""

from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status
from sqlalchemy import Engine, text

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household
from meal_planner_api.recipes import _parse_amount


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shopping list not found")


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": code, "message": message})


_ITEM_SELECT = """
    SELECT item.id::text AS id, item.household_id::text AS household_id,
        item.catalog_item_id::text AS catalog_item_id, catalog.name,
        catalog.item_type AS catalog_item_type, catalog.archived_at AS catalog_archived_at,
        catalog.shopping_unit_code AS catalog_preferred_shopping_unit_code,
        catalog.custom_shopping_unit_id::text AS catalog_preferred_custom_shopping_unit_id,
        catalog.preferred_store_id::text AS catalog_preferred_store_id,
        category.id::text AS category_id, category.name AS category_name, category.emoji AS category_emoji,
        item.is_checked, item.checked_at, item.checked_by_user_id::text AS checked_by_user_id,
        item.created_by_user_id::text AS created_by_user_id, item.created_at, item.updated_at,
        item.amount, item.shopping_unit_code, shopping_unit.label AS shopping_unit_label,
        item.custom_shopping_unit_id::text AS custom_shopping_unit_id,
        custom_unit.name AS custom_shopping_unit_label,
        item.shopping_store_id::text AS store_id, store.name AS store_name,
        item.recipe_unit_code, item.recipe_unit_dimension, recipe_unit.label AS recipe_unit_label,
        item.custom_unit_label, item.meal_plan_request_id::text AS meal_plan_request_id,
        item.meal_plan_need_key
    FROM shopping_list_items item
    JOIN shopping_lists list ON list.id = item.shopping_list_id AND list.household_id = item.household_id
    JOIN households household ON household.id = item.household_id
    JOIN household_members member ON member.household_id = household.id
    JOIN catalog_items catalog ON catalog.household_id = item.household_id AND catalog.id = item.catalog_item_id
    LEFT JOIN catalog_categories category ON category.household_id = catalog.household_id AND category.id = catalog.category_id
    LEFT JOIN catalog_shopping_units shopping_unit ON shopping_unit.code = item.shopping_unit_code
    LEFT JOIN household_shopping_units custom_unit ON custom_unit.household_id = item.household_id AND custom_unit.id = item.custom_shopping_unit_id
    LEFT JOIN catalog_stores store ON store.household_id = item.household_id AND store.id = item.shopping_store_id
    LEFT JOIN recipe_measurement_units recipe_unit ON recipe_unit.code = item.recipe_unit_code AND recipe_unit.dimension = item.recipe_unit_dimension
    WHERE item.household_id = :household_id AND member.user_id = :user_id
      AND member.removed_at IS NULL AND household.deleted_at IS NULL
"""


def _serialize(row: dict) -> dict:
    result = dict(row)
    amount = result.get("amount")
    if amount is not None:
        result["amount"] = format(Decimal(amount).normalize(), "f")
    if result.get("shopping_unit_code") is not None:
        result["unit_kind"] = "built_in"
        result["unit_label"] = result.get("shopping_unit_label")
    elif result.get("custom_shopping_unit_id") is not None:
        result["unit_kind"] = "household"
        result["unit_label"] = result.get("custom_shopping_unit_label")
    elif result.get("recipe_unit_code") is not None or result.get("custom_unit_label") is not None:
        result["unit_kind"] = "recipe"
        result["unit_label"] = result.get("recipe_unit_label") or result.get("custom_unit_label")
    else:
        result["unit_kind"] = None
        result["unit_label"] = None
    result["meal_plan_source"] = result.get("meal_plan_request_id") is not None
    result.pop("meal_plan_request_id", None)
    result.pop("meal_plan_need_key", None)
    result.pop("shopping_unit_label", None)
    result.pop("custom_shopping_unit_label", None)
    result.pop("recipe_unit_label", None)
    result["catalog_item_archived"] = result.pop("catalog_archived_at", None) is not None
    return result


def get_list(user: CurrentUser, household_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text("""
            SELECT list.id::text AS list_id, household.id::text AS household_id
            FROM shopping_lists list
            JOIN households household ON household.id = list.household_id
            JOIN household_members member ON member.household_id = household.id
            WHERE household.id = :household_id AND member.user_id = :user_id
              AND member.removed_at IS NULL AND household.deleted_at IS NULL
        """), {"household_id": household_id, "user_id": user.id}).mappings().one_or_none()
        if rows is None:
            raise _not_found()
        items = connection.execute(text(_ITEM_SELECT + " ORDER BY item.is_checked, item.created_at DESC, item.id"), {
            "household_id": household_id, "user_id": user.id,
        }).mappings().all()
        return {"id": rows["list_id"], "household_id": rows["household_id"], "items": [_serialize(row) for row in items]}


def get_item(user: CurrentUser, household_id: str, item_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        row = connection.execute(text(_ITEM_SELECT + " AND item.id = :item_id"), {
            "household_id": household_id, "user_id": user.id, "item_id": item_id,
        }).mappings().one_or_none()
        if row is None:
            raise _not_found()
        result = _serialize(row)
        result["used_in_meals"] = connection.execute(text("""
            SELECT recipe.name AS recipe_name, entry.planned_for
            FROM household_meal_plan_entries entry
            JOIN household_recipes recipe ON recipe.household_id = entry.household_id AND recipe.id = entry.recipe_id
            JOIN households household ON household.id = entry.household_id
            WHERE entry.household_id = :household_id
              AND household.deleted_at IS NULL
              AND entry.planned_for >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE household.time_zone)::date
              AND entry.planned_for < date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE household.time_zone)::date + 7
              AND EXISTS (
                  SELECT 1 FROM household_recipe_ingredients ingredient
                  WHERE ingredient.household_id = entry.household_id AND ingredient.recipe_id = entry.recipe_id
                    AND ingredient.catalog_item_id = :catalog_item_id
              )
              AND EXISTS (
                  SELECT 1 FROM household_members member
                  WHERE member.household_id = household.id AND member.user_id = :user_id
                    AND member.removed_at IS NULL
              )
            ORDER BY entry.planned_for, recipe.name
        """), {"household_id": household_id, "catalog_item_id": row["catalog_item_id"], "user_id": user.id}).mappings().all()
        result["used_in_meals"] = [{"recipe_name": meal["recipe_name"], "planned_for": meal["planned_for"].isoformat()} for meal in result["used_in_meals"]]
        return result


def _active_reference(connection, table: str, household_id: str, identifier: str, label: str) -> None:
    row = connection.execute(text(f"SELECT 1 FROM {table} WHERE household_id=:household_id AND id=:id AND archived_at IS NULL"), {
        "household_id": household_id, "id": identifier,
    }).scalar_one_or_none()
    if row is None:
        raise _conflict("CATALOG_REFERENCE_ARCHIVED", f"Choose an active {label}.")


def _validate_list_values(connection, household_id: str, values: dict, *, creating: bool) -> dict:
    amount = values.get("amount")
    try:
        parsed = amount if isinstance(amount, Decimal) else _parse_amount(amount)
    except (HTTPException, InvalidOperation) as error:
        raise _invalid("Enter a positive amount, such as 2 or 1/2.") from error
    if parsed is not None and parsed <= 0:
        raise _invalid("Enter a positive amount, such as 2 or 1/2.")
    shopping_unit_code = values.get("shopping_unit_code")
    custom_unit_id = values.get("custom_shopping_unit_id")
    store_id = values.get("store_id")
    if shopping_unit_code and custom_unit_id:
        raise _invalid("Choose one shopping unit.")
    if shopping_unit_code and connection.execute(text("SELECT 1 FROM catalog_shopping_units WHERE code=:code"), {"code": shopping_unit_code}).scalar_one_or_none() is None:
        raise _invalid("Choose a supported shopping unit.")
    if custom_unit_id:
        _active_reference(connection, "household_shopping_units", household_id, custom_unit_id, "shopping unit")
    if store_id:
        _active_reference(connection, "catalog_stores", household_id, store_id, "store")
    result = {"amount": parsed, "shopping_unit_code": shopping_unit_code, "custom_shopping_unit_id": custom_unit_id, "shopping_store_id": store_id}
    if creating:
        return result
    return result


def add_item(user: CurrentUser, household_id: str, catalog_item_id: str, values: dict, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        catalog = connection.execute(text("""
            SELECT id::text AS id, name, archived_at, shopping_unit_code,
                   custom_shopping_unit_id::text AS custom_shopping_unit_id,
                   preferred_store_id::text AS preferred_store_id
            FROM catalog_items WHERE household_id=:household_id AND id=:id
        """), {"household_id": household_id, "id": catalog_item_id}).mappings().one_or_none()
        if catalog is None or catalog["archived_at"] is not None:
            raise _not_found()
        selected = _validate_list_values(connection, household_id, values, creating=True)
        if "shopping_unit_code" in values or "custom_shopping_unit_id" in values:
            selected["shopping_unit_code"] = values.get("shopping_unit_code")
            selected["custom_shopping_unit_id"] = values.get("custom_shopping_unit_id")
        else:
            selected["shopping_unit_code"] = catalog["shopping_unit_code"]
            selected["custom_shopping_unit_id"] = catalog["custom_shopping_unit_id"]
        selected["shopping_store_id"] = values.get("store_id", catalog["preferred_store_id"])
        existing = connection.execute(text("SELECT id::text AS id FROM shopping_list_items WHERE household_id=:household_id AND catalog_item_id=:catalog_item_id"), {
            "household_id": household_id, "catalog_item_id": catalog_item_id,
        }).mappings().one_or_none()
        if existing:
            raise _conflict("SHOPPING_ITEM_ALREADY_EXISTS", "This item is already on the list. Open it to edit its details.")
        inserted = connection.execute(text("""
            INSERT INTO shopping_list_items (
                household_id, shopping_list_id, name, catalog_item_id, created_by_user_id,
                amount, shopping_unit_code, custom_shopping_unit_id, shopping_store_id
            )
            SELECT :household_id, list.id, :name, :catalog_item_id, :user_id,
                   :amount, :shopping_unit_code, :custom_shopping_unit_id, :shopping_store_id
            FROM shopping_lists list WHERE list.household_id=:household_id
            RETURNING id::text AS id
        """), {
            **selected, "household_id": household_id, "name": catalog["name"],
            "catalog_item_id": catalog_item_id, "user_id": user.id,
        }).scalar_one_or_none()
        if inserted is None:
            raise _not_found()
        row = connection.execute(text(_ITEM_SELECT + " AND item.id=:item_id"), {
            "household_id": household_id, "user_id": user.id, "item_id": inserted,
        }).mappings().one()
        return _serialize(row)


def update_item(user: CurrentUser, household_id: str, item_id: str, values: dict, fields: set[str], engine: Engine | None = None) -> dict:
    if not fields:
        raise _invalid("Provide at least one field to update.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        current = connection.execute(text("""
            SELECT item.id::text AS id, item.catalog_item_id::text AS catalog_item_id,
                   item.is_checked, item.amount, item.shopping_unit_code,
                   item.custom_shopping_unit_id::text AS custom_shopping_unit_id,
                   item.shopping_store_id::text AS shopping_store_id,
                   item.recipe_unit_code, item.recipe_unit_dimension, item.custom_unit_label
            FROM shopping_list_items item
            JOIN shopping_lists list ON list.id=item.shopping_list_id AND list.household_id=item.household_id
            WHERE item.household_id=:household_id AND item.id=:item_id FOR UPDATE
        """), {"household_id": household_id, "item_id": item_id}).mappings().one_or_none()
        if current is None:
            raise _not_found()
        current = dict(current)
        if "is_checked" in fields:
            checked = values["is_checked"]
            updated = connection.execute(text("""
                UPDATE shopping_list_items SET is_checked=:checked,
                    checked_at=CASE WHEN :checked THEN CURRENT_TIMESTAMP ELSE NULL END,
                    checked_by_user_id=CASE WHEN :checked THEN :user_id ELSE NULL END,
                    updated_at=CURRENT_TIMESTAMP
                WHERE household_id=:household_id AND id=:item_id RETURNING id::text AS id
            """), {"checked": checked, "user_id": user.id, "household_id": household_id, "item_id": item_id}).scalar_one_or_none()
            if updated is None:
                raise _not_found()
        if fields - {"is_checked"}:
            merged = {
                "amount": values.get("amount", current["amount"]),
                "shopping_unit_code": values.get("shopping_unit_code", current["shopping_unit_code"]),
                "custom_shopping_unit_id": values.get("custom_shopping_unit_id", current["custom_shopping_unit_id"]),
                "store_id": values.get("store_id", current["shopping_store_id"]),
            }
            if "shopping_unit_code" in fields or "custom_shopping_unit_id" in fields:
                # Switching to a Catalog shopping unit clears a recipe-only unit.
                merged["shopping_unit_code"] = values.get("shopping_unit_code")
                merged["custom_shopping_unit_id"] = values.get("custom_shopping_unit_id")
            selected = _validate_list_values(connection, household_id, merged, creating=False)
            set_shopping_unit = "shopping_unit_code" in fields or "custom_shopping_unit_id" in fields
            if set_shopping_unit:
                connection.execute(text("""
                    UPDATE shopping_list_items SET amount=:amount,
                        shopping_unit_code=:shopping_unit_code,
                        custom_shopping_unit_id=:custom_shopping_unit_id,
                        recipe_unit_code=NULL, recipe_unit_dimension=NULL, custom_unit_label=NULL,
                        shopping_store_id=:shopping_store_id, updated_at=CURRENT_TIMESTAMP
                    WHERE household_id=:household_id AND id=:item_id
                """), {**selected, "household_id": household_id, "item_id": item_id})
            else:
                connection.execute(text("""
                    UPDATE shopping_list_items SET amount=:amount,
                        shopping_store_id=:shopping_store_id, updated_at=CURRENT_TIMESTAMP
                    WHERE household_id=:household_id AND id=:item_id
                """), {**selected, "household_id": household_id, "item_id": item_id})
        row = connection.execute(text(_ITEM_SELECT + " AND item.id=:item_id"), {
            "household_id": household_id, "user_id": user.id, "item_id": item_id,
        }).mappings().one_or_none()
        if row is None:
            raise _not_found()
        return _serialize(row)


def delete_item(user: CurrentUser, household_id: str, item_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        deleted = connection.execute(text("""
            DELETE FROM shopping_list_items WHERE household_id=:household_id AND id=:item_id
            RETURNING id
        """), {"item_id": item_id, "household_id": household_id}).scalar_one_or_none()
        if deleted is None:
            raise _not_found()


def clear_list(user: CurrentUser, household_id: str, engine: Engine | None = None) -> int:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        deleted = connection.execute(text("DELETE FROM shopping_list_items WHERE household_id=:household_id RETURNING id"), {
            "household_id": household_id,
        }).all()
        return len(deleted)
