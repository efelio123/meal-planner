"""Database configuration shared by migration tooling.

Application connection and pooling are intentionally deferred until the API has
database-backed endpoints.
"""

from os import environ

DATABASE_URL_ENVIRONMENT_VARIABLE = "DATABASE_URL"
SQLALCHEMY_DATABASE_URL_PREFIX = "postgresql+psycopg://"


def get_database_url() -> str:
    """Return the Alembic/SQLAlchemy PostgreSQL URL from the environment."""
    database_url = environ.get(DATABASE_URL_ENVIRONMENT_VARIABLE)

    if database_url is None or not database_url.strip():
        raise RuntimeError(
            f"{DATABASE_URL_ENVIRONMENT_VARIABLE} must be set for database tooling."
        )

    database_url = database_url.strip()
    if not database_url.startswith(SQLALCHEMY_DATABASE_URL_PREFIX):
        raise ValueError(
            f"{DATABASE_URL_ENVIRONMENT_VARIABLE} must use the "
            f"{SQLALCHEMY_DATABASE_URL_PREFIX} URL format."
        )

    return database_url
