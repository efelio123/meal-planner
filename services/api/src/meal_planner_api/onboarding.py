"""Transactional onboarding and household authorization services."""

import hashlib
import secrets
import unicodedata
from time import perf_counter
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import Engine, text

from meal_planner_api.auth import CurrentIdentity, get_clerk_client, require_identity
from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import (
    expire_stale_invitation,
    lock_household,
)
from meal_planner_api.startup_diagnostics import elapsed_ms, log_timing, request_id_for


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


DISPLAY_NAME_PLACEHOLDER = "Name not set yet"


def _usable_display_name(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    display_name = value.strip()
    if not display_name or len(display_name) > 80 or any(unicodedata.category(char) == "Cc" for char in display_name):
        return None
    return display_name


def _profile_for(identity: CurrentIdentity, request_id: str | None = None) -> tuple[str, str | None, str | None]:
    """Read the verified primary email from Clerk, never from the mobile request."""
    profile_started_at = perf_counter()
    try:
        profile = get_clerk_client().users.get(user_id=identity.subject)
    finally:
        log_timing(request_id, "clerk_user_profile_fetch", elapsed_ms(profile_started_at))
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
    display_name = _usable_display_name(" ".join(
        value.strip()
        for value in (getattr(profile, "first_name", None), getattr(profile, "last_name", None))
        if isinstance(value, str) and value.strip()
    ))
    avatar_url = getattr(profile, "image_url", None)
    return normalized_email, display_name, avatar_url if isinstance(avatar_url, str) and avatar_url.strip() else None


def resolve_current_user(
    identity: CurrentIdentity,
    engine: Engine | None = None,
    request_id: str | None = None,
) -> CurrentUser:
    """Idempotently resolve/provision a local user for every protected route."""
    profile = _profile_for(identity, request_id) if request_id is not None else _profile_for(identity)
    normalized_email, display_name, avatar_url = profile
    stored_display_name = display_name or DISPLAY_NAME_PLACEHOLDER
    database_started_at = perf_counter()
    try:
        with (engine or get_engine()).begin() as connection:
            connection.execute(
                text(
                    """INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name, avatar_url)
                    VALUES (:provider, :subject, :email, :display_name, :avatar_url)
                    ON CONFLICT DO NOTHING"""
                ),
                    {"provider": identity.provider, "subject": identity.subject, "email": normalized_email, "display_name": stored_display_name, "avatar_url": avatar_url},
            )
            user = connection.execute(
                text(
                    """SELECT id::text, normalized_email, display_name, avatar_url, deleted_at FROM users
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
                        """UPDATE users SET normalized_email = :email, display_name = :display_name,
                            avatar_url = :avatar_url, updated_at = CURRENT_TIMESTAMP
                        WHERE id = :id AND NOT EXISTS (
                            SELECT 1 FROM users AS other
                            WHERE other.normalized_email = :email
                              AND other.deleted_at IS NULL AND other.id <> :id
                        ) RETURNING id"""
                    ),
                    {"id": user["id"], "email": normalized_email, "display_name": stored_display_name, "avatar_url": avatar_url},
                ).scalar_one_or_none()
                if updated is None:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Verified email is already in use")
                user = {**user, "normalized_email": normalized_email, "display_name": stored_display_name, "avatar_url": avatar_url}
            else:
                connection.execute(text("""UPDATE users SET display_name = :display_name,
                    avatar_url = :avatar_url, updated_at = CURRENT_TIMESTAMP WHERE id = :id"""),
                    {"id": user["id"], "display_name": stored_display_name, "avatar_url": avatar_url})
                user = {**user, "display_name": stored_display_name, "avatar_url": avatar_url}
            result = CurrentUser(id=user["id"], normalized_email=user["normalized_email"], display_name=user["display_name"])
    finally:
        log_timing(request_id, "database_user_provision", elapsed_ms(database_started_at))
    # Commit the local identity before returning this gate: the signed-in client
    # completes the profile directly with Clerk, then retries its normal API load.
    if display_name is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DISPLAY_NAME_REQUIRED", "message": "Add a display name to continue."},
        )
    return result


def require_current_user(
    identity: Annotated[CurrentIdentity, Depends(require_identity)],
    request: Request,
) -> CurrentUser:
    return resolve_current_user(identity, request_id=request_id_for(request))


def _active_memberships(connection, user_id: str) -> list[dict]:
    return connection.execute(text("""SELECT h.id::text, h.name, h.time_zone, hm.role
        FROM household_members hm JOIN households h ON h.id = hm.household_id
        WHERE hm.user_id = :user_id AND hm.removed_at IS NULL AND h.deleted_at IS NULL
        ORDER BY h.created_at"""), {"user_id": user_id}).mappings().all()


def list_households(
    user: CurrentUser,
    engine: Engine | None = None,
    request_id: str | None = None,
) -> list[dict]:
    database_started_at = perf_counter()
    try:
        with (engine or get_engine()).connect() as connection:
            return [dict(household) for household in _active_memberships(connection, user.id)]
    finally:
        log_timing(request_id, "database_households_query", elapsed_ms(database_started_at))


def create_household(user: CurrentUser, name: str, time_zone: str, engine: Engine | None = None) -> dict:
    if not name.strip() or not time_zone.strip():
        raise _bad_request("Household name and time zone are required.")
    try:
        ZoneInfo(time_zone.strip())
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise _bad_request("Household time zone must be a valid IANA time-zone name.") from error
    with (engine or get_engine()).begin() as connection:
        household = connection.execute(text("""INSERT INTO households (name, time_zone, created_by_user_id)
            VALUES (:name, :time_zone, :user_id) RETURNING id::text, name, time_zone"""),
            {"name": name.strip(), "time_zone": time_zone.strip(), "user_id": user.id}).mappings().one()
        connection.execute(text("""INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'owner')"""), {"household_id": household["id"], "user_id": user.id})
        connection.execute(text("""INSERT INTO shopping_lists (household_id)
            VALUES (:household_id) ON CONFLICT (household_id) DO NOTHING"""), {"household_id": household["id"]})
        return {**household, "role": "owner"}


def create_invitation(user: CurrentUser, household_id: str, email: str, engine: Engine | None = None) -> dict:
    normalized_email = email.strip().lower()
    if not normalized_email:
        raise _bad_request("Invitation email is required.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        already_member = connection.execute(text("""SELECT 1 FROM household_members hm
            JOIN users u ON u.id = hm.user_id WHERE hm.household_id = :household_id
              AND u.normalized_email = :email AND u.deleted_at IS NULL AND hm.removed_at IS NULL"""),
            {"household_id": household_id, "email": normalized_email}).scalar_one_or_none()
        if already_member is not None:
            raise HTTPException(status_code=409, detail={"code": "HOUSEHOLD_MEMBER_ALREADY_EXISTS", "message": "This person is already a member of this household."})
        expire_stale_invitation(connection, household_id, normalized_email)
        code = secrets.token_urlsafe(32)
        digest = hashlib.sha256(code.encode()).hexdigest()
        invitation = connection.execute(text("""INSERT INTO household_invitations
            (household_id, normalized_email, invited_role, created_by_user_id, token_digest, expires_at)
            VALUES (:household_id, :email, 'member', :user_id, :digest, CURRENT_TIMESTAMP + INTERVAL '7 days')
            ON CONFLICT (household_id, normalized_email) WHERE status = 'pending' DO NOTHING
            RETURNING id::text, expires_at"""), {"household_id": household_id, "email": normalized_email, "user_id": user.id, "digest": digest}).mappings().one_or_none()
        if invitation is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "INVITATION_ALREADY_PENDING", "message": "An active invitation already exists."})
    return {"id": invitation["id"], "expires_at": invitation["expires_at"], "code": code}


def accept_invitation(user: CurrentUser, code: str, engine: Engine | None = None) -> None:
    digest = hashlib.sha256(code.encode()).hexdigest()
    expired = False
    already_member = False
    with (engine or get_engine()).begin() as connection:
        candidate = connection.execute(text("SELECT household_id::text FROM household_invitations WHERE token_digest = :digest"), {"digest": digest}).scalar_one_or_none()
        if candidate is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
        household_is_live = connection.execute(text("SELECT id FROM households WHERE id = :household_id AND deleted_at IS NULL FOR UPDATE"), {"household_id": candidate}).scalar_one_or_none()
        if household_is_live is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
        invitation = connection.execute(text("""SELECT id::text, household_id::text, normalized_email, status, expires_at
            FROM household_invitations WHERE token_digest = :digest FOR UPDATE"""), {"digest": digest}).mappings().one_or_none()
        if invitation is None or invitation["status"] != "pending":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
        if invitation["expires_at"] <= connection.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one():
            connection.execute(text("UPDATE household_invitations SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": invitation["id"]})
            expired = True
        if not expired and invitation["normalized_email"] != user.normalized_email:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invitation email does not match")
        if not expired:
            exists = connection.execute(text("SELECT 1 FROM household_members WHERE household_id = :household_id AND user_id = :user_id AND removed_at IS NULL"), {"household_id": invitation["household_id"], "user_id": user.id}).scalar_one_or_none()
            if exists is not None:
                connection.execute(text("UPDATE household_invitations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": invitation["id"]})
                already_member = True
            else:
                connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"), {"household_id": invitation["household_id"], "user_id": user.id})
                connection.execute(text("UPDATE household_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": invitation["id"]})
    if expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation expired")
    if already_member:
        raise HTTPException(status_code=409, detail={"code": "HOUSEHOLD_MEMBER_ALREADY_EXISTS", "message": "This person is already a member of this household."})


def revoke_invitation(user: CurrentUser, household_id: str, invitation_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        updated = connection.execute(text("""UPDATE household_invitations
            SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = :invitation_id AND household_id = :household_id AND status = 'pending'
            RETURNING id"""), {"invitation_id": invitation_id, "household_id": household_id}).scalar_one_or_none()
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
