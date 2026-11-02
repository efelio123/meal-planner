"""F15 authorization on the explicitly guarded disposable PostgreSQL database."""

import importlib.util
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import text
from test_household_management_integration import (
    insert_household,
    insert_user,
    race_engine,
    wait_for_lock_wait,
)
from test_recipes_integration import insert_food
from test_recipes_integration import recipe_engine as recipe_engine  # noqa: PLC0414

from meal_planner_api import (
    catalog,
    household_management,
    meal_planning,
    onboarding,
    permissions,
    recipes,
    shopping_lists,
)
from meal_planner_api.current_user import CurrentUser
from meal_planner_api.main import app
from meal_planner_api.onboarding import require_current_user


@pytest.fixture
def data(recipe_engine):
    engine = recipe_engine
    with engine.begin() as conn:
        owner_id, email = insert_user(conn, "permissions-owner")
        member_id, member_email = insert_user(conn, "permissions-member")
        home = insert_household(conn, owner_id)
        other = insert_household(conn, owner_id)
        membership = conn.execute(
            text(
                "INSERT INTO household_members (household_id,user_id,role) VALUES (:home,:user,'member') RETURNING id::text"
            ),
            {"home": home, "user": member_id},
        ).scalar_one()
        permissions.seed_grants(conn, membership)
        food = insert_food(conn, home, "Butter")
        foreign_food = insert_food(conn, other, "Other butter")
    owner = CurrentUser(owner_id, email, "Owner")
    member = CurrentUser(member_id, member_email, "Member")
    category = catalog.create_category(owner, home, "food", "Dairy", engine=engine)
    store = catalog.create_store(owner, home, "Market", engine)
    unit = catalog.create_custom_unit(owner, home, "Trial bundle", engine)
    request = {
        "create_request_id": str(uuid4()),
        "name": "Dinner",
        "ingredients": [{"catalog_item_id": food}],
        "steps": ["Cook"],
    }
    recipe = recipes.create_recipe(owner, home, request, engine)
    item = shopping_lists.add_item(owner, home, food, {"amount": "2"}, engine)
    entry = meal_planning.create_entry(
        owner, home, "2026-11-02", "dinner", recipe["id"], engine
    )
    result = {
        "engine": engine,
        "owner": owner,
        "member": member,
        "home": home,
        "other": other,
        "membership": membership,
        "food": food,
        "foreign_food": foreign_food,
        "category": category["id"],
        "store": store["id"],
        "unit": unit["id"],
        "recipe": recipe,
        "item": item,
        "entry": entry,
        "request": request,
    }
    try:
        yield result
    finally:
        with engine.begin() as conn:
            for table in [
                "household_meal_plan_entries",
                "shopping_list_items",
                "shopping_list_meal_plan_requests",
                "shopping_lists",
                "household_recipe_steps",
                "household_recipe_ingredients",
                "household_recipe_sections",
                "household_recipes",
                "catalog_items",
                "catalog_categories",
                "catalog_stores",
                "household_shopping_units",
                "household_invitations",
                "household_members",
            ]:
                conn.execute(
                    text(f"DELETE FROM {table} WHERE household_id IN (:home,:other)"),
                    {"home": home, "other": other},
                )
            conn.execute(
                text("DELETE FROM households WHERE id IN (:home,:other)"),
                {"home": home, "other": other},
            )
            conn.execute(
                text("DELETE FROM users WHERE id IN (:owner,:member)"),
                {"owner": owner_id, "member": member_id},
            )


def set_grants(d, grants):
    current = permissions.get_member_permissions(
        d["owner"], d["home"], d["membership"], d["engine"]
    )
    return permissions.set_member_permissions(
        d["owner"],
        d["home"],
        d["membership"],
        list(grants),
        current["permissions_revision"],
        d["engine"],
    )


