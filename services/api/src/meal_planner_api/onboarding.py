"""Transactional onboarding and household authorization services."""

import hashlib
import secrets
from dataclasses import dataclass
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, HTTPException, status
from sqlalchemy import Engine, text

from meal_planner_api.auth import CurrentIdentity, get_clerk_client, require_identity
from meal_planner_api.database import get_engine


@dataclass(frozen=True)
class CurrentUser:
    id: str
    normalized_email: str
    display_name: str


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _profile_for(identity: CurrentIdentity) -> tuple[str, str]:
    """Read the verified primary email from Clerk, never from the mobile request."""
    profile = get_clerk_client().users.get(user_id=identity.subject)
    primary_id = getattr(profile, "primary_email_address_id", None)
    primary = next(
        (address for address in profile.email_addresses if getattr(address, "id", None) == primary_id),
        None,
    )
    verification = getattr(primary, "verification", None)
    email = getattr(primary, "email_address", None)
    if getattr(verification, "status", None) != "verified" or not isinstance(email, str):
        raise _bad_request("A verified primary email address is required.")
    normalized_email = email.strip().lower()
    display_name = " ".join(
        value.strip()
        for value in (getattr(profile, "first_name", None), getattr(profile, "last_name", None))
        if isinstance(value, str) and value.strip()
    ) or normalized_email
    return normalized_email, display_name


def resolve_current_user(identity: CurrentIdentity, engine: Engine | None = None) -> CurrentUser:
    """Idempotently resolve/provision a local user for every protected route."""
    normalized_email, display_name = _profile_for(identity)
    with (engine or get_engine()).begin() as connection:
        connection.execute(
            text(
                """INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
                VALUES (:provider, :subject, :email, :display_name)
                ON CONFLICT DO NOTHING"""
            ),
            {"provider": identity.provider, "subject": identity.subject, "email": normalized_email, "display_name": display_name},
        )
        user = connection.execute(
            text(
                """SELECT id::text, normalized_email, display_name, deleted_at FROM users
                WHERE identity_provider = :provider AND identity_subject = :subject FOR UPDATE"""
            ),
            {"provider": identity.provider, "subject": identity.subject},
        ).mappings().one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Verified email is already in use",
            )
        if user["deleted_at"] is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deleted")
        if user["normalized_email"] != normalized_email:
            updated = connection.execute(
                text(
                    """UPDATE users SET normalized_email = :email, display_name = :display_name
                    WHERE id = :id AND NOT EXISTS (
                        SELECT 1 FROM users AS other
                        WHERE other.normalized_email = :email
                          AND other.deleted_at IS NULL AND other.id <> :id
                    ) RETURNING id"""
                ),
                {"id": user["id"], "email": normalized_email, "display_name": display_name},
            ).scalar_one_or_none()
            if updated is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Verified email is already in use")
            user = {**user, "normalized_email": normalized_email, "display_name": display_name}
        return CurrentUser(id=user["id"], normalized_email=user["normalized_email"], display_name=user["display_name"])


def require_current_user(
    identity: Annotated[CurrentIdentity, Depends(require_identity)],
) -> CurrentUser:
    return resolve_current_user(identity)


def _active_memberships(connection, user_id: str) -> list[dict]:
    return connection.execute(text("""SELECT h.id::text, h.name, h.time_zone, hm.role
        FROM household_members hm JOIN households h ON h.id = hm.household_id
        WHERE hm.user_id = :user_id AND hm.removed_at IS NULL AND h.deleted_at IS NULL
        ORDER BY h.created_at"""), {"user_id": user_id}).mappings().all()


def list_households(user: CurrentUser, engine: Engine | None = None) -> list[dict]:
    with (engine or get_engine()).connect() as connection:
        return list(_active_memberships(connection, user.id))


