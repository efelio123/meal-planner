from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from meal_planner_api.main import AddReviewedMealPlanNeedsRequest
from meal_planner_api.meal_planning import (
    _date,
    _normalize_amount_overrides,
    _review_snapshot,
    _week_range,
    _week_start,
)


@pytest.mark.parametrize(
    ("local_today", "offset", "expected_start", "expected_end"),
    [
        (date(2026, 10, 5), 0, date(2026, 10, 5), date(2026, 10, 11)),
        (date(2026, 10, 11), 0, date(2026, 10, 5), date(2026, 10, 11)),
        (date(2027, 1, 1), 0, date(2026, 12, 28), date(2027, 1, 3)),
        (date(2028, 2, 29), 1, date(2028, 3, 6), date(2028, 3, 12)),
        (date(2027, 1, 4), -1, date(2026, 12, 28), date(2027, 1, 3)),
    ],
)
def test_household_local_week_range_is_monday_start_across_calendar_boundaries(
    local_today: date, offset: int, expected_start: date, expected_end: date
) -> None:
    assert _week_range(local_today, offset) == (expected_start, expected_end)


def test_meal_plan_dates_require_iso_calendar_dates_and_monday_review_start() -> None:
    assert _date("2026-10-05") == date(2026, 10, 5)
    with pytest.raises(HTTPException) as invalid_date:
        _date("2026-02-30")
    assert invalid_date.value.status_code == 422
    with pytest.raises(HTTPException) as non_calendar_iso:
        _date("2026-W41-1")
    assert non_calendar_iso.value.status_code == 422
    with pytest.raises(HTTPException) as invalid_week:
        _week_start("2026-10-06")
    assert invalid_week.value.status_code == 422


def test_amount_overrides_normalize_decimal_and_fraction_values_only_for_selected_needs() -> None:
    assert _normalize_amount_overrides(["need-a", "need-b"], {"need-a": "1 1/2", "need-b": "0.25"}) == {
        "need-a": Decimal("1.500000"), "need-b": Decimal("0.250000"),
    }

    for value in ["", "0", "-1", "1-2", "1/0", "0/2", "0.0000001", "1000000000000"]:
        with pytest.raises(HTTPException) as invalid:
            _normalize_amount_overrides(["need-a"], {"need-a": value})
        assert invalid.value.status_code == 422

    with pytest.raises(HTTPException, match="Amount adjustments must match selected ingredients"):
        _normalize_amount_overrides(["need-a"], {"need-b": "1"})


def test_review_request_keeps_amount_overrides_optional_and_requires_string_values() -> None:
    request = {
        "week_start": "2026-10-05",
        "review_token": "a" * 64,
        "request_id": "00000000-0000-4000-8000-000000000001",
        "selected_need_keys": ["need-a"],
    }
    assert AddReviewedMealPlanNeedsRequest(**request).amount_overrides is None
    assert AddReviewedMealPlanNeedsRequest(**request, amount_overrides={"need-a": "1/2"}).amount_overrides == {"need-a": "1/2"}
    with pytest.raises(ValidationError):
        AddReviewedMealPlanNeedsRequest(**request, amount_overrides={"need-a": 1})


def test_review_token_changes_when_a_meal_moves_within_the_same_week() -> None:
    class Rows:
        def __init__(self, rows: list[dict]) -> None:
            self.rows = rows

        def mappings(self) -> "Rows":
            return self

        def all(self) -> list[dict]:
            return self.rows

    class Connection:
        def __init__(self, row: dict) -> None:
            self.row = row
            self.calls = 0

        def execute(self, _statement: object, _parameters: dict) -> Rows:
            self.calls += 1
            return Rows([self.row] if self.calls == 1 else [])

    source = {
        "entry_id": "entry-1", "planned_for": date(2026, 10, 5), "meal_slot": "breakfast",
        "entry_revision": 1, "recipe_id": "recipe-1", "recipe_name": "Beans", "edit_revision": 1,
        "ingredient_id": "ingredient-1", "catalog_item_id": "item-1", "catalog_item_name": "Beans",
        "amount": Decimal(1), "recipe_unit_code": "cup", "recipe_unit_dimension": "volume",
        "unit_label": "Cup", "custom_unit_label": None, "note": None,
    }
    monday = date(2026, 10, 5)
    original = _review_snapshot(Connection(source), "household-1", monday)
    moved = _review_snapshot(Connection({**source, "planned_for": date(2026, 10, 6), "meal_slot": "lunch", "entry_revision": 2}), "household-1", monday)

    assert original["needs"][0]["amount"] == moved["needs"][0]["amount"] == "1"
    assert original["review_token"] != moved["review_token"]
