import hashlib
import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from time import monotonic, sleep
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.engine import make_url

from meal_planner_api import household_management, onboarding, shopping_lists
from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture
def disposable_engine(monkeypatch: pytest.MonkeyPatch) -> Generator[Engine]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is not configured.")
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail("Household management integration tests require meal_planner_disposable_test only.")
    engine = create_engine(url, pool_size=4, max_overflow=0)
    with engine.connect() as connection:
        if connection.execute(text("SELECT current_database()")).scalar_one() != DISPOSABLE_TEST_DATABASE:
            engine.dispose()
            pytest.fail("Connected database is not meal_planner_disposable_test.")
    monkeypatch.setattr(household_management, "get_engine", lambda: engine)
    monkeypatch.setattr(onboarding, "get_engine", lambda: engine)
    monkeypatch.setattr(shopping_lists, "get_engine", lambda: engine)
    try:
        yield engine
    finally:
        engine.dispose()


def insert_user(connection, label: str) -> tuple[str, str]:
    user_id = str(uuid4())
    email = f"{label}-{user_id}@example.com"
    connection.execute(text("""INSERT INTO users
        (id, identity_provider, identity_subject, normalized_email, display_name)
        VALUES (:id, 'test', :subject, :email, :name)"""),
        {"id": user_id, "subject": f"{label}-{user_id}", "email": email, "name": label.title()})
    return user_id, email


def insert_household(connection, user_id: str, name: str = "Test home") -> str:
    household_id = connection.execute(text("""INSERT INTO households (name, time_zone, created_by_user_id)
        VALUES (:name, 'America/Phoenix', :user_id) RETURNING id::text"""),
        {"name": f"{name} {uuid4()}", "user_id": user_id}).scalar_one()
    connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'owner')"),
                       {"household_id": household_id, "user_id": user_id})
    connection.execute(text("INSERT INTO shopping_lists (household_id) VALUES (:household_id)"), {"household_id": household_id})
    return household_id


def as_user(user_id: str, email: str) -> CurrentUser:
    return CurrentUser(user_id, email, "Test member")


def race_engine(disposable_engine: Engine, application_name: str) -> Engine:
    return create_engine(
        disposable_engine.url,
        pool_size=1,
        max_overflow=0,
        connect_args={"application_name": application_name},
    )