def operation(d, key):
    u, h, e = d["member"], d["home"], d["engine"]
    calls = {
        "shopping.add": lambda: shopping_lists.add_item(u, h, d["food"], {}, e),
        "shopping.check": lambda: shopping_lists.update_item(
            u, h, d["item"]["id"], {"is_checked": True}, {"is_checked"}, e
        ),
        "shopping.edit": lambda: shopping_lists.update_item(
            u, h, d["item"]["id"], {"amount": "5"}, {"amount"}, e
        ),
        "shopping.remove": lambda: shopping_lists.delete_item(u, h, d["item"]["id"], e),
        "shopping.clear_purchased": lambda: shopping_lists.clear_purchased_items(
            u, h, e
        ),
        "shopping.clear_all": lambda: shopping_lists.clear_list(u, h, e),
        "recipes.create": lambda: recipes.create_recipe(u, h, d["request"], e),
        "recipes.edit": lambda: recipes.update_recipe(
            u,
            h,
            d["recipe"]["id"],
            {"expected_revision": 1, "name": "Changed"},
            {"expected_revision", "name"},
            e,
        ),
        "recipes.archive": lambda: recipes.archive_recipe(u, h, d["recipe"]["id"], e),
        "recipes.restore": lambda: recipes.restore_recipe(u, h, d["recipe"]["id"], e),
        "plan.add": lambda: meal_planning.create_entry(
            u, h, "2026-11-03", "dinner", d["recipe"]["id"], e
        ),
        "plan.edit": lambda: meal_planning.update_entry(
            u, h, d["entry"]["id"], "2026-11-03", "dinner", d["recipe"]["id"], 1, e
        ),
        "plan.remove": lambda: meal_planning.delete_entry(u, h, d["entry"]["id"], 1, e),
        "catalog.items.create": lambda: catalog.create_item(
            u, h, {"item_type": "food", "name": "New"}, e
        ),
        "catalog.items.edit": lambda: catalog.update_item(
            u, h, d["food"], {"name": "Changed"}, {"name"}, e
        ),
        "catalog.items.archive": lambda: catalog.archive_item(u, h, d["food"], e),
        "catalog.categories.create": lambda: catalog.create_category(
            u, h, "food", "New", engine=e
        ),
        "catalog.categories.edit": lambda: catalog.update_category(
            u, h, d["category"], "Changed", engine=e
        ),
        "catalog.categories.archive": lambda: catalog.archive_category(
            u, h, d["category"], 0, e
        ),
        "catalog.stores.create": lambda: catalog.create_store(u, h, "New", e),
        "catalog.stores.edit": lambda: catalog.update_store(
            u, h, d["store"], "Changed", e
        ),
        "catalog.stores.archive": lambda: catalog.archive_store(u, h, d["store"], e),
        "catalog.units.create": lambda: catalog.create_custom_unit(u, h, "New", e),
        "catalog.units.edit": lambda: catalog.update_custom_unit(
            u, h, d["unit"], "Changed", e
        ),
        "catalog.units.archive": lambda: catalog.archive_custom_unit(
            u, h, d["unit"], e
        ),
    }
    assert set(calls) == set(permissions.ACTION_KEYS)
    return calls[key]()


@pytest.mark.parametrize("key", permissions.ACTION_KEYS)
def test_every_product_mutation_denies_empty_grants_without_changes(data, key):
    set_grants(data, [])
    before = recipes.get_recipe(
        data["owner"], data["home"], data["recipe"]["id"], data["engine"]
    )
    before_list = shopping_lists.get_list(data["owner"], data["home"], data["engine"])
    with pytest.raises(HTTPException) as denied:
        operation(data, key)
    assert denied.value.status_code == 403
    assert denied.value.detail["action"] == key
    assert (
        recipes.get_recipe(
            data["owner"], data["home"], data["recipe"]["id"], data["engine"]
        )
        == before
    )
    assert (
        shopping_lists.get_list(data["owner"], data["home"], data["engine"])
        == before_list
    )


