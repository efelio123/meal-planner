import pytest
from httpx2 import ASGITransport, AsyncClient

from meal_planner_api.main import app


@pytest.mark.anyio
async def test_health_returns_ok() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        response = await client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}