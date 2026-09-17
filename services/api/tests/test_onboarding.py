from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from meal_planner_api import onboarding
from meal_planner_api.auth import CurrentIdentity


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
    monkeypatch.setattr(onboarding, "_profile_for", lambda identity: ("person@example.test", "Person"))
    engine = Engine([Connection([Result(), Result({"id": "user-id", "normalized_email": "person@example.test", "display_name": "Person", "deleted_at": None})])])

    user = onboarding.resolve_current_user(CurrentIdentity("clerk", "user_123"), engine)

    assert user == USER


def test_create_household_rejects_an_invalid_iana_time_zone() -> None:
    with pytest.raises(HTTPException) as error:
        onboarding.create_household(USER, "Home", "not/a-time-zone")
    assert error.value.status_code == 400


def test_member_cannot_create_invitation() -> None:
    engine = Engine([Connection([Result(None)])])
    with pytest.raises(HTTPException) as error:
        onboarding.create_invitation(USER, "household-id", "invitee@example.test", engine)
    assert error.value.status_code == 404


def test_duplicate_active_invitation_returns_conflict() -> None:
    engine = Engine([Connection([Result(1), Result(), Result(None)])])
    with pytest.raises(HTTPException) as error:
        onboarding.create_invitation(USER, "household-id", "invitee@example.test", engine)
    assert error.value.status_code == 409


def test_invitation_rejects_a_recipient_with_a_different_verified_email() -> None:
    invitation = {"id": "invite-id", "household_id": "household-id", "normalized_email": "other@example.test", "status": "pending", "expires_at": datetime.now(UTC) + timedelta(days=1)}
    engine = Engine([Connection([Result(invitation), Result(datetime.now(UTC))])])
    with pytest.raises(HTTPException) as error:
        onboarding.accept_invitation(USER, "code", engine)
    assert error.value.status_code == 403


def test_expired_invitation_is_marked_expired() -> None:
    invitation = {"id": "invite-id", "household_id": "household-id", "normalized_email": USER.normalized_email, "status": "pending", "expires_at": datetime.now(UTC) - timedelta(seconds=1)}
    engine = Engine([Connection([Result(invitation), Result(datetime.now(UTC)), Result()])])
    with pytest.raises(HTTPException) as error:
        onboarding.accept_invitation(USER, "code", engine)
    assert error.value.status_code == 410
