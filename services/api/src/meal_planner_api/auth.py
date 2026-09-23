"""Clerk session-token verification and local-user provisioning boundary."""

from dataclasses import dataclass
from functools import lru_cache
from os import environ

from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request, status


@dataclass(frozen=True)
class ClerkSettings:
    secret_key: str
    authorized_parties: list[str] | None
    audience: list[str] | None
    jwt_key: str | None


@dataclass(frozen=True)
class CurrentIdentity:
    provider: str
    subject: str


def _required(name: str) -> str:
    value = environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be configured for authenticated routes.")
    return value


def _optional_csv(name: str) -> list[str] | None:
    value = environ.get(name, "").strip()
    if not value:
        return None
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_clerk_settings() -> ClerkSettings:
    """Read trusted, server-only Clerk configuration once per process."""
    return ClerkSettings(
        secret_key=_required("CLERK_SECRET_KEY"),
        authorized_parties=_optional_csv("CLERK_AUTHORIZED_PARTIES"),
        audience=_optional_csv("CLERK_AUDIENCE"),
        jwt_key=environ.get("CLERK_JWT_KEY", "").strip() or None,
    )


@lru_cache
def get_clerk_client() -> Clerk:
    return Clerk(bearer_auth=get_clerk_settings().secret_key)


def require_identity(request: Request) -> CurrentIdentity:
    """Accept only a valid Clerk session token; never trust request identity fields."""
    authorization_values = request.headers.getlist("authorization")
    if len(authorization_values) != 1:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    scheme, separator, token = authorization_values[0].partition(" ")
    if (
        scheme != "Bearer"
        or not separator
        or not token
        or token.strip() != token
        or any(character.isspace() for character in token)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    settings = get_clerk_settings()
    state = get_clerk_client().authenticate_request(
        request,
        AuthenticateRequestOptions(
            secret_key=settings.secret_key,
            jwt_key=settings.jwt_key,
            audience=settings.audience,
            authorized_parties=settings.authorized_parties,
            accepts_token=["session_token"],
        ),
    )
    subject = state.payload.get("sub") if state.is_signed_in and state.payload else None
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return CurrentIdentity(provider="clerk", subject=subject)


IdentityDependency = Depends(require_identity)