def wait_for_lock_wait(disposable_engine: Engine, application_name: str) -> None:
    deadline = monotonic() + 10
    while monotonic() < deadline:
        with disposable_engine.connect() as connection:
            waiting = connection.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE application_name = :application_name
                      AND wait_event_type = 'Lock'
                )
            """), {"application_name": application_name}).scalar_one()
        if waiting:
            return
        sleep(0.02)
    raise AssertionError(f"PostgreSQL session {application_name} did not block on the household lock.")


async def request_as(client: AsyncClient, user_id: str, email: str, method: str, path: str, **kwargs):
    app.dependency_overrides[require_current_user] = lambda: as_user(user_id, email)
    return await client.request(method, path, **kwargs)


@pytest.mark.anyio
async def test_member_privacy_and_household_isolation_for_management_routes(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        owner_id, owner_email = insert_user(connection, "owner")
        member_id, member_email = insert_user(connection, "member")
        connection.execute(text("UPDATE users SET display_name = normalized_email WHERE id = :id"), {"id": member_id})
        foreign_id, foreign_email = insert_user(connection, "foreign")
        removed_id, removed_email = insert_user(connection, "removed")
        household_id = insert_household(connection, owner_id)
        foreign_household_id = insert_household(connection, foreign_id, "Foreign home")
        member_row_id = connection.execute(text("""INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'member') RETURNING id::text"""),
            {"household_id": household_id, "user_id": member_id}).scalar_one()
        connection.execute(text("""INSERT INTO household_members (household_id, user_id, role, removed_at)
            VALUES (:household_id, :user_id, 'member', CURRENT_TIMESTAMP)"""),
            {"household_id": household_id, "user_id": removed_id})
        invitation_id = connection.execute(text("""INSERT INTO household_invitations
            (household_id, normalized_email, created_by_user_id, token_digest, expires_at)
            VALUES (:household_id, 'pending@example.com', :owner_id, :digest, CURRENT_TIMESTAMP + INTERVAL '1 day')
            RETURNING id::text"""), {"household_id": household_id, "owner_id": owner_id, "digest": str(uuid4())}).scalar_one()
        item_id = connection.execute(text("""INSERT INTO shopping_list_items (shopping_list_id, name, created_by_user_id)
            SELECT id, 'Protected item', :owner_id FROM shopping_lists WHERE household_id = :household_id RETURNING id::text"""),
            {"owner_id": owner_id, "household_id": household_id}).scalar_one()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            owner_members = await request_as(client, owner_id, owner_email, "GET", f"/v1/households/{household_id}/members")
            member_members = await request_as(client, member_id, member_email, "GET", f"/v1/households/{household_id}/members")
            assert owner_members.status_code == member_members.status_code == 200
            owner_record = next(item for item in owner_members.json()["members"] if item["membership_id"] == member_row_id)
            member_record = next(item for item in member_members.json()["members"] if item["membership_id"] == member_row_id)
            assert owner_record["email"] == member_email
            assert owner_record["display_name"] == "Name not set yet"
            assert owner_record["is_self"] is False
            assert "email" not in member_record
            assert member_record["display_name"] == "Name not set yet"
            assert member_record["is_self"] is True

            foreign_read = await request_as(client, foreign_id, foreign_email, "GET", f"/v1/households/{household_id}")
            foreign_write = await request_as(client, foreign_id, foreign_email, "PATCH", f"/v1/households/{household_id}", json={"name": "Intrusion"})
            removed_read = await request_as(client, removed_id, removed_email, "GET", f"/v1/households/{household_id}/members")
            removed_write = await request_as(client, removed_id, removed_email, "PATCH", f"/v1/households/{household_id}", json={"name": "Removed attempt"})
            assert [foreign_read.status_code, foreign_write.status_code, removed_read.status_code, removed_write.status_code] == [404] * 4

            async def assert_denied_for_nonmember(actor_id: str, actor_email: str) -> None:
                attempts = [
                    await request_as(client, actor_id, actor_email, "GET", f"/v1/households/{household_id}"),
                    await request_as(client, actor_id, actor_email, "GET", f"/v1/households/{household_id}/members/{member_row_id}"),
                    await request_as(client, actor_id, actor_email, "PATCH", f"/v1/households/{household_id}/members/{member_row_id}", json={"role": "owner"}),
                    await request_as(client, actor_id, actor_email, "DELETE", f"/v1/households/{household_id}/members/{member_row_id}"),
                    await request_as(client, actor_id, actor_email, "GET", f"/v1/households/{household_id}/invitations"),
                    await request_as(client, actor_id, actor_email, "POST", f"/v1/households/{household_id}/invitations", json={"email": "outsider@example.com"}),
                    await request_as(client, actor_id, actor_email, "POST", f"/v1/households/{household_id}/invitations/{invitation_id}/revoke"),
                    await request_as(client, actor_id, actor_email, "POST", f"/v1/households/{household_id}/invitations/{invitation_id}/reissue"),
                    await request_as(client, actor_id, actor_email, "DELETE", f"/v1/households/{household_id}/leave"),
                    await request_as(client, actor_id, actor_email, "DELETE", f"/v1/households/{household_id}"),
                    await request_as(client, actor_id, actor_email, "GET", f"/v1/households/{household_id}/shopping-list"),
                    await request_as(client, actor_id, actor_email, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"name": "Unauthorized"}),
                    await request_as(client, actor_id, actor_email, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{item_id}", json={"is_checked": True}),
                    await request_as(client, actor_id, actor_email, "DELETE", f"/v1/households/{household_id}/shopping-list/items/{item_id}"),
                ]
                assert [response.status_code for response in attempts] == [404] * len(attempts)

            await assert_denied_for_nonmember(foreign_id, foreign_email)
            await assert_denied_for_nonmember(removed_id, removed_email)

            member_change = await request_as(client, member_id, member_email, "PATCH", f"/v1/households/{household_id}/members/{member_row_id}", json={"role": "owner"})
            assert member_change.status_code == 404
            with disposable_engine.connect() as connection:
                assert connection.execute(text("SELECT name FROM households WHERE id = :id"), {"id": household_id}).scalar_one() != "Intrusion"
                assert connection.execute(text("SELECT role FROM household_members WHERE id = :id"), {"id": member_row_id}).scalar_one() == "member"
                assert connection.execute(text("SELECT name, is_checked FROM shopping_list_items WHERE id = :id"), {"id": item_id}).one() == ("Protected item", False)
                assert connection.execute(text("SELECT status FROM household_invitations WHERE id = :id"), {"id": invitation_id}).scalar_one() == "pending"

            with disposable_engine.begin() as connection:
                connection.execute(text("UPDATE households SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": household_id})
            deleted_read = await request_as(client, owner_id, owner_email, "GET", f"/v1/households/{household_id}/members")
            deleted_write = await request_as(client, owner_id, owner_email, "PATCH", f"/v1/households/{household_id}", json={"name": "After deletion"})
            deleted_shop = await request_as(client, owner_id, owner_email, "PATCH", f"/v1/households/{household_id}/shopping-list/items/{item_id}", json={"is_checked": True})
            deleted_invite = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations", json={"email": "late@example.com"})
            assert deleted_read.status_code == deleted_write.status_code == deleted_shop.status_code == deleted_invite.status_code == 404
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_members WHERE household_id IN (:a, :b)"), {"a": household_id, "b": foreign_household_id})
            connection.execute(text("DELETE FROM household_invitations WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_list_items WHERE id = :id"), {"id": item_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id IN (:a, :b)"), {"a": household_id, "b": foreign_household_id})
            connection.execute(text("DELETE FROM households WHERE id IN (:a, :b)"), {"a": household_id, "b": foreign_household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:owner, :member, :foreign, :removed)"),
                               {"owner": owner_id, "member": member_id, "foreign": foreign_id, "removed": removed_id})


def test_concurrent_owner_removals_leave_at_least_one_active_owner(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        owner_a, email_a = insert_user(connection, "owner-a")
        owner_b, email_b = insert_user(connection, "owner-b")
        household_id = insert_household(connection, owner_a)
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'owner')"),
                           {"household_id": household_id, "user_id": owner_b})
        member_a = connection.execute(text("SELECT id::text FROM household_members WHERE household_id = :household_id AND user_id = :user_id"),
                                      {"household_id": household_id, "user_id": owner_a}).scalar_one()
        member_b = connection.execute(text("SELECT id::text FROM household_members WHERE household_id = :household_id AND user_id = :user_id"),
                                      {"household_id": household_id, "user_id": owner_b}).scalar_one()
    barrier = Barrier(2)

    def remove(actor_id: str, actor_email: str, target_id: str) -> int:
        barrier.wait()
        try:
            household_management.remove_member(as_user(actor_id, actor_email), household_id, target_id, disposable_engine)
            return 204
        except HTTPException as error:
            return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(lambda values: remove(*values), [(owner_a, email_a, member_b), (owner_b, email_b, member_a)]))
        assert sorted(outcomes) == [204, 404]
        with disposable_engine.connect() as connection:
            remaining = connection.execute(text("SELECT count(*) FROM household_members WHERE household_id = :id AND role = 'owner' AND removed_at IS NULL"), {"id": household_id}).scalar_one()
        assert remaining == 1
    finally:
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:a, :b)"), {"a": owner_a, "b": owner_b})


@pytest.mark.parametrize("change", ["demote", "remove"])
def test_owner_action_waiting_behind_membership_change_is_denied(disposable_engine: Engine, change: str) -> None:
    with disposable_engine.begin() as connection:
        manager_id, _manager_email = insert_user(connection, "race-manager")
        target_id, target_email = insert_user(connection, "race-target")
        household_id = insert_household(connection, manager_id, "Role race")
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'owner')"),
                           {"household_id": household_id, "user_id": target_id})
        target_membership_id = connection.execute(text("SELECT id::text FROM household_members WHERE household_id = :household_id AND user_id = :user_id"),
                                                  {"household_id": household_id, "user_id": target_id}).scalar_one()

    application_name = f"owner-action-{uuid4().hex}"
    action_engine = race_engine(disposable_engine, application_name)

    def delayed_owner_action() -> int:
        try:
            household_management.update_household(as_user(target_id, target_email), household_id, "Must not update", None, action_engine)
        except HTTPException as error:
            return error.status_code
        return 200

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            with disposable_engine.begin() as connection:
                household_management.lock_household(connection, household_id, manager_id, owner=True)
                action = executor.submit(delayed_owner_action)
                wait_for_lock_wait(disposable_engine, application_name)
                if change == "demote":
                    connection.execute(text("UPDATE household_members SET role = 'member' WHERE id = :id"), {"id": target_membership_id})
                else:
                    connection.execute(text("UPDATE household_members SET removed_at = CURRENT_TIMESTAMP WHERE id = :id"), {"id": target_membership_id})
            assert action.result(timeout=10) == 404
        with disposable_engine.connect() as connection:
            assert connection.execute(text("SELECT name FROM households WHERE id = :id"), {"id": household_id}).scalar_one().startswith("Role race")
    finally:
        action_engine.dispose()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:a, :b)"), {"a": manager_id, "b": target_id})


@pytest.mark.parametrize("action", ["shopping_write", "invitation_reissue"])
def test_household_archive_denies_mutation_waiting_on_parent_lock(disposable_engine: Engine, action: str) -> None:
    with disposable_engine.begin() as connection:
        owner_id, owner_email = insert_user(connection, f"archive-{action}")
        household_id = insert_household(connection, owner_id, "Archive race")
        invitation_id = connection.execute(text("""
            INSERT INTO household_invitations
                (household_id, normalized_email, created_by_user_id, token_digest, expires_at)
            VALUES (:household_id, 'waiting@example.com', :owner_id, :digest, CURRENT_TIMESTAMP + INTERVAL '1 day')
            RETURNING id::text
        """), {"household_id": household_id, "owner_id": owner_id, "digest": str(uuid4())}).scalar_one()

    application_name = f"archive-write-{uuid4().hex}"
    mutation_engine = race_engine(disposable_engine, application_name)
    archive_updated = Event()
    release_archive = Event()

    def pause_before_archive_commit(connection, cursor, statement, parameters, context, executemany) -> None:
        if "UPDATE HOUSEHOLDS SET DELETED_AT" in statement.upper():
            archive_updated.set()
            if not release_archive.wait(timeout=10):
                raise TimeoutError("Test did not release the household archive transaction.")

    def mutate() -> int:
        try:
            if action == "shopping_write":
                shopping_lists.add_item(as_user(owner_id, owner_email), household_id, "Late item", mutation_engine)
            else:
                household_management.reissue_invitation(as_user(owner_id, owner_email), household_id, invitation_id, mutation_engine)
        except HTTPException as error:
            return error.status_code
        return 200

    event.listen(disposable_engine, "after_cursor_execute", pause_before_archive_commit)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            archive = executor.submit(household_management.delete_household, as_user(owner_id, owner_email), household_id, disposable_engine)
            assert archive_updated.wait(timeout=10), "Archive did not reach its uncommitted household update."
            mutation = executor.submit(mutate)
            wait_for_lock_wait(disposable_engine, application_name)
            release_archive.set()
            archive.result(timeout=10)
            assert mutation.result(timeout=10) == 404
        with disposable_engine.connect() as connection:
            assert connection.execute(text("SELECT deleted_at IS NOT NULL FROM households WHERE id = :id"), {"id": household_id}).scalar_one()
            assert connection.execute(text("SELECT count(*) FROM shopping_list_items i JOIN shopping_lists sl ON sl.id = i.shopping_list_id WHERE sl.household_id = :id AND i.name = 'Late item'"), {"id": household_id}).scalar_one() == 0
            assert connection.execute(text("SELECT status FROM household_invitations WHERE id = :id"), {"id": invitation_id}).scalar_one() == "revoked"
    finally:
        release_archive.set()
        event.remove(disposable_engine, "after_cursor_execute", pause_before_archive_commit)
        mutation_engine.dispose()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_invitations WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})


@pytest.mark.anyio
async def test_member_email_projection_uses_one_membership_snapshot(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        owner_id, owner_email = insert_user(connection, "projection-owner")
        member_id, member_email = insert_user(connection, "projection-member")
        peer_owner_id, peer_owner_email = insert_user(connection, "projection-peer-owner")
        household_id = insert_household(connection, owner_id, "Projection")
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
                           {"household_id": household_id, "user_id": member_id})
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'owner')"),
                           {"household_id": household_id, "user_id": peer_owner_id})

    projection_queries: list[str] = []
    projection_ready = Event()
    release_projection = Event()

    def pause_projection(connection, cursor, statement, parameters, context, executemany) -> None:
        if "WITH CALLER AS" in statement.upper():
            projection_queries.append(statement)
            projection_ready.set()
            if not release_projection.wait(timeout=10):
                raise TimeoutError("Test did not release the member projection query.")

    event.listen(disposable_engine, "after_cursor_execute", pause_projection)
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            owner_view = executor.submit(household_management.list_members, as_user(owner_id, owner_email), household_id, disposable_engine)
            assert projection_ready.wait(timeout=10), "Member projection query did not execute."
            with disposable_engine.begin() as connection:
                household_management.lock_household(connection, household_id, owner_id, owner=True)
                connection.execute(text("UPDATE household_members SET role = 'member' WHERE household_id = :household_id AND user_id = :user_id"),
                                   {"household_id": household_id, "user_id": owner_id})
            release_projection.set()
            rows_from_owner_snapshot = owner_view.result(timeout=10)
        assert len(projection_queries) == 1
        assert {row.get("email") for row in rows_from_owner_snapshot} == {owner_email, member_email, peer_owner_email}
        member_view = household_management.list_members(as_user(owner_id, owner_email), household_id, disposable_engine)
        assert all("email" not in row for row in member_view)
    finally:
        release_projection.set()
        event.remove(disposable_engine, "after_cursor_execute", pause_projection)
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:a, :b, :c)"), {"a": owner_id, "b": member_id, "c": peer_owner_id})


@pytest.mark.anyio
async def test_last_owner_cannot_be_demoted_removed_or_leave(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        owner_id, owner_email = insert_user(connection, "last-owner")
        household_id = insert_household(connection, owner_id)
        membership_id = connection.execute(text("SELECT id::text FROM household_members WHERE household_id = :id"), {"id": household_id}).scalar_one()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            demote = await request_as(client, owner_id, owner_email, "PATCH", f"/v1/households/{household_id}/members/{membership_id}", json={"role": "member"})
            remove = await request_as(client, owner_id, owner_email, "DELETE", f"/v1/households/{household_id}/members/{membership_id}")
            leave = await request_as(client, owner_id, owner_email, "DELETE", f"/v1/households/{household_id}/leave")
            assert [demote.status_code, remove.status_code, leave.status_code] == [409, 409, 409]
        with disposable_engine.connect() as connection:
            row = connection.execute(text("SELECT role, removed_at FROM household_members WHERE id = :id"), {"id": membership_id}).one()
            assert row == ("owner", None)
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})


@pytest.mark.anyio
async def test_invitation_conflict_reissue_and_reaccept_preserve_membership_history(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        owner_id, owner_email = insert_user(connection, "invite-owner")
        active_id, active_email = insert_user(connection, "already-active")
        former_id, former_email = insert_user(connection, "former")
        other_owner_id, _other_owner_email = insert_user(connection, "other-owner")
        race_id, race_email = insert_user(connection, "race-recipient")
        other_only_id, other_only_email = insert_user(connection, "other-household-only")
        household_id = insert_household(connection, owner_id)
        other_household_id = insert_household(connection, other_owner_id, "Other home")
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
                           {"household_id": household_id, "user_id": active_id})
        connection.execute(text("""INSERT INTO household_members
            (household_id, user_id, role, joined_at, removed_at)
            VALUES (:household_id, :user_id, 'member', CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 day')"""),
                           {"household_id": household_id, "user_id": former_id})
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
                           {"household_id": other_household_id, "user_id": active_id})
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
                           {"household_id": other_household_id, "user_id": race_id})
        connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
                           {"household_id": other_household_id, "user_id": other_only_id})
        active_invitation_id = connection.execute(text("""INSERT INTO household_invitations
            (household_id, normalized_email, created_by_user_id, token_digest, expires_at)
            VALUES (:household_id, :email, :owner_id, :digest, CURRENT_TIMESTAMP + INTERVAL '1 day')
            RETURNING id::text"""), {"household_id": household_id, "email": active_email, "owner_id": owner_id, "digest": str(uuid4())}).scalar_one()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            blocked = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations", json={"email": active_email})
            assert blocked.status_code == 409
            assert blocked.json()["detail"]["code"] == "HOUSEHOLD_MEMBER_ALREADY_EXISTS"
            reissue_blocked = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations/{active_invitation_id}/reissue")
            assert reissue_blocked.status_code == 409
            assert reissue_blocked.json()["detail"]["code"] == "HOUSEHOLD_MEMBER_ALREADY_EXISTS"
            with disposable_engine.connect() as connection:
                assert connection.execute(text("SELECT status FROM household_invitations WHERE id = :id"), {"id": active_invitation_id}).scalar_one() == "pending"
            with disposable_engine.connect() as connection:
                memberships = connection.execute(text("""SELECT household_id::text, removed_at
                    FROM household_members WHERE user_id = :user_id AND removed_at IS NULL"""),
                    {"user_id": other_only_id}).all()
            assert memberships == [(other_household_id, None)]
            eligible = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations", json={"email": other_only_email})
            assert eligible.status_code == 201
            former_invite = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations", json={"email": former_email})
            assert former_invite.status_code == 201
            original_code = former_invite.json()["invitation"]["code"]
            invite_id = former_invite.json()["invitation"]["id"]
            listing = await request_as(client, owner_id, owner_email, "GET", f"/v1/households/{household_id}/invitations")
            assert listing.status_code == 200
            assert all("code" not in invitation and "token_digest" not in invitation for invitation in listing.json()["invitations"])

            replacement = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations/{invite_id}/reissue")
            assert replacement.status_code == 201
            assert replacement.json()["invitation"]["code"] != original_code
            former_user = await request_as(client, former_id, former_email, "POST", "/v1/invitations/accept", json={"code": original_code})
            assert former_user.status_code == 404
            accepted = await request_as(client, former_id, former_email, "POST", "/v1/invitations/accept", json={"code": replacement.json()["invitation"]["code"]})
            assert accepted.status_code == 204
            with disposable_engine.connect() as connection:
                history = connection.execute(text("SELECT id::text, joined_at, removed_at FROM household_members WHERE household_id = :household_id AND user_id = :user_id ORDER BY joined_at"),
                                             {"household_id": household_id, "user_id": former_id}).all()
            assert len(history) == 2
            assert history[0].removed_at is not None
            assert history[1].removed_at is None
            assert history[0].id != history[1].id
            assert history[0].joined_at < history[1].joined_at

            created_for_race = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/invitations", json={"email": race_email})
            assert created_for_race.status_code == 201
            race_code = created_for_race.json()["invitation"]["code"]
            with disposable_engine.begin() as connection:
                connection.execute(text("INSERT INTO household_members (household_id, user_id, role) VALUES (:household_id, :user_id, 'member')"),
                                   {"household_id": household_id, "user_id": race_id})
            duplicate_acceptance = await request_as(client, race_id, race_email, "POST", "/v1/invitations/accept", json={"code": race_code})
            assert duplicate_acceptance.status_code == 409
            assert duplicate_acceptance.json()["detail"]["code"] == "HOUSEHOLD_MEMBER_ALREADY_EXISTS"
            with disposable_engine.connect() as connection:
                assert connection.execute(text("SELECT status FROM household_invitations WHERE token_digest = :digest"), {"digest": hashlib.sha256(race_code.encode()).hexdigest()}).scalar_one() == "revoked"
                assert connection.execute(text("SELECT count(*) FROM household_members WHERE household_id = :household_id AND user_id = :user_id AND removed_at IS NULL"), {"household_id": household_id, "user_id": race_id}).scalar_one() == 1
    finally:
        app.dependency_overrides.clear()
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_invitations WHERE household_id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM households WHERE id IN (:a, :b)"), {"a": household_id, "b": other_household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:a, :b, :c, :d, :e, :f)"), {"a": owner_id, "b": active_id, "c": former_id, "d": other_owner_id, "e": race_id, "f": other_only_id})


