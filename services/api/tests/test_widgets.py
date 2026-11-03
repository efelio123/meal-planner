"""Widget tenancy, durable idempotency and stale-intent protection on disposable PostgreSQL."""

import asyncio
import secrets
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import text
from test_member_permissions_integration import data as data  # noqa: PLC0414
from test_member_permissions_integration import set_grants
from test_recipes_integration import recipe_engine as recipe_engine  # noqa: PLC0414

from meal_planner_api import household_management, shopping_lists, widgets
from meal_planner_api.main import app
from meal_planner_api.onboarding import require_current_user


def binding(d, user=None, weekday=1, device=None, secret=None, generation=None):
    payload = {
        "secret": secret or secrets.token_urlsafe(48),
        "generation": generation or str(uuid4()),
        "week_start": weekday,
    }
    device = device or str(uuid4())
    row = widgets.register(user or d["owner"], d["home"], device, payload, d["engine"])
    return row, payload, "Widget " + payload["secret"]


def operation(d, registration, checked=True, version=None):
    item = shopping_lists.get_item(d["owner"], d["home"], d["item"]["id"], d["engine"])
    return {
        "generation": registration["generation"],
        "operation_id": str(uuid4()),
        "item_id": item["id"],
        "expected_version": version or item["check_version"],
        "is_checked": checked,
    }


def item(d):
    return shopping_lists.get_item(d["owner"], d["home"], d["item"]["id"], d["engine"])


@pytest.mark.parametrize("weekday", [0, 1, 6])
def test_summary_scoped_complete_week_and_private_registration(data, weekday):
    d = data
    row, payload, header = binding(d, weekday=weekday)
    assert payload["secret"] not in str(row) and "secret_digest" not in row
    snapshot = widgets.summary(header, d["engine"])
    assert (
        snapshot["household_id"] == d["home"]
        and snapshot["device_id"] == row["device_id"]
    )
    assert snapshot["shopping"]["unpurchased_count"] == 1
    assert snapshot["shopping"]["items"][0]["id"] == d["item"]["id"]
    assert snapshot["shopping"]["items"][0]["amount"] == "2"
    assert snapshot["can_check"] and snapshot["schema_version"] == 1
    from datetime import date, timedelta

    days = snapshot["plan"]["days"]
    first = date.fromisoformat(days[0]["date"])
    assert (first.weekday() + 1) % 7 == weekday
    assert [day["date"] for day in days] == [
        (first + timedelta(days=n)).isoformat() for n in range(7)
    ]
    assert snapshot["plan"]["end_date"] == days[-1]["date"]
    with d["engine"].connect() as c:
        saved = c.execute(
            text("SELECT secret_digest FROM widget_devices WHERE id=:id"),
            {"id": row["device_id"]},
        ).scalar_one()
        assert saved == widgets.digest(payload["secret"])


def test_bounded_rows_preserve_all_household_count(data):
    d = data
    with d["engine"].begin() as c:
        for n in range(45):
            food = c.execute(
                text("""INSERT INTO catalog_items(household_id,item_type,name,normalized_name)
                VALUES (:home,'household',:name,:name) RETURNING id"""),
                {"home": d["home"], "name": f"widget item {n}"},
            ).scalar_one()
            c.execute(
                text("""INSERT INTO shopping_list_items(household_id,shopping_list_id,catalog_item_id,name,created_by_user_id)
                SELECT :home,id,:food,:name,:user FROM shopping_lists WHERE household_id=:home"""),
                {
                    "home": d["home"],
                    "food": food,
                    "name": f"widget item {n}",
                    "user": d["owner"].id,
                },
            )
    _, _, header = binding(d)
    shopping = widgets.summary(header, d["engine"])["shopping"]
    assert shopping["unpurchased_count"] == 46 and shopping["has_more"]
    assert len(shopping["items"]) == widgets.MAX_SHOPPING_ROWS


