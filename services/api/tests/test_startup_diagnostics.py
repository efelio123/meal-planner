import logging
from contextlib import contextmanager
from importlib import import_module
from types import SimpleNamespace

import pytest
from httpx2 import ASGITransport, AsyncClient
from starlette.requests import Request

from meal_planner_api.auth import CurrentIdentity
from meal_planner_api.onboarding import CurrentUser, require_current_user
from meal_planner_api.startup_diagnostics import log_timing, new_request_id

auth = import_module("meal_planner_api.auth")
main = import_module("meal_planner_api.main")
onboarding = import_module("meal_planner_api.onboarding")


REQUEST_ID = "a" * 32


def request_with_id(request_id: str = REQUEST_ID) -> Request:
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/v1/me",
        "headers": [(b"authorization", b"Bearer private-session-token")],
    })
    request.state.startup_request_id = request_id
    return request


class FakeClerk:
    def __init__(self, profile=None, state=None) -> None:
        self.users = SimpleNamespace(get=lambda **_kwargs: profile)
        self.state = state

    def authenticate_request(self, _request, _options):
        return self.state


def enable_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("STARTUP_TIMING_DIAGNOSTICS", "true")


def test_clerk_verification_timing_logs_only_safe_fields(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    enable_diagnostics(monkeypatch)
    monkeypatch.setattr(auth, "get_clerk_settings", lambda: auth.ClerkSettings("secret-value", None, None, None))
    monkeypatch.setattr(auth, "get_clerk_client", lambda: FakeClerk(state=SimpleNamespace(
        is_signed_in=True, payload={"sub": "private-subject"}
    )))

    with caplog.at_level(logging.INFO, logger="meal_planner_api.startup_timing"):
        auth.require_identity(request_with_id())

    assert "request_id=" + REQUEST_ID in caplog.text
    assert "stage=clerk_token_verification" in caplog.text
    assert "elapsed_ms=" in caplog.text
    assert "secret-value" not in caplog.text
    assert "private-subject" not in caplog.text


def test_profile_fetch_timing_logs_no_profile_values(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    enable_diagnostics(monkeypatch)
    profile = SimpleNamespace(
        primary_email_address_id="private-address-id",
        email_addresses=[SimpleNamespace(
            id="private-address-id",
            email_address="private@example.test",
            verification=SimpleNamespace(status="verified"),
        )],
        first_name="Private",
        last_name="Person",
    )
    monkeypatch.setattr(onboarding, "get_clerk_client", lambda: FakeClerk(profile=profile))

    with caplog.at_level(logging.INFO, logger="meal_planner_api.startup_timing"):
        onboarding._profile_for(CurrentIdentity("clerk", "private-subject"), REQUEST_ID)

    assert "stage=clerk_user_profile_fetch" in caplog.text
    assert "private@example.test" not in caplog.text
    assert "Private Person" not in caplog.text
    assert "private-subject" not in caplog.text


class FakeResult:
    def mappings(self):
        return self

    def one_or_none(self):
        return {"id": "private-user-id", "normalized_email": "person@example.test", "display_name": "Person", "deleted_at": None}


class FakeConnection:
    def execute(self, *_args, **_kwargs):
        return FakeResult()


class FakeEngine:
    @contextmanager
    def begin(self):
        yield FakeConnection()


class FakeHouseholdResult:
    def mappings(self):
        return self

    def all(self):
        return []


class FakeHouseholdConnection:
    def execute(self, *_args, **_kwargs):
        return FakeHouseholdResult()


class FakeHouseholdEngine:
    @contextmanager
    def connect(self):
        yield FakeHouseholdConnection()


def test_database_provision_timing_logs_no_user_values(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    enable_diagnostics(monkeypatch)
    profile = SimpleNamespace(
        primary_email_address_id="address-id",
        email_addresses=[SimpleNamespace(
            id="address-id",
            email_address="person@example.test",
            verification=SimpleNamespace(status="verified"),
        )],
        first_name="Person",
        last_name=None,
    )
    monkeypatch.setattr(onboarding, "get_clerk_client", lambda: FakeClerk(profile=profile))

    with caplog.at_level(logging.INFO, logger="meal_planner_api.startup_timing"):
        onboarding.resolve_current_user(CurrentIdentity("clerk", "private-subject"), FakeEngine(), REQUEST_ID)

    assert "stage=database_user_provision" in caplog.text
    assert "person@example.test" not in caplog.text
    assert "private-user-id" not in caplog.text
    assert "private-subject" not in caplog.text


def test_database_household_query_has_its_own_timing(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    enable_diagnostics(monkeypatch)

    with caplog.at_level(logging.INFO, logger="meal_planner_api.startup_timing"):
        onboarding.list_households(CurrentUser("private-id", "private@example.test", "Private"), FakeHouseholdEngine(), REQUEST_ID)

    assert "stage=database_households_query" in caplog.text
    assert "private-id" not in caplog.text
    assert "private@example.test" not in caplog.text
    assert "Private" not in caplog.text


@pytest.mark.anyio
async def test_me_middleware_correlates_request_and_logs_status_only(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    enable_diagnostics(monkeypatch)
    monkeypatch.setattr(main, "list_households", lambda _user, **_kwargs: [])
    main.app.dependency_overrides[require_current_user] = lambda: CurrentUser(
        id="private-user-id", normalized_email="private@example.test", display_name="Private Person"
    )
    try:
        with caplog.at_level(logging.INFO, logger="meal_planner_api.startup_timing"):
            async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://testserver") as client:
                response = await client.get("/v1/me", headers={"X-Request-ID": REQUEST_ID})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert f"request_id={REQUEST_ID}" in caplog.text
    assert "stage=request_received" in caplog.text
    assert "stage=request_complete" in caplog.text
    assert "status=200" in caplog.text
    assert "private-user-id" not in caplog.text
    assert "private@example.test" not in caplog.text
    assert "Private Person" not in caplog.text


def test_diagnostics_are_disabled_without_both_development_flags(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("STARTUP_TIMING_DIAGNOSTICS", "true")

    with caplog.at_level(logging.INFO, logger="meal_planner_api.startup_timing"):
        log_timing(REQUEST_ID, "request_received", 0)

    assert caplog.text == ""


def test_request_id_rejects_non_anonymous_values() -> None:
    assert new_request_id("private@example.test") != "private@example.test"
    assert len(new_request_id(None)) == 32