@pytest.mark.anyio
async def test_delete_household_retains_shared_rows_revokes_invites_and_denies_access(disposable_engine: Engine) -> None:
    with disposable_engine.begin() as connection:
        owner_id, owner_email = insert_user(connection, "delete-owner")
        household_id = insert_household(connection, owner_id)
        item_id = connection.execute(text("INSERT INTO shopping_list_items (shopping_list_id, name, created_by_user_id) SELECT id, 'Still retained', :user_id FROM shopping_lists WHERE household_id = :household_id RETURNING id::text"),
                                     {"user_id": owner_id, "household_id": household_id}).scalar_one()
        invite_id = connection.execute(text("INSERT INTO household_invitations (household_id, normalized_email, created_by_user_id, token_digest, expires_at) VALUES (:household_id, 'pending@example.com', :user_id, :digest, CURRENT_TIMESTAMP + INTERVAL '1 day') RETURNING id::text"),
                                       {"household_id": household_id, "user_id": owner_id, "digest": str(uuid4())}).scalar_one()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            deleted = await request_as(client, owner_id, owner_email, "DELETE", f"/v1/households/{household_id}")
            assert deleted.status_code == 204
            denied = await request_as(client, owner_id, owner_email, "POST", f"/v1/households/{household_id}/shopping-list/items", json={"name": "Must fail"})
            assert denied.status_code == 404
        with disposable_engine.connect() as connection:
            assert connection.execute(text("SELECT deleted_at IS NOT NULL FROM households WHERE id = :id"), {"id": household_id}).scalar_one()
            assert connection.execute(text("SELECT count(*) FROM household_members WHERE household_id = :id AND removed_at IS NULL"), {"id": household_id}).scalar_one() == 1
            assert connection.execute(text("SELECT name FROM shopping_list_items WHERE id = :id"), {"id": item_id}).scalar_one() == "Still retained"
            assert connection.execute(text("SELECT status FROM household_invitations WHERE id = :id"), {"id": invite_id}).scalar_one() == "revoked"
    finally:
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_invitations WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_list_items WHERE id = :id"), {"id": item_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM shopping_lists WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": owner_id})