def test_confirm_retry_readd_and_lost_ack_do_not_toggle_again(data):
    d = data
    reg, _, header = binding(d)
    request = operation(d, reg)
    first = widgets.check_item(header, request, d["engine"])
    assert first["status"] == "confirmed" and item(d)["is_checked"]
    assert item(d)["check_version"] == request["expected_version"] + 1
    assert widgets.check_item(header, request, d["engine"]) == first
    shopping_lists.re_add_item(d["owner"], d["home"], d["item"]["id"], d["engine"])
    version = item(d)["check_version"]
    assert not item(d)["is_checked"]
    assert widgets.check_item(header, request, d["engine"]) == first
    assert not item(d)["is_checked"] and item(d)["check_version"] == version
    assert (
        widgets.check_item(
            header, request | {"operation_id": str(uuid4())}, d["engine"]
        )["status"]
        == "conflict"
    )
    assert not item(d)["is_checked"]


def test_readd_unchecked_and_old_client_writes_fence_pending_intents(data):
    d = data
    reg, _, header = binding(d)
    request = operation(d, reg)
    shopping_lists.re_add_item(d["owner"], d["home"], d["item"]["id"], d["engine"])
    assert item(d)["check_version"] == request["expected_version"] + 1
    assert widgets.check_item(header, request, d["engine"])["status"] == "conflict"
    request = operation(d, reg)
    with d["engine"].begin() as c:
        c.execute(
            text("UPDATE shopping_list_items SET is_checked=FALSE WHERE id=:id"),
            {"id": request["item_id"]},
        )
    assert widgets.check_item(header, request, d["engine"])["status"] == "conflict"
    current = item(d)["check_version"]
    shopping_lists.update_item(
        d["owner"],
        d["home"],
        request["item_id"],
        {"amount": "3"},
        {"amount"},
        d["engine"],
    )
    assert item(d)["check_version"] == current


def test_duplicate_and_competing_concurrent_operations(data):
    d = data
    reg, _, header = binding(d)
    request = operation(d, reg)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda _: widgets.check_item(header, request, d["engine"]), range(2)
            )
        )
    assert results[0] == results[1] and results[0]["status"] == "confirmed"
    assert item(d)["check_version"] == request["expected_version"] + 1
    request = operation(d, reg, checked=False)
    requests = [request, request | {"operation_id": str(uuid4()), "is_checked": True}]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda body: widgets.check_item(header, body, d["engine"]), requests
            )
        )
    assert sorted(result["status"] for result in results) == ["confirmed", "conflict"]


def test_operation_reuse_generation_and_foreign_item(data):
    d = data
    reg, _, header = binding(d)
    request = operation(d, reg)
    with pytest.raises(HTTPException) as denied:
        widgets.check_item(header, request | {"generation": str(uuid4())}, d["engine"])
    assert denied.value.status_code == 401 and not item(d)["is_checked"]
    widgets.check_item(header, request, d["engine"])
    with pytest.raises(HTTPException) as denied:
        widgets.check_item(header, request | {"is_checked": False}, d["engine"])
    assert denied.value.status_code == 409
    # An ID outside the bound household is indistinguishable from a missing item.
    assert (
        widgets.check_item(
            header,
            request | {"operation_id": str(uuid4()), "item_id": str(uuid4())},
            d["engine"],
        )["status"]
        == "gone"
    )
    with pytest.raises(HTTPException) as denied:
        widgets.register(
            d["owner"],
            d["other"],
            reg["device_id"],
            {
                "generation": str(uuid4()),
                "secret": secrets.token_urlsafe(48),
                "week_start": 0,
            },
            d["engine"],
        )
    assert denied.value.status_code == 409