def test_snapshot_owner_bypass_individual_grants_and_conflicts(data):
    d = data
    snapshot = set_grants(d, ["shopping.check", "shopping.edit"])
    assert snapshot["permissions"] == sorted(["shopping.check", "shopping.edit"])
    assert len(snapshot["actions"]) == 25
    with d["engine"].begin() as conn:
        household_management.lock_household(conn, d["home"], d["owner"].id)
        permissions.require_permissions(
            conn, d["home"], d["owner"].id, *permissions.ACTION_KEYS
        )
        permissions.require_permissions(
            conn, d["home"], d["member"].id, "shopping.check", "shopping.edit"
        )
        with pytest.raises(ValueError):
            permissions.require_permissions(conn, d["home"], d["owner"].id, "made.up")
    with pytest.raises(HTTPException) as conflict:
        permissions.set_member_permissions(
            d["owner"],
            d["home"],
            d["membership"],
            [],
            snapshot["permissions_revision"] - 1,
            d["engine"],
        )
    assert conflict.value.status_code == 409
    for invalid in [["shopping.add", "shopping.add"], ["owner"], ["made.up"]]:
        with pytest.raises(HTTPException) as bad:
            set_grants(d, invalid)
        assert bad.value.status_code == 422
    with pytest.raises(HTTPException) as denied:
        permissions.get_member_permissions(
            d["member"], d["home"], d["membership"], d["engine"]
        )
    assert denied.value.status_code == 404
    home = household_management.household_detail(d["member"], d["home"], d["engine"])
    assert (
        home["permissions"] == snapshot["permissions"]
        and home["permissions_revision"] == snapshot["permissions_revision"]
    )


def test_mixed_shopping_fields_atomic_and_readd_requires_only_add(data):
    d = data
    set_grants(d, ["shopping.check"])
    with pytest.raises(HTTPException):
        shopping_lists.update_item(
            d["member"],
            d["home"],
            d["item"]["id"],
            {"is_checked": True, "amount": "5"},
            {"is_checked", "amount"},
            d["engine"],
        )
    row = shopping_lists.get_item(d["owner"], d["home"], d["item"]["id"], d["engine"])
    assert not row["is_checked"] and row["amount"] == "2"
    shopping_lists.update_item(
        d["member"],
        d["home"],
        row["id"],
        {"is_checked": True},
        {"is_checked"},
        d["engine"],
    )
    set_grants(d, ["shopping.add"])
    restored = shopping_lists.re_add_item(
        d["member"], d["home"], row["id"], d["engine"]
    )
    assert not restored["is_checked"] and restored["amount"] == "2"
    assert (
        shopping_lists.re_add_item(d["member"], d["home"], row["id"], d["engine"])
        == restored
    )
    with pytest.raises(HTTPException):
        shopping_lists.update_item(
            d["member"],
            d["home"],
            row["id"],
            {"is_checked": True},
            {"is_checked"},
            d["engine"],
        )
    set_grants(d, ["shopping.edit"])
    with pytest.raises(HTTPException):
        shopping_lists.update_item(
            d["member"],
            d["home"],
            row["id"],
            {"is_checked": True, "amount": "5"},
            {"is_checked", "amount"},
            d["engine"],
        )
    assert (
        shopping_lists.update_item(
            d["member"], d["home"], row["id"], {"amount": "5"}, {"amount"}, d["engine"]
        )["amount"]
        == "5"
    )


def test_category_archive_cannot_rewrite_items_without_item_edit(data):
    d = data
    catalog.update_item(
        d["owner"],
        d["home"],
        d["food"],
        {"category_id": d["category"]},
        {"category_id"},
        d["engine"],
    )
    set_grants(d, ["catalog.categories.archive"])
    with pytest.raises(HTTPException) as denied:
        catalog.archive_category(d["member"], d["home"], d["category"], 1, d["engine"])
    assert denied.value.detail["action"] == "catalog.items.edit"
    assert (
        catalog.get_item(d["member"], d["home"], d["food"], d["engine"])["category_id"]
        == d["category"]
    )
    set_grants(d, ["catalog.categories.archive", "catalog.items.edit"])
    catalog.archive_category(d["member"], d["home"], d["category"], 1, d["engine"])
    assert (
        catalog.get_item(d["member"], d["home"], d["food"], d["engine"])["category_id"]
        is None
    )


