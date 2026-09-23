import os
from collections.abc import Generator
from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from meal_planner_api import onboarding
from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture
def disposable_engine() -> Generator[Engine]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is not configured.")
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail("Household serialization tests require the explicitly named disposable PostgreSQL database.")
    engine = create_engine(url)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.mark.anyio
async def test_household_reads_serialize_rows_created_by_the_api(
    disposable_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id = str(uuid4())
    subject = f"serialization-{user_id}"
    email = f"serialization-{user_id}@example.test"
    user = CurrentUser(id=user_id, normalized_email=email, display_name="Serialization User")
    with disposable_engine.begin() as connection:
        connection.execute(
            text(
                """INSERT INTO users (id, identity_provider, identity_subject, normalized_email, display_name)
                VALUES (:id, 'test', :subject, :email, :display_name)"""
            ),
            {"id": user_id, "subject": subject, "email": email, "display_name": user.display_name},
        )

    app.dependency_overrides[require_current_user] = lambda: user
    monkeypatch.setattr(onboarding, "get_engine", lambda: disposable_engine)
    household_id: str | None = None
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            created = await client.post(
                "/v1/households",
                json={"name": "Serialization test", "time_zone": "Europe/London"},
            )
            assert created.status_code == 201
            household = created.json()["household"]
            household_id = household["id"]
            expected_household = {
                "id": household_id,
                "name": "Serialization test",
                "time_zone": "Europe/London",
                "role": "owner",
            }
            assert household == expected_household

            me = await client.get("/v1/me")
            households = await client.get("/v1/households")

        assert me.status_code == 200
        assert me.json()["households"] == [expected_household]
        assert households.status_code == 200
        assert households.json()["households"] == [expected_household]
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            if household_id:
                connection.execute(
                    text("DELETE FROM household_members WHERE household_id = :household_id"),
                    {"household_id": household_id},
                )
                connection.execute(
                    text("DELETE FROM households WHERE id = :household_id"),
                    {"household_id": household_id},
                )
            connection.execute(text("DELETE FROM users WHERE id = :user_id"), {"user_id": user_id})
