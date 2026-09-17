import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from starlette.requests import Request

from meal_planner_api import auth
from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user


class FakeState:
    def __init__(self, subject: str | None) -> None:
        self.is_signed_in = subject is not None
        self.payload = {"sub": subject} if subject else None


class FakeClerk:
    def __init__(self, state: FakeState) -> None:
        self.state = state
        self.calls = 0

    def authenticate_request(self, request: Request, options: object) -> FakeState:
        self.calls += 1
        return self.state


def request_with_headers(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


@pytest.mark.parametrize(
    "headers",
    [[], [(b"authorization", b"Basic value")], [(b"authorization", b"Bearer one"), (b"authorization", b"Bearer two")]],
)
def test_require_identity_rejects_missing_malformed_or_duplicate_bearer_headers(
    monkeypatch: pytest.MonkeyPatch, headers: list[tuple[bytes, bytes]]
) -> None:
    clerk = FakeClerk(FakeState("user_123"))
    monkeypatch.setattr(auth, "get_clerk_client", lambda: clerk)

    with pytest.raises(HTTPException) as error:
        auth.require_identity(request_with_headers(headers))

    assert error.value.status_code == 401
    assert clerk.calls == 0


def test_require_identity_accepts_only_a_verified_clerk_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = auth.ClerkSettings("secret", ["native-client"], None, None)
    clerk = FakeClerk(FakeState("user_123"))
    monkeypatch.setattr(auth, "get_clerk_settings", lambda: settings)
    monkeypatch.setattr(auth, "get_clerk_client", lambda: clerk)

    identity = auth.require_identity(
        request_with_headers([(b"authorization", b"Bearer session-token")])
    )

    assert identity == auth.CurrentIdentity(provider="clerk", subject="user_123")
    assert clerk.calls == 1


@pytest.mark.anyio
async def test_invitation_request_rejects_an_invalid_email() -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUser(
        id="user-id", normalized_email="person@example.test", display_name="Person"
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            response = await client.post(
                "/v1/households/household-id/invitations", json={"email": "not-an-email"}
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
