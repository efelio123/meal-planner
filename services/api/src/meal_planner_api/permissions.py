"""Explicit membership grants. Mutation callers hold the household lock."""

from fastapi import HTTPException
from sqlalchemy import text

from meal_planner_api.database import get_engine

ACTIONS = (
    ("shopping.add", "Shopping", "Add items"),
    ("shopping.check", "Shopping", "Check and uncheck items"),
    ("shopping.edit", "Shopping", "Edit amounts, units and stores"),
    ("shopping.remove", "Shopping", "Remove individual items"),
    ("shopping.clear_purchased", "Shopping", "Clear purchased items"),
    ("shopping.clear_all", "Shopping", "Clear the entire list"),
    ("recipes.create", "Recipes", "Create recipes"),
    ("recipes.edit", "Recipes", "Edit recipes"),
    ("recipes.archive", "Recipes", "Archive recipes"),
    ("recipes.restore", "Recipes", "Restore archived recipes"),
    ("plan.add", "Meal planning", "Add meals"),
    ("plan.edit", "Meal planning", "Edit or move meals"),
    ("plan.remove", "Meal planning", "Remove meals"),
    ("catalog.items.create", "Catalog items", "Create Food and Household items"),
    ("catalog.items.edit", "Catalog items", "Edit items"),
    ("catalog.items.archive", "Catalog items", "Archive items"),
    ("catalog.categories.create", "Categories", "Create categories"),
    ("catalog.categories.edit", "Categories", "Edit categories"),
    ("catalog.categories.archive", "Categories", "Remove categories"),
    ("catalog.stores.create", "Stores", "Create stores"),
    ("catalog.stores.edit", "Stores", "Edit stores"),
    ("catalog.stores.archive", "Stores", "Remove stores"),
    ("catalog.units.create", "Shopping units", "Create custom shopping units"),
    ("catalog.units.edit", "Shopping units", "Edit custom shopping units"),
    ("catalog.units.archive", "Shopping units", "Remove custom shopping units"),
)
ACTION_KEYS = tuple(action[0] for action in ACTIONS)


def access_snapshot(connection, household_id: str, user_id: str) -> dict:
    member = (
        connection.execute(
            text("""SELECT hm.id::text AS id, hm.role, hm.permissions_revision
        FROM household_members hm JOIN households h ON h.id = hm.household_id
        WHERE hm.household_id=:home AND hm.user_id=:user AND hm.removed_at IS NULL
          AND h.deleted_at IS NULL"""),
            {"home": household_id, "user": user_id},
        )
        .mappings()
        .one_or_none()
    )
    if member is None:
        raise HTTPException(404, "Household not found")
    grants = (
        list(ACTION_KEYS)
        if member["role"] == "owner"
        else list(
            connection.execute(
                text("""
        SELECT action_key FROM household_member_permissions WHERE membership_id=:id ORDER BY action_key
    """),
                {"id": member["id"]},
            ).scalars()
        )
    )
    return {
        "membership_id": member["id"],
        "role": member["role"],
        "permissions": grants,
        "permissions_revision": member["permissions_revision"],
    }


def with_access(connection, user_id: str, household) -> dict:
    return {
        **dict(household),
        **access_snapshot(connection, str(household["id"]), user_id),
    }


def seed_grants(connection, membership_id: str, grants=ACTION_KEYS) -> None:
    connection.execute(
        text("DELETE FROM household_member_permissions WHERE membership_id=:id"),
        {"id": membership_id},
    )
    for key in grants:
        connection.execute(
            text(
                "INSERT INTO household_member_permissions (membership_id, action_key) VALUES (:id, :key)"
            ),
            {"id": membership_id, "key": key},
        )


def require_permissions(
    connection,
    household_id: str,
    user_id: str,
    *required: str,
    resource: tuple[str, str] | None = None,
) -> None:
    # Internal fixed table names only; never accept a table name from a request.
    if resource is not None:
        table, identifier = resource
        allowed = {
            "catalog_items",
            "catalog_categories",
            "catalog_stores",
            "household_shopping_units",
            "household_recipes",
            "household_meal_plan_entries",
            "shopping_list_items",
        }
        if table not in allowed:
            raise ValueError("Unsupported permission resource")
        if (
            connection.execute(
                text(f"SELECT 1 FROM {table} WHERE household_id=:home AND id=:id"),
                {"home": household_id, "id": identifier},
            ).scalar_one_or_none()
            is None
        ):
            raise HTTPException(404, "Item not found")
    if any(key not in ACTION_KEYS for key in required):
        raise ValueError("Unknown permission")
    snapshot = access_snapshot(connection, household_id, user_id)
    for key in required:
        if key not in snapshot["permissions"]:
            raise HTTPException(
                403,
                {
                    "code": "HOUSEHOLD_ACTION_FORBIDDEN",
                    "message": "An owner has not allowed this action for your account.",
                    "action": key,
                },
            )


def _target(connection, household_id: str, membership_id: str):
    row = (
        connection.execute(
            text("""SELECT id::text AS membership_id, user_id::text AS user_id,
        role, permissions_revision FROM household_members WHERE household_id=:home AND id=:id
        AND removed_at IS NULL FOR UPDATE"""),
            {"home": household_id, "id": membership_id},
        )
        .mappings()
        .one_or_none()
    )
    if row is None:
        raise HTTPException(404, "Member not found")
    return row


def _result(connection, household_id: str, target) -> dict:
    return {
        "membership_id": target["membership_id"],
        **access_snapshot(connection, household_id, target["user_id"]),
        "actions": [
            {"key": key, "group": group, "label": label}
            for key, group, label in ACTIONS
        ],
    }


def get_member_permissions(
    user, household_id: str, membership_id: str, engine=None
) -> dict:
    from meal_planner_api.household_management import lock_household

    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        return _result(
            connection, household_id, _target(connection, household_id, membership_id)
        )


def set_member_permissions(
    user,
    household_id: str,
    membership_id: str,
    grants: list[str],
    expected_revision: int,
    engine=None,
) -> dict:
    from meal_planner_api.household_management import lock_household

    if len(grants) != len(set(grants)) or any(key not in ACTION_KEYS for key in grants):
        raise HTTPException(422, "Choose supported, unique permissions.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        target = _target(connection, household_id, membership_id)
        if target["role"] == "owner":
            raise HTTPException(
                409,
                {"code": "OWNER_FULL_ACCESS", "message": "Owners have full access."},
            )
        if target["permissions_revision"] != expected_revision:
            raise HTTPException(
                409,
                {
                    "code": "MEMBER_PERMISSIONS_CONFLICT",
                    "message": "Permissions changed. Reload before saving.",
                },
            )
        seed_grants(connection, membership_id, grants)
        connection.execute(
            text(
                "UPDATE household_members SET permissions_revision=permissions_revision+1, updated_at=CURRENT_TIMESTAMP WHERE id=:id"
            ),
            {"id": membership_id},
        )
        return _result(connection, household_id, target)
