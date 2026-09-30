"""Household management services with household-scoped authorization."""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import Engine, text

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Household not found")


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": code, "message": message})


def lock_household(connection, household_id: str, user_id: str, *, owner: bool = False) -> dict:
    """Lock the live household before reading the caller's current membership."""
    household = connection.execute(text("""
        SELECT id::text, name, time_zone
        FROM households
        WHERE id = :household_id AND deleted_at IS NULL
        FOR UPDATE
    """), {"household_id": household_id}).mappings().one_or_none()
    if household is None:
        raise _not_found()
    role = connection.execute(text("""
        SELECT role FROM household_members
        WHERE household_id = :household_id AND user_id = :user_id
          AND removed_at IS NULL
    """), {"household_id": household_id, "user_id": user_id}).scalar_one_or_none()
    if role is None or (owner and role != "owner"):
        raise _not_found()
    return {**dict(household), "role": role}


def household_detail(user: CurrentUser, household_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        row = connection.execute(text("""
            SELECT h.id::text, h.name, h.time_zone, hm.role
            FROM households h JOIN household_members hm ON hm.household_id = h.id
            WHERE h.id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
        """), {"household_id": household_id, "user_id": user.id}).mappings().one_or_none()
    if row is None:
        raise _not_found()
    return dict(row)


def update_household(user: CurrentUser, household_id: str, name: str | None, time_zone: str | None, engine: Engine | None = None) -> dict:
    if name is not None and not name.strip():
        raise HTTPException(status_code=400, detail="Household name is required.")
    if time_zone is not None:
        try:
            ZoneInfo(time_zone.strip())
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise HTTPException(status_code=400, detail="Household time zone must be a valid IANA time-zone name.") from error
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        row = connection.execute(text("""
            UPDATE households SET name = COALESCE(:name, name),
                time_zone = COALESCE(:time_zone, time_zone), updated_at = CURRENT_TIMESTAMP
            WHERE id = :household_id AND deleted_at IS NULL
            RETURNING id::text, name, time_zone
        """), {"household_id": household_id, "name": name.strip() if name is not None else None,
                "time_zone": time_zone.strip() if time_zone is not None else None}).mappings().one()
    return {**dict(row), "role": "owner"}


def list_members(user: CurrentUser, household_id: str, engine: Engine | None = None) -> list[dict]:
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text("""
            WITH caller AS (
                SELECT hm.role
                FROM household_members hm
                JOIN households h ON h.id = hm.household_id
                WHERE hm.household_id = :household_id AND hm.user_id = :user_id
                  AND hm.removed_at IS NULL AND h.deleted_at IS NULL
            )
            SELECT hm.id::text AS membership_id,
                CASE WHEN lower(btrim(u.display_name)) = u.normalized_email
                           OR lower(btrim(u.display_name)) IN ('household member', 'name not set yet')
                           OR lower(btrim(u.display_name)) IN ('household member', 'name not set yet')
                     THEN 'Name not set yet' ELSE u.display_name END AS display_name,
                u.avatar_url, hm.role, hm.joined_at, (hm.user_id = :user_id) AS is_self,
                CASE WHEN caller.role = 'owner' THEN u.normalized_email ELSE NULL END AS email,
                caller.role AS caller_role
            FROM caller
            JOIN household_members hm ON hm.household_id = :household_id AND hm.removed_at IS NULL
            JOIN users u ON u.id = hm.user_id
            JOIN households h ON h.id = hm.household_id
            WHERE hm.household_id = :household_id AND hm.removed_at IS NULL
              AND h.deleted_at IS NULL
              AND caller.role IN ('owner', 'member')
            ORDER BY hm.joined_at, hm.id
        """), {"household_id": household_id, "user_id": user.id}).mappings().all()
    if not rows:
        raise _not_found()
    return [
        {key: value for key, value in row.items() if key not in {"caller_role", "email"}}
        | ({"email": row["email"]} if row["caller_role"] == "owner" else {})
        for row in rows
    ]


