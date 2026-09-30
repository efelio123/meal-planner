"""Household-scoped shopping-list services."""

from fastapi import HTTPException, status
from sqlalchemy import Engine, text

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")


def _item(record: dict) -> dict:
    return dict(record)


def get_list(user: CurrentUser, household_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text("""
            SELECT sl.id::text AS list_id, h.id::text AS household_id,
                   item.id::text AS id, item.name, item.is_checked, item.checked_at,
                   item.checked_by_user_id::text AS checked_by_user_id,
                   item.created_by_user_id::text AS created_by_user_id, item.created_at
            FROM shopping_lists sl
            JOIN households h ON h.id = sl.household_id
            JOIN household_members hm ON hm.household_id = h.id
            LEFT JOIN shopping_list_items item ON item.shopping_list_id = sl.id
            WHERE h.id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
            ORDER BY item.is_checked, item.created_at, item.id
        """), {"household_id": household_id, "user_id": user.id}).mappings().all()
        if not rows:
            raise _not_found()
        items = [
            _item({key: value for key, value in row.items() if key not in {"list_id", "household_id"}})
            for row in rows
            if row["id"] is not None
        ]
        return {"id": rows[0]["list_id"], "household_id": rows[0]["household_id"], "items": items}


def add_item(user: CurrentUser, household_id: str, name: str, engine: Engine | None = None) -> dict:
    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item name is required")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        item = connection.execute(text("""
            INSERT INTO shopping_list_items (shopping_list_id, name, created_by_user_id)
            SELECT sl.id, :name, :user_id
            FROM shopping_lists sl
            JOIN households h ON h.id = sl.household_id
            JOIN household_members hm ON hm.household_id = h.id
            WHERE h.id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
            RETURNING shopping_list_items.id::text, shopping_list_items.name,
                      shopping_list_items.is_checked, shopping_list_items.checked_at,
                      shopping_list_items.checked_by_user_id::text,
                      shopping_list_items.created_by_user_id::text, shopping_list_items.created_at
        """), {"household_id": household_id, "name": normalized_name, "user_id": user.id}).mappings().one_or_none()
        if item is None:
            raise _not_found()
        return _item(item)


def set_checked(user: CurrentUser, household_id: str, item_id: str, is_checked: bool, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        item = connection.execute(text("""
            UPDATE shopping_list_items
            SET is_checked = :is_checked,
                checked_at = CASE WHEN :is_checked THEN CURRENT_TIMESTAMP ELSE NULL END,
                checked_by_user_id = CASE WHEN :is_checked THEN :user_id ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            FROM shopping_lists sl
            JOIN households h ON h.id = sl.household_id
            JOIN household_members hm ON hm.household_id = h.id
            WHERE shopping_list_items.id = :item_id AND shopping_list_items.shopping_list_id = sl.id
              AND h.id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
            RETURNING shopping_list_items.id::text, shopping_list_items.name,
                      shopping_list_items.is_checked, shopping_list_items.checked_at,
                      shopping_list_items.checked_by_user_id::text,
                      shopping_list_items.created_by_user_id::text, shopping_list_items.created_at
        """), {"is_checked": is_checked, "user_id": user.id, "item_id": item_id, "household_id": household_id}).mappings().one_or_none()
        if item is None:
            raise _not_found()
        return _item(item)


def delete_item(user: CurrentUser, household_id: str, item_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        deleted = connection.execute(text("""
            DELETE FROM shopping_list_items
            USING shopping_lists sl, households h, household_members hm
            WHERE shopping_list_items.id = :item_id AND shopping_list_items.shopping_list_id = sl.id
              AND sl.household_id = h.id AND hm.household_id = h.id
              AND h.id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
            RETURNING shopping_list_items.id
        """), {"item_id": item_id, "household_id": household_id, "user_id": user.id}).scalar_one_or_none()
        if deleted is None:
            raise _not_found()
