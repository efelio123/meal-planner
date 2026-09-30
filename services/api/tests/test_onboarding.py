from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient

from meal_planner_api import onboarding
from meal_planner_api.auth import CurrentIdentity
from meal_planner_api.main import app
from meal_planner_api.onboarding import require_current_user


class Result:
    def __init__(self, value=None) -> None:
        self.value = value

    def mappings(self):
        return self

    def one(self):
        return self.value

    def one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value


class Connection:
    def __init__(self, results: list[Result]) -> None:
        self.results = results

    def execute(self, statement, parameters=None):
        return self.results.pop(0)


class Engine:
    def __init__(self, connections: list[Connection]) -> None:
        self.connections = connections

    def begin(self):
        engine = self

        class Transaction:
            def __enter__(self):
                return engine.connections.pop(0)

            def __exit__(self, exc_type, exc, traceback):
                return False

        return Transaction()


USER = onboarding.CurrentUser("user-id", "person@example.test", "Person")


def test_provisioning_returns_one_local_user_for_an_existing_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(onboarding, "_profile_for", lambda identity: ("person@example.test", "Person", None))
    engine = Engine([Connection([Result(), Result({"id": "user-id", "normalized_email": "person@example.test", "display_name": "Person", "avatar_url": None, "deleted_at": None}), Result()])])

    user = onboarding.resolve_current_user(CurrentIdentity("clerk", "user_123"), engine)

    assert user == USER


def test_create_household_rejects_an_invalid_iana_time_zone() -> None:
    with pytest.raises(HTTPException) as error:
        onboarding.create_household(USER, "Home", "not/a-time-zone")
    assert error.value.status_code == 400


def test_email_only_clerk_profile_has_no_display_name_and_keeps_avatar(monkeypatch: pytest.MonkeyPatch) -> None:
    email_address = SimpleNamespace(
        id="email-primary",
        email_address="person@example.test",
        verification=SimpleNamespace(status="verified"),
    )
    profile = SimpleNamespace(
        primary_email_address_id="email-primary",
        email_addresses=[email_address],
        first_name=None,
        last_name=None,
        image_url="https://images.example.test/avatar.png",
    )
    monkeypatch.setattr(onboarding, "get_clerk_client", lambda: SimpleNamespace(users=SimpleNamespace(get=lambda user_id: profile)))

    assert onboarding._profile_for(CurrentIdentity("clerk", "user_123")) == (
        "person@example.test",
        None,
        "https://images.example.test/avatar.png",
    )


def test_clerk_first_and_last_names_are_combined_and_trimmed(monkeypatch: pytest.MonkeyPatch) -> None:
    email_address = SimpleNamespace(id="primary", email_address="person@example.test", verification=SimpleNamespace(status="verified"))
    profile = SimpleNamespace(
        primary_email_address_id="primary", email_addresses=[email_address],
        first_name="  Ada ", last_name=" Lovelace  ", image_url=None,
    )
    monkeypatch.setattr(onboarding, "get_clerk_client", lambda: SimpleNamespace(users=SimpleNamespace(get=lambda user_id: profile)))

    assert onboarding._profile_for(CurrentIdentity("clerk", "user_123")) == ("person@example.test", "Ada Lovelace", None)


@pytest.mark.parametrize("display_name", [None, "  ", "x" * 81, "bad\u007fname"])
def test_clerk_profiles_without_a_valid_display_name_require_completion(display_name: str | None, monkeypatch: pytest.MonkeyPatch) -> None:
    email_address = SimpleNamespace(id="primary", email_address="person@example.test", verification=SimpleNamespace(status="verified"))
    profile = SimpleNamespace(
        primary_email_address_id="primary", email_addresses=[email_address],
        first_name=display_name, last_name=None, image_url=None,
    )
    monkeypatch.setattr(onboarding, "get_clerk_client", lambda: SimpleNamespace(users=SimpleNamespace(get=lambda user_id: profile)))

    assert onboarding._profile_for(CurrentIdentity("clerk", "user_123"))[1] is None


@pytest.mark.anyio
async def test_email_only_account_gets_profile_completion_conflict_without_signout(monkeypatch: pytest.MonkeyPatch) -> None:
    email_address = SimpleNamespace(id="primary", email_address="person@example.test", verification=SimpleNamespace(status="verified"))
    profile = SimpleNamespace(primary_email_address_id="primary", email_addresses=[email_address], first_name=None, last_name=None, image_url=None)
    monkeypatch.setattr(onboarding, "get_clerk_client", lambda: SimpleNamespace(users=SimpleNamespace(get=lambda user_id: profile)))
    engine = Engine([Connection([
        Result(),
        Result({"id": "user-id", "normalized_email": "person@example.test", "display_name": "Name not set yet", "avatar_url": None, "deleted_at": None}),
        Result(),
    ])])
    app.dependency_overrides[require_current_user] = lambda: onboarding.resolve_current_user(CurrentIdentity("clerk", "user_123"), engine)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.get("/v1/me")
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "DISPLAY_NAME_REQUIRED"
        assert response.json()["detail"]["message"] == "Add a display name to continue."
    finally:
        app.dependency_overrides.clear()


def test_member_cannot_create_invitation() -> None:
    engine = Engine([Connection([
        Result({"id": "household-id", "name": "Home", "time_zone": "UTC"}),
        Result("member"),
    ])])
    with pytest.raises(HTTPException) as error:
        onboarding.create_invitation(USER, "household-id", "invitee@example.test", engine)
    assert error.value.status_code == 404


def test_duplicate_active_invitation_returns_conflict() -> None:
    engine = Engine([Connection([
        Result({"id": "household-id", "name": "Home", "time_zone": "UTC", "role": "owner"}),
        Result("owner"), Result(None), Result(), Result(None),
    ])])
    with pytest.raises(HTTPException) as error:
        onboarding.create_invitation(USER, "household-id", "invitee@example.test", engine)
    assert error.value.status_code == 409


def test_invitation_rejects_a_recipient_with_a_different_verified_email() -> None:
    invitation = {"id": "invite-id", "household_id": "household-id", "normalized_email": "other@example.test", "status": "pending", "expires_at": datetime.now(UTC) + timedelta(days=1)}
    engine = Engine([Connection([Result("household-id"), Result("household-id"), Result(invitation), Result(datetime.now(UTC))])])
    with pytest.raises(HTTPException) as error:
        onboarding.accept_invitation(USER, "code", engine)
    assert error.value.status_code == 403


def test_expired_invitation_is_marked_expired() -> None:
    invitation = {"id": "invite-id", "household_id": "household-id", "normalized_email": USER.normalized_email, "status": "pending", "expires_at": datetime.now(UTC) - timedelta(seconds=1)}
    engine = Engine([Connection([Result("household-id"), Result("household-id"), Result(invitation), Result(datetime.now(UTC)), Result()])])
    with pytest.raises(HTTPException) as error:
        onboarding.accept_invitation(USER, "code", engine)
    assert error.value.status_code == 410


@pytest.mark.anyio
async def test_malformed_household_and_membership_ids_are_request_validation_errors() -> None:
    app.dependency_overrides[require_current_user] = lambda: USER
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            responses = [
                await client.get("/v1/households/not-a-uuid"),
                await client.get("/v1/households/not-a-uuid/members"),
                await client.get("/v1/households/00000000-0000-0000-0000-000000000001/members/not-a-uuid"),
                await client.patch("/v1/households/00000000-0000-0000-0000-000000000001/members/not-a-uuid", json={"role": "member"}),
            ]
        assert [response.status_code for response in responses] == [422, 422, 422, 422]
    finally:
        app.dependency_overrides.clear()
