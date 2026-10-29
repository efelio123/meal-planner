from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient

from meal_planner_api import main
from meal_planner_api.onboarding import CurrentUser, require_current_user


@pytest.mark.anyio
async def test_clear_purchased_route_validates_household_and_preserves_response(monkeypatch):
    household = str(uuid4())
    user = CurrentUser(str(uuid4()), "clear@example.test", "Test User")
    calls = []

    def clear(current_user, household_id):
        calls.append((current_user, household_id))
        return {"removed_count": 1, "removed_item_ids": ["removed-id"]}

    monkeypatch.setattr(main, "clear_purchased_items", clear)
    main.app.dependency_overrides[require_current_user] = lambda: user
    try:
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://testserver") as client:
            invalid = await client.delete("/v1/households/not-a-uuid/shopping-list/purchased-items")
            assert invalid.status_code == 422
            assert calls == []
            response = await client.delete(f"/v1/households/{household}/shopping-list/purchased-items")
            assert response.status_code == 200
            assert response.json() == {"removed_count": 1, "removed_item_ids": ["removed-id"]}
            assert calls == [(user, household)]
    finally:
        main.app.dependency_overrides.clear()