def test_invitation_defaults_and_role_transitions_are_explicit(data):
    d = data
    household_management.remove_member(
        d["owner"], d["home"], d["membership"], d["engine"]
    )
    invitation = onboarding.create_invitation(
        d["owner"], d["home"], d["member"].normalized_email, d["engine"]
    )
    onboarding.accept_invitation(d["member"], invitation["code"], d["engine"])
    snapshot = household_management.household_detail(
        d["member"], d["home"], d["engine"]
    )
    assert snapshot["role"] == "member" and set(snapshot["permissions"]) == set(
        permissions.ACTION_KEYS
    )
    membership = snapshot["membership_id"]
    household_management.set_member_role(
        d["owner"], d["home"], membership, "owner", d["engine"]
    )
    with pytest.raises(HTTPException) as full:
        permissions.set_member_permissions(
            d["owner"],
            d["home"],
            membership,
            [],
            snapshot["permissions_revision"],
            d["engine"],
        )
    assert full.value.detail["code"] == "OWNER_FULL_ACCESS"
    household_management.set_member_role(
        d["owner"], d["home"], membership, "member", d["engine"]
    )
    assert set(
        household_management.household_detail(d["member"], d["home"], d["engine"])[
            "permissions"
        ]
    ) == set(permissions.ACTION_KEYS)
    # Explicit owner restrictions survive a redundant Member-role update.
    demoted = household_management.household_detail(d["member"], d["home"], d["engine"])
    permissions.set_member_permissions(
        d["owner"],
        d["home"],
        membership,
        ["shopping.add"],
        demoted["permissions_revision"],
        d["engine"],
    )
    household_management.set_member_role(
        d["owner"], d["home"], membership, "member", d["engine"]
    )
    assert household_management.household_detail(d["member"], d["home"], d["engine"])[
        "permissions"
    ] == ["shopping.add"]
    with pytest.raises(HTTPException) as last:
        owner_membership = household_management.household_detail(
            d["owner"], d["home"], d["engine"]
        )["membership_id"]
        household_management.set_member_role(
            d["owner"], d["home"], owner_membership, "member", d["engine"]
        )
    assert last.value.detail["code"] == "LAST_OWNER"


def test_tenant_isolation_and_revoked_recipe_replays(data):
    d = data
    set_grants(d, permissions.ACTION_KEYS)
    with pytest.raises(HTTPException) as foreign:
        catalog.update_item(
            d["member"],
            d["home"],
            d["foreign_food"],
            {"name": "Changed"},
            {"name"},
            d["engine"],
        )
    assert foreign.value.status_code == 404
    with pytest.raises(HTTPException) as foreign_member:
        permissions.get_member_permissions(
            d["owner"], d["other"], d["membership"], d["engine"]
        )
    assert foreign_member.value.status_code == 404
    request = {
        **d["request"],
        "create_request_id": str(uuid4()),
        "name": "Member dinner",
    }
    saved = recipes.create_recipe(d["member"], d["home"], request, d["engine"])
    # Permission denial still precedes replay handling on the actual create service.
    set_grants(d, [])
    with pytest.raises(HTTPException) as denied:
        recipes.create_recipe(d["member"], d["home"], request, d["engine"])
    assert denied.value.status_code == 403
    assert (
        recipes.get_recipe(d["member"], d["home"], saved["id"], d["engine"])[
            "edit_revision"
        ]
        == 1
    )


def test_two_owner_updates_cannot_overwrite_a_stale_revision(data):
    d = data
    revision = permissions.get_member_permissions(
        d["owner"], d["home"], d["membership"], d["engine"]
    )["permissions_revision"]
    barrier = Barrier(2)

    def update(grants):
        barrier.wait(timeout=5)
        try:
            return permissions.set_member_permissions(
                d["owner"], d["home"], d["membership"], grants, revision, d["engine"]
            )
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(update, [["shopping.add"], ["shopping.check"]]))
    assert sum(isinstance(result, dict) for result in results) == 1 and 409 in results


def test_waiting_member_write_observes_committed_revocation(data):
    d = data
    isolated = race_engine(d["engine"], "permissions-revocation-test")
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            with d["engine"].begin() as conn:
                household_management.lock_household(conn, d["home"], d["owner"].id)
                permissions.seed_grants(conn, d["membership"], [])
                future = executor.submit(
                    shopping_lists.update_item,
                    d["member"],
                    d["home"],
                    d["item"]["id"],
                    {"is_checked": True},
                    {"is_checked"},
                    isolated,
                )
                wait_for_lock_wait(d["engine"], "permissions-revocation-test")
            with pytest.raises(HTTPException) as denied:
                future.result(timeout=5)
            assert denied.value.status_code == 403
        assert not shopping_lists.get_item(
            d["owner"], d["home"], d["item"]["id"], d["engine"]
        )["is_checked"]
    finally:
        isolated.dispose()