def create_household(user: CurrentUser, name: str, time_zone: str, engine: Engine | None = None) -> dict:
    if not name.strip() or not time_zone.strip():
        raise _bad_request("Household name and time zone are required.")
    try:
        ZoneInfo(time_zone.strip())
    except ZoneInfoNotFoundError as error:
        raise _bad_request("Household time zone must be a valid IANA time-zone name.") from error
    with (engine or get_engine()).begin() as connection:
        household = connection.execute(text("""INSERT INTO households (name, time_zone, created_by_user_id)
            VALUES (:name, :time_zone, :user_id) RETURNING id::text, name, time_zone"""),
            {"name": name.strip(), "time_zone": time_zone.strip(), "user_id": user.id}).mappings().one()
        connection.execute(text("""INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'owner')"""), {"household_id": household["id"], "user_id": user.id})
        return {**household, "role": "owner"}


def _require_owner(connection, household_id: str, user_id: str) -> None:
    allowed = connection.execute(text("""SELECT 1 FROM household_members hm
        JOIN households h ON h.id = hm.household_id
        WHERE hm.household_id = :household_id AND hm.user_id = :user_id
          AND hm.removed_at IS NULL AND h.deleted_at IS NULL AND hm.role = 'owner'"""),
        {"household_id": household_id, "user_id": user_id}).scalar_one_or_none()
    if allowed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")


def create_invitation(user: CurrentUser, household_id: str, email: str, engine: Engine | None = None) -> dict:
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise _bad_request("Invitation email is required.")
    code = secrets.token_urlsafe(32)
    digest = hashlib.sha256(code.encode()).hexdigest()
    with (engine or get_engine()).begin() as connection:
        _require_owner(connection, household_id, user.id)
        connection.execute(text("""UPDATE household_invitations SET status = 'expired'
            WHERE household_id = :household_id AND normalized_email = :email
              AND status = 'pending' AND expires_at <= CURRENT_TIMESTAMP"""), {"household_id": household_id, "email": normalized_email})
        invitation = connection.execute(text("""INSERT INTO household_invitations
            (household_id, normalized_email, invited_role, created_by_user_id, token_digest, expires_at)
            VALUES (:household_id, :email, 'member', :user_id, :digest, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (household_id, normalized_email) WHERE status = 'pending' DO NOTHING
            RETURNING id::text, expires_at"""), {"household_id": household_id, "email": normalized_email, "user_id": user.id, "digest": digest}).mappings().one_or_none()
        if invitation is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An active invitation already exists")
    return {"id": invitation["id"], "expires_at": invitation["expires_at"], "code": code}


def accept_invitation(user: CurrentUser, code: str, engine: Engine | None = None) -> None:
    digest = hashlib.sha256(code.encode()).hexdigest()
    with (engine or get_engine()).begin() as connection:
        invitation = connection.execute(text("""SELECT id::text, household_id::text, normalized_email, status, expires_at
            FROM household_invitations WHERE token_digest = :digest FOR UPDATE"""), {"digest": digest}).mappings().one_or_none()
        if invitation is None or invitation["status"] != "pending":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
        if invitation["expires_at"] <= connection.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one():
            connection.execute(text("UPDATE household_invitations SET status = 'expired' WHERE id = :id"), {"id": invitation["id"]})
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation expired")
        if invitation["normalized_email"] != user.normalized_email:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invitation email does not match")
        connection.execute(text("""UPDATE household_members SET removed_at = NULL, role = 'member'
            WHERE id = (SELECT id FROM household_members WHERE household_id = :household_id
                AND user_id = :user_id AND removed_at IS NOT NULL ORDER BY removed_at DESC LIMIT 1)"""),
            {"household_id": invitation["household_id"], "user_id": user.id})
        exists = connection.execute(text("SELECT 1 FROM household_members WHERE household_id = :household_id AND user_id = :user_id AND removed_at IS NULL"), {"household_id": invitation["household_id"], "user_id": user.id}).scalar_one_or_none()
        if exists is None:
            connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"), {"household_id": invitation["household_id"], "user_id": user.id})
        connection.execute(text("UPDATE household_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": invitation["id"]})


def revoke_invitation(user: CurrentUser, household_id: str, invitation_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        _require_owner(connection, household_id, user.id)
        updated = connection.execute(text("""UPDATE household_invitations
            SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
            WHERE id = :invitation_id AND household_id = :household_id AND status = 'pending'
            RETURNING id"""), {"invitation_id": invitation_id, "household_id": household_id}).scalar_one_or_none()
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
