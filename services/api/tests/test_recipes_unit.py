from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from meal_planner_api.main import (
    RecipeCreateRequest,
    RecipeIngredientRequest,
    RecipeUpdateRequest,
)
from meal_planner_api.recipes import (
    _clean_name,
    _clean_source_url,
    _parse_amount,
    _prepare_steps,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2", Decimal("2.000000")),
        ("0.125", Decimal("0.125000")),
        ("1/2", Decimal("0.500000")),
        ("1 1/2", Decimal("1.500000")),
        ("1/3", Decimal("0.333333")),
        ("1.1234567", Decimal("1.123457")),
    ],
)
def test_recipe_amounts_normalize_to_decimal_without_float(value: str, expected: Decimal) -> None:
    actual = _parse_amount(value)
    assert actual == expected
    assert isinstance(actual, Decimal)


@pytest.mark.parametrize("value", [None, "", "  "])
def test_recipe_amount_can_be_blank(value: str | None) -> None:
    assert _parse_amount(value) is None


@pytest.mark.parametrize("value", ["0", "-1", "2–3", "1/0", "one", "1 1/0", "9" * 80])
def test_recipe_amount_rejects_nonpositive_ranges_and_unsupported_precision(value: str) -> None:
    with pytest.raises(HTTPException) as error:
        _parse_amount(value)
    assert error.value.status_code == 422


def test_recipe_name_collapses_spacing_but_does_not_require_uniqueness() -> None:
    assert _clean_name("  Chicken   tacos  ") == ("Chicken tacos", "chicken tacos")
    assert _clean_name("Chicken tacos") == ("Chicken tacos", "chicken tacos")


@pytest.mark.parametrize("source", ["ftp://example.com", "https:///missing-host", "not a URL", "https://[::1"])
def test_recipe_source_requires_http_or_https(source: str) -> None:
    with pytest.raises(HTTPException) as error:
        _clean_source_url(source)
    assert error.value.status_code == 422


def test_optional_empty_direction_steps_are_omitted_and_reordered_order_is_preserved() -> None:
    assert _prepare_steps([" First ", "   ", "Second"]) == ["First", "Second"]


def test_recipe_request_requires_name_and_at_least_one_catalog_ingredient() -> None:
    with pytest.raises(ValidationError):
        RecipeCreateRequest(name="Soup", ingredients=[])
    with pytest.raises(ValidationError):
        RecipeIngredientRequest(catalog_item_id="not-a-uuid")


def test_recipe_update_requires_revision_and_keeps_partial_fields_partial() -> None:
    with pytest.raises(ValidationError):
        RecipeUpdateRequest(name="Updated")
    update = RecipeUpdateRequest(expected_revision=2, notes=None)
    assert update.model_fields_set == {"expected_revision", "notes"}