def test_action_identifiers_match_mobile_contract():
    source = (
        Path(__file__).resolve().parents[3]
        / "apps/mobile/src/lib/household-permissions.ts"
    ).read_text(encoding="utf-8")
    identifiers = json.loads(
        re.search(
            r"export const permissionActions = (\[.*?\]) as const;", source, re.DOTALL
        )[1]
    )
    assert set(identifiers) == set(permissions.ACTION_KEYS)


def test_migration_backfills_only_active_members_and_guards_saved_configuration(
    recipe_engine,
):
    path = (
        Path(__file__).resolve().parents[3]
        / "db/migrations/versions/20261101_member_permissions.py"
    )
    spec = importlib.util.spec_from_file_location("permission_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    schema = "permission_test_" + uuid4().hex
    with recipe_engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA {schema}"))
        conn.execute(text(f"SET LOCAL search_path TO {schema}"))
        conn.execute(
            text(
                "CREATE TABLE household_members (id uuid PRIMARY KEY, role text NOT NULL, removed_at timestamptz)"
            )
        )
        active, owner, removed = [str(uuid4()) for _ in range(3)]
        conn.execute(
            text(
                "INSERT INTO household_members VALUES (:active,'member',NULL),(:owner,'owner',NULL),(:removed,'member',CURRENT_TIMESTAMP)"
            ),
            {"active": active, "owner": owner, "removed": removed},
        )
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        rows = conn.execute(
            text(
                "SELECT membership_id::text,action_key FROM household_member_permissions"
            )
        ).all()
        assert len(rows) == 25 and {row[0] for row in rows} == {active}
        assert {row[1] for row in rows} == set(permissions.ACTION_KEYS)
        conn.execute(
            text("UPDATE household_members SET permissions_revision=2 WHERE id=:id"),
            {"id": active},
        )
        with pytest.raises(RuntimeError, match="would be lost"):
            migration.downgrade()
        conn.execute(text("UPDATE household_members SET permissions_revision=1"))
        migration.downgrade()
        migration.upgrade()
        conn.execute(text("SET LOCAL search_path TO public"))
        conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))


@pytest.mark.anyio
async def test_http_owner_controls_denial_shapes_and_strict_patch_fields(
    data, monkeypatch
):
    d = data
    for module in [permissions, shopping_lists]:
        monkeypatch.setattr(module, "get_engine", lambda: d["engine"])
    app.dependency_overrides[require_current_user] = lambda: d["owner"]
    path = f"/v1/households/{d['home']}/members/{d['membership']}/permissions"
    item_path = f"/v1/households/{d['home']}/shopping-list/items/{d['item']['id']}"
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            snapshot = (await client.get(path)).json()
            result = await client.patch(
                path,
                json={
                    "permissions": ["shopping.add"],
                    "expected_revision": snapshot["permissions_revision"],
                },
            )
            assert result.status_code == 200
            assert (
                await client.patch(
                    path,
                    json={
                        "permissions": ["shopping.check"],
                        "expected_revision": snapshot["permissions_revision"],
                    },
                )
            ).status_code == 409
            app.dependency_overrides[require_current_user] = lambda: d["member"]
            assert (await client.get(path)).status_code == 404
            assert (
                await client.patch(item_path, json={"is_checked": True, "amount": "8"})
            ).status_code == 403
            assert (
                await client.patch(
                    item_path, json={"is_checked": True, "name": "forbidden"}
                )
            ).status_code == 422
            assert (
                await client.post(item_path + "/re-add", json={"amount": "8"})
            ).status_code == 422
            assert (
                await client.post(item_path + "/re-add", json={})
            ).status_code == 200
            assert (
                shopping_lists.get_item(
                    d["owner"], d["home"], d["item"]["id"], d["engine"]
                )["amount"]
                == "2"
            )
    finally:
        app.dependency_overrides.clear()
