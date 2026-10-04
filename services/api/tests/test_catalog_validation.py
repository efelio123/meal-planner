import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from httpx2 import ASGITransport, AsyncClient

from meal_planner_api.catalog import _clean_emoji
from meal_planner_api.main import app
from meal_planner_api.onboarding import CurrentUser, require_current_user


@pytest.mark.parametrize("emoji", ["🥬", "🇺🇸", "1️⃣", "👩‍🍳"])
def test_category_emoji_accepts_one_unicode_emoji_grapheme(emoji: str) -> None:
    assert _clean_emoji(emoji) == emoji


@pytest.mark.parametrize("emoji", [
    "🃏",  # joker
    "🀄",  # mahjong red dragon
    "🅰️",  # A button
    "🆎",  # AB button
    "🈁",  # Japanese here button
    "🈂️",  # Japanese service charge button
    "🏴\U000E0067\U000E0062\U000E0065\U000E006E\U000E0067\U000E007F",  # England
    "🏴\U000E0067\U000E0062\U000E0073\U000E0063\U000E0074\U000E007F",  # Scotland
    "🏴\U000E0067\U000E0062\U000E0077\U000E006C\U000E0073\U000E007F",  # Wales
])
def test_category_emoji_accepts_explicitly_supported_rgis(emoji: str) -> None:
    assert _clean_emoji(emoji) == emoji


def test_category_emoji_can_be_cleared_but_rejects_text_or_multiple_values() -> None:
    assert _clean_emoji(None) is None
    assert _clean_emoji("  ") is None
    for value in ("produce", "🥬🥕", "👩‍"):
        with pytest.raises(HTTPException) as error:
            _clean_emoji(value)
        assert error.value.status_code == 422


@pytest.mark.parametrize("value", [
    "\U0001F3F4\U000E0067\U000E0062\U000E0065",  # incomplete England tag flag
    "\U0001F3F4\U000E0067\U000E0062\U000E0066\U000E0072\U000E0061\U000E007F",  # unlisted GB region
    "\U000E0067",  # standalone tag character
    "🃏🥬",  # multiple emoji
    "joker",  # text
])
def test_category_emoji_rejects_incomplete_or_unlisted_sequences(value: str) -> None:
    with pytest.raises(HTTPException) as error:
        _clean_emoji(value)
    assert error.value.status_code == 422


def test_category_emoji_accepts_every_entry_in_pinned_unicode_emoji_json_dataset() -> None:
    fixture = Path(__file__).parent / "fixtures" / "unicode-emoji-json-0.9.0.json"
    emoji_values = json.loads(fixture.read_text(encoding="utf-8"))

    assert len(emoji_values) == 1914
    for emoji in emoji_values:
        assert _clean_emoji(emoji) == emoji


@pytest.mark.anyio
async def test_malformed_catalog_ids_and_item_type_are_request_validation_errors() -> None:
    app.dependency_overrides[require_current_user] = lambda: CurrentUser("user-id", "user@example.test", "Test User")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            bad_household = await client.get("/v1/households/not-a-uuid/catalog/items")
            bad_item = await client.get("/v1/households/00000000-0000-0000-0000-000000000001/catalog/items/not-a-uuid")
            bad_filter = await client.get("/v1/households/00000000-0000-0000-0000-000000000001/catalog/items?item_type=pantry")

        assert bad_household.status_code == 422
        assert bad_item.status_code == 422
        assert bad_filter.status_code == 422
    finally:
        app.dependency_overrides.clear()
