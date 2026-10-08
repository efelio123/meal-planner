from datetime import date

import pytest
from fastapi import HTTPException

from meal_planner_api.meal_planning import _date, _week_range, _week_start


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