def test_deleted_item_cannot_check_replacement(data):
    d = data
    reg, _, header = binding(d)
    request = operation(d, reg)
    shopping_lists.delete_item(d["owner"], d["home"], request["item_id"], d["engine"])
    replacement = shopping_lists.add_item(
        d["owner"], d["home"], d["food"], {}, d["engine"]
    )
    assert widgets.check_item(header, request, d["engine"])["status"] == "gone"
    assert not replacement["is_checked"] and replacement["id"] != request["item_id"]


def test_permission_revision_and_membership_removal_invalidate_credentials(data):
    d = data
    reg, _, header = binding(d, user=d["member"])
    set_grants(d, [])
    with pytest.raises(HTTPException) as denied:
        widgets.summary(header, d["engine"])
    assert denied.value.status_code == 401
    reg, _, header = binding(d, user=d["member"])
    assert not widgets.summary(header, d["engine"])["can_check"]
    with pytest.raises(HTTPException) as denied:
        widgets.check_item(header, operation(d, reg), d["engine"])
    assert denied.value.status_code == 403 and not item(d)["is_checked"]
    household_management.remove_member(
        d["owner"], d["home"], d["membership"], d["engine"]
    )
    with pytest.raises(HTTPException) as denied:
        widgets.summary(header, d["engine"])
    assert denied.value.status_code == 401
    widgets.revoke(header, d["engine"])


def test_expiry_revocation_and_duplicate_secret(data):
    d = data
    reg, payload, header = binding(d)
    with pytest.raises(HTTPException) as denied:
        binding(d, secret=payload["secret"])
    assert denied.value.status_code == 409
    with d["engine"].begin() as c:
        c.execute(
            text(
                "UPDATE widget_devices SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=:id"
            ),
            {"id": reg["device_id"]},
        )
    with pytest.raises(HTTPException) as denied:
        widgets.summary(header, d["engine"])
    assert denied.value.status_code == 401
    widgets.register(d["owner"], d["home"], reg["device_id"], payload, d["engine"])
    assert widgets.summary(header, d["engine"])["device_id"] == reg["device_id"]
    widgets.revoke(header, d["engine"])
    widgets.revoke(header, d["engine"])
    with pytest.raises(HTTPException) as denied:
        widgets.summary(header, d["engine"])
    assert denied.value.status_code == 401


def test_role_change_revokes_previous_binding(data):
    d = data
    _, _, header = binding(d, user=d["member"])
    household_management.set_member_role(
        d["owner"], d["home"], d["membership"], "owner", d["engine"]
    )
    with pytest.raises(HTTPException) as denied:
        widgets.summary(header, d["engine"])
    assert denied.value.status_code == 401


def test_route_validation_hides_inputs_and_widget_auth_is_separate(data, monkeypatch):
    d = data
    reg, _, header = binding(d)
    monkeypatch.setattr(widgets, "get_engine", lambda: d["engine"])
    app.dependency_overrides[require_current_user] = lambda: d["owner"]

    async def run():
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            summary = await client.get(
                "/v1/widget/summary", headers={"Authorization": header}
            )
            assert (
                summary.status_code == 200
                and summary.headers["cache-control"] == "no-store"
            )
            invalid = await client.get(
                "/v1/widget/summary",
                headers={"Authorization": "Bearer not-a-widget-token"},
            )
            assert invalid.status_code == 401
            request = operation(d, reg)
            secret = secrets.token_urlsafe(48)
            for values in [
                request | {"expected_version": True},
                request | {"is_checked": 1},
                request | {"extra": secret},
            ]:
                response = await client.post(
                    "/v1/widget/checkoffs",
                    headers={"Authorization": header},
                    json=values,
                )
                assert response.status_code == 422 and secret not in response.text
                assert response.headers["cache-control"] == "no-store"
            response = await client.put(
                f"/v1/households/{d['home']}/widget-devices/{uuid4()}",
                json={"secret": secret},
            )
            assert response.status_code == 422 and secret not in response.text

    try:
        asyncio.run(run())
    finally:
        app.dependency_overrides.clear()
