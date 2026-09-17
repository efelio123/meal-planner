"""Application database connection factory for database-backed API routes."""

from functools import lru_cache

from sqlalchemy import Engine, create_engine

from meal_planner_api.database_config import get_database_url


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_database_url(), pool_pre_ping=True)