def member_detail(user: CurrentUser, household_id: str, membership_id: str, engine: Engine | None = None) -> dict:
    rows = list_members(user, household_id, engine)
    row = next((item for item in rows if item["membership_id"] == membership_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return row


def _active_owner_count(connection, household_id: str) -> int:
    return connection.execute(text("""
        SELECT count(*) FROM household_members
        WHERE household_id = :household_id AND removed_at IS NULL AND role = 'owner'
    """), {"household_id": household_id}).scalar_one()


def set_member_role(user: CurrentUser, household_id: str, membership_id: str, role: str, engine: Engine | None = None) -> None:
    if role not in {"owner", "member"}:
        raise HTTPException(status_code=400, detail="Role must be owner or member.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        target = connection.execute(text("""SELECT id, role FROM household_members
            WHERE id = :membership_id AND household_id = :household_id AND removed_at IS NULL FOR UPDATE"""),
            {"membership_id": membership_id, "household_id": household_id}).mappings().one_or_none()
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found")
        if target["role"] == "owner" and role == "member" and _active_owner_count(connection, household_id) <= 1:
            raise _conflict("LAST_OWNER", "At least one active owner must remain.")
        connection.execute(text("UPDATE household_members SET role = :role, updated_at = CURRENT_TIMESTAMP WHERE id = :id"),
                           {"role": role, "id": membership_id})


def _remove_membership(connection, household_id: str, membership_id: str) -> None:
    target = connection.execute(text("""SELECT id, role FROM household_members
        WHERE id = :membership_id AND household_id = :household_id AND removed_at IS NULL FOR UPDATE"""),
        {"membership_id": membership_id, "household_id": household_id}).mappings().one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if target["role"] == "owner" and _active_owner_count(connection, household_id) <= 1:
        raise _conflict("LAST_OWNER", "At least one active owner must remain.")
    connection.execute(text("UPDATE household_members SET removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": membership_id})


def remove_member(user: CurrentUser, household_id: str, membership_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        _remove_membership(connection, household_id, membership_id)


def leave_household(user: CurrentUser, household_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        membership_id = connection.execute(text("""SELECT id::text FROM household_members
            WHERE household_id = :household_id AND user_id = :user_id AND removed_at IS NULL"""),
            {"household_id": household_id, "user_id": user.id}).scalar_one()
        _remove_membership(connection, household_id, membership_id)


def delete_household(user: CurrentUser, household_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        connection.execute(text("""UPDATE household_invitations
            SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND status = 'pending'"""), {"household_id": household_id})
        connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :household_id"),
                           {"household_id": household_id})


def list_invitations(user: CurrentUser, household_id: str, engine: Engine | None = None) -> list[dict]:
    with (engine or get_engine()).connect() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        rows = connection.execute(text("""SELECT id::text, normalized_email, expires_at
            FROM household_invitations WHERE household_id = :household_id AND status = 'pending'
              AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at, id"""), {"household_id": household_id}).mappings().all()
    return [dict(row) for row in rows]


def reissue_invitation(user: CurrentUser, household_id: str, invitation_id: str, engine: Engine | None = None) -> dict:
    import hashlib
    import secrets

    expired = False
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id, owner=True)
        invitation = connection.execute(text("""SELECT id::text, normalized_email, expires_at
            FROM household_invitations WHERE id = :invitation_id AND household_id = :household_id
              AND status = 'pending' FOR UPDATE"""),
            {"invitation_id": invitation_id, "household_id": household_id}).mappings().one_or_none()
        if invitation is None:
            raise HTTPException(status_code=404, detail="Invitation not found")
        now = connection.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one()
        if invitation["expires_at"] <= now:
            connection.execute(text("UPDATE household_invitations SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": invitation_id})
            expired = True
        else:
            already_member = connection.execute(text("""SELECT 1 FROM household_members hm
                JOIN users u ON u.id = hm.user_id WHERE hm.household_id = :household_id
                  AND u.normalized_email = :email AND u.deleted_at IS NULL AND hm.removed_at IS NULL"""),
                {"household_id": household_id, "email": invitation["normalized_email"]}).scalar_one_or_none()
            if already_member is not None:
                raise HTTPException(status_code=409, detail={"code": "HOUSEHOLD_MEMBER_ALREADY_EXISTS", "message": "This person is already a member of this household."})
            code = secrets.token_urlsafe(32)
            digest = hashlib.sha256(code.encode()).hexdigest()
            connection.execute(text("UPDATE household_invitations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": invitation_id})
            replacement = connection.execute(text("""INSERT INTO household_invitations
                (household_id, normalized_email, invited_role, created_by_user_id, token_digest, expires_at)
                VALUES (:household_id, :email, 'member', :user_id, :digest, CURRENT_TIMESTAMP + INTERVAL '7 days')
                RETURNING id::text, expires_at"""),
                {"household_id": household_id, "email": invitation["normalized_email"], "user_id": user.id, "digest": digest}).mappings().one()
    if expired:
        raise HTTPException(status_code=410, detail="Invitation expired")
    return {**dict(replacement), "code": code}


def expire_stale_invitation(connection, household_id: str, email: str) -> None:
    connection.execute(text("""UPDATE household_invitations SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE household_id = :household_id AND normalized_email = :email
          AND status = 'pending' AND expires_at <= CURRENT_TIMESTAMP"""), {"household_id": household_id, "email": email})
