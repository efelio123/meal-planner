import os
from collections.abc import Generator
from uuid import uuid4

import pytest
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

DATABASE_URL_ENVIRONMENT_VARIABLE = "DATABASE_URL"
DISPOSABLE_TEST_DATABASE = "meal_planner_disposable_test"


@pytest.fixture(scope="module")
def migration_engine() -> Generator[Engine]:
    database_url = os.getenv(DATABASE_URL_ENVIRONMENT_VARIABLE)
    if not database_url:
        pytest.skip(f"{DATABASE_URL_ENVIRONMENT_VARIABLE} is not configured.")

    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg":
        pytest.fail("Migration tests require a postgresql+psycopg DATABASE_URL.")
    if url.database != DISPOSABLE_TEST_DATABASE:
        pytest.fail(
            "Migration tests only run against the disposable database "
            f"{DISPOSABLE_TEST_DATABASE!r}, not {url.database!r}."
        )

    engine = create_engine(url)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def database_connection(migration_engine: Engine) -> Generator[Connection]:
    with migration_engine.connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()


def insert_user(connection: Connection, *, email: str | None = None) -> str:
    result = connection.execute(
        text(
            """
            INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
            VALUES (:provider, :subject, :email, :display_name)
            RETURNING id::text
            """
        ),
        {
            "provider": "test-provider",
            "subject": str(uuid4()),
            "email": email or f"{uuid4()}@example.test",
            "display_name": "Test User",
        },
    )
    return result.scalar_one()


def insert_household(connection: Connection, creator_id: str) -> str:
    result = connection.execute(
        text(
            """
            INSERT INTO households (name, time_zone, created_by_user_id)
            VALUES (:name, 'America/Phoenix', :creator_id)
            RETURNING id::text
            """
        ),
        {"name": f"Test household {uuid4()}", "creator_id": creator_id},
    )
    return result.scalar_one()


def test_migration_created_expected_tables_timestamp_defaults_and_no_user_triggers(
    database_connection: Connection,
) -> None:
    tables = database_connection.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                  'users',
                  'households',
                  'household_members',
                  'household_invitations'
              )
            """
        )
    ).scalars().all()
    assert set(tables) == {
        "users",
        "households",
        "household_members",
        "household_invitations",
    }

    user_id = insert_user(database_connection)
    timestamps = database_connection.execute(
        text("SELECT created_at, updated_at FROM users WHERE id = :user_id"),
        {"user_id": user_id},
    ).one()
    assert timestamps.created_at is not None
    assert timestamps.updated_at is not None

    user_defined_triggers = database_connection.execute(
        text(
            """
            SELECT trigger.tgname
            FROM pg_trigger AS trigger
            JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname IN (
                  'users',
                  'households',
                  'household_members',
                  'household_invitations'
              )
              AND NOT trigger.tgisinternal
            """
        )
    ).scalars().all()
    assert user_defined_triggers == []


def test_users_enforce_canonical_active_email_and_identity_constraints(
    database_connection: Connection,
) -> None:
    email = f"{uuid4()}@example.test"
    first_user_id = insert_user(database_connection, email=email)

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        insert_user(database_connection, email=email)

    database_connection.execute(
        text("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = :user_id"),
        {"user_id": first_user_id},
    )
    insert_user(database_connection, email=email)

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        insert_user(database_connection, email="Not-Normalized@example.test")

    shared_subject = str(uuid4())
    database_connection.execute(
        text(
            """
            INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
            VALUES ('test-provider', :subject, :email, 'Test User')
            """
        ),
        {"subject": shared_subject, "email": f"{uuid4()}@example.test"},
    )
    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text(
                """
                INSERT INTO users (identity_provider, identity_subject, normalized_email, display_name)
                VALUES ('test-provider', :subject, :email, 'Test User')
                """
            ),
            {"subject": shared_subject, "email": f"{uuid4()}@example.test"},
        )


def test_membership_constraints_and_restrict_delete(
    database_connection: Connection,
) -> None:
    user_id = insert_user(database_connection)
    household_id = insert_household(database_connection, user_id)
    database_connection.execute(
        text(
            """
            INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'owner')
            """
        ),
        {"household_id": household_id, "user_id": user_id},
    )

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text(
                """
                INSERT INTO household_members (household_id, user_id, role)
                VALUES (:household_id, :user_id, 'owner')
                """
            ),
            {"household_id": household_id, "user_id": user_id},
        )

    database_connection.execute(
        text(
            """
            UPDATE household_members
            SET removed_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND user_id = :user_id
            """
        ),
        {"household_id": household_id, "user_id": user_id},
    )
    database_connection.execute(
        text(
            """
            INSERT INTO household_members (household_id, user_id, role)
            VALUES (:household_id, :user_id, 'member')
            """
        ),
        {"household_id": household_id, "user_id": user_id},
    )

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text(
                """
                INSERT INTO household_members (household_id, user_id, role)
                VALUES (:household_id, :user_id, 'administrator')
                """
            ),
            {"household_id": household_id, "user_id": user_id},
        )

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text("DELETE FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        )


def test_pending_invitations_enforce_status_and_partial_uniqueness(
    database_connection: Connection,
) -> None:
    creator_id = insert_user(database_connection)
    household_id = insert_household(database_connection, creator_id)
    email = f"{uuid4()}@example.test"
    invitation_parameters = {
        "household_id": household_id,
        "email": email,
        "creator_id": creator_id,
        "token_digest": str(uuid4()),
    }
    database_connection.execute(
        text(
            """
            INSERT INTO household_invitations (
                household_id, normalized_email, created_by_user_id, token_digest, expires_at
            ) VALUES (
                :household_id, :email, :creator_id, :token_digest,
                CURRENT_TIMESTAMP + INTERVAL '1 day'
            )
            """
        ),
        invitation_parameters,
    )

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text("DELETE FROM households WHERE id = :household_id"),
            {"household_id": household_id},
        )

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text(
                """
                INSERT INTO household_invitations (
                    household_id, normalized_email, created_by_user_id, token_digest, expires_at
                ) VALUES (
                    :household_id, :email, :creator_id, :token_digest,
                    CURRENT_TIMESTAMP + INTERVAL '1 day'
                )
                """
            ),
            {**invitation_parameters, "token_digest": str(uuid4())},
        )

    database_connection.execute(
        text(
            """
            UPDATE household_invitations
            SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND normalized_email = :email
            """
        ),
        {"household_id": household_id, "email": email},
    )
    database_connection.execute(
        text(
            """
            INSERT INTO household_invitations (
                household_id, normalized_email, created_by_user_id, token_digest, expires_at
            ) VALUES (
                :household_id, :email, :creator_id, :token_digest,
                CURRENT_TIMESTAMP + INTERVAL '1 day'
            )
            """
        ),
        {**invitation_parameters, "token_digest": str(uuid4())},
    )

    with pytest.raises(IntegrityError), database_connection.begin_nested():
        database_connection.execute(
            text(
                """
                INSERT INTO household_invitations (
                    household_id, normalized_email, created_by_user_id, token_digest, status, expires_at
                ) VALUES (
                    :household_id, :email, :creator_id, :token_digest, 'invalid',
                    CURRENT_TIMESTAMP + INTERVAL '1 day'
                )
                """
            ),
            {**invitation_parameters, "token_digest": str(uuid4())},
        )
