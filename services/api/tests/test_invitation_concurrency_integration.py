import hashlib
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from meal_planner_api import onboarding

DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture(scope="module")
def disposable_engine() -> Engine:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is not configured.")
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail(
            "Invitation concurrency tests require the explicitly named disposable "
            "PostgreSQL database."
        )
    engine = create_engine(url, pool_size=2, max_overflow=0)
    try:
        yield engine
    finally:
        engine.dispose()


def test_postgresql_allows_exactly_one_concurrent_invitation_acceptance(
    disposable_engine: Engine,
) -> None:
    owner_id = str(uuid4())
    recipient_id = str(uuid4())
    household_id = str(uuid4())
    invitation_id = str(uuid4())
    code = "test-invitation-code"

    with disposable_engine.begin() as connection:
        connection.execute(
            text(
                """INSERT INTO users (id, identity_provider, identity_subject, normalized_email, display_name)
                VALUES (:id, 'test', :subject, :email, :name)"""
            ),
            {"id": owner_id, "subject": f"owner-{owner_id}", "email": f"owner-{owner_id}@example.test", "name": "Owner"},
        )
        connection.execute(
            text(
                """INSERT INTO users (id, identity_provider, identity_subject, normalized_email, display_name)
                VALUES (:id, 'test', :subject, :email, :name)"""
            ),
            {"id": recipient_id, "subject": f"recipient-{recipient_id}", "email": f"recipient-{recipient_id}@example.test", "name": "Recipient"},
        )
        connection.execute(
            text(
                """INSERT INTO households (id, name, time_zone, created_by_user_id)
                VALUES (:id, 'Concurrency test', 'America/Phoenix', :owner_id)"""
            ),
            {"id": household_id, "owner_id": owner_id},
        )
        connection.execute(
            text(
                """INSERT INTO household_invitations
                (id, household_id, normalized_email, created_by_user_id, token_digest, expires_at)
                VALUES (:id, :household_id, :email, :owner_id, :digest,
                    CURRENT_TIMESTAMP + INTERVAL '1 day')"""
            ),
            {"id": invitation_id, "household_id": household_id, "email": f"recipient-{recipient_id}@example.test", "owner_id": owner_id, "digest": hashlib.sha256(code.encode()).hexdigest()},
        )

    recipient = onboarding.CurrentUser(
        id=recipient_id,
        normalized_email=f"recipient-{recipient_id}@example.test",
        display_name="Recipient",
    )
    start_barrier = Barrier(2)

    def accept_once() -> int:
        start_barrier.wait()
        try:
            onboarding.accept_invitation(recipient, code, disposable_engine)
            return 204
        except HTTPException as error:
            return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(lambda _: accept_once(), range(2)))

        assert sorted(outcomes) == [204, 404]
        with disposable_engine.connect() as connection:
            accepted = connection.execute(
                text("SELECT status FROM household_invitations WHERE id = :id"),
                {"id": invitation_id},
            ).scalar_one()
            active_memberships = connection.execute(
                text(
                    """SELECT count(*) FROM household_members
                    WHERE household_id = :household_id AND user_id = :user_id
                      AND removed_at IS NULL"""
                ),
                {"household_id": household_id, "user_id": recipient_id},
            ).scalar_one()
        assert accepted == "accepted"
        assert active_memberships == 1
    finally:
        with disposable_engine.begin() as connection:
            connection.execute(text("DELETE FROM household_invitations WHERE id = :id"), {"id": invitation_id})
            connection.execute(text("DELETE FROM household_members WHERE household_id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM households WHERE id = :id"), {"id": household_id})
            connection.execute(text("DELETE FROM users WHERE id IN (:owner_id, :recipient_id)"), {"owner_id": owner_id, "recipient_id": recipient_id})
