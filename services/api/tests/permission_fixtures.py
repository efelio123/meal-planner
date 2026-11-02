"""Explicit full-access member setup for pre-permission integration scenarios."""

from sqlalchemy import text

from meal_planner_api.permissions import seed_grants


def seed_full_member(connection, household_id: str, user_id: str) -> None:
    assert connection.engine.url.database == "meal_planner_disposable_test"
    membership_id = connection.execute(
        text("""SELECT id::text FROM household_members
        WHERE household_id=:home AND user_id=:user AND removed_at IS NULL"""),
        {"home": household_id, "user": user_id},
    ).scalar_one()
    seed_grants(connection, membership_id)
