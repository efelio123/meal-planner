"""Household-scoped reusable catalog services."""

import re

from fastapi import HTTPException, status
from sqlalchemy import Engine, text

from meal_planner_api.current_user import CurrentUser
from meal_planner_api.database import get_engine
from meal_planner_api.household_management import lock_household

ITEM_TYPES = {"food", "household"}
RECIPE_DIMENSIONS = {"volume", "mass", "count"}

# Additional RGI bases present in the pinned unicode-emoji-json 0.9.0 data but
# outside the broad base ranges below. Keep these explicit rather than widening
# a Unicode interval that would admit unrelated symbols.
_ADDITIONAL_EMOJI_BASES = frozenset({
    0x1F004,  # mahjong red dragon
    0x1F0CF,  # joker
    0x1F170,  # A button (blood type)
    0x1F171,  # B button (blood type)
    0x1F17E,  # O button (blood type)
    0x1F17F,  # P button
    0x1F18E,  # AB button (blood type)
    0x1F191,  # CL button
    0x1F192,  # COOL button
    0x1F193,  # FREE button
    0x1F194,  # ID button
    0x1F195,  # NEW button
    0x1F196,  # NG button
    0x1F197,  # OK button
    0x1F198,  # SOS button
    0x1F199,  # UP! button
    0x1F19A,  # VS button
    0x1F201,  # Japanese here button
    0x1F202,  # Japanese service charge button
    0x1F21A,  # Japanese free-of-charge button
    0x1F22F,  # Japanese reserved button
    0x1F232,  # Japanese prohibited button
    0x1F233,  # Japanese vacancy button
    0x1F234,  # Japanese passing grade button
    0x1F235,  # Japanese no vacancy button
    0x1F236,  # Japanese not-free-of-charge button
    0x1F237,  # Japanese monthly amount button
    0x1F238,  # Japanese application button
    0x1F239,  # Japanese discount button
    0x1F23A,  # Japanese open-for-business button
    0x1F250,  # Japanese bargain button
    0x1F251,  # Japanese acceptable button
})

# Unicode subdivision flags use tag characters rather than regional
# indicators. Allow only the three RGI sequences present in the pinned data.
_SUBDIVISION_FLAG_EMOJI = frozenset({
    "\U0001F3F4\U000E0067\U000E0062\U000E0065\U000E006E\U000E0067\U000E007F",  # England
    "\U0001F3F4\U000E0067\U000E0062\U000E0073\U000E0063\U000E0074\U000E007F",  # Scotland
    "\U0001F3F4\U000E0067\U000E0062\U000E0077\U000E006C\U000E0073\U000E007F",  # Wales
})


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog resource not found")


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": code, "message": message})


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).lower()


def _clean_name(value: str, *, max_length: int, label: str) -> tuple[str, str]:
    name = value.strip()
    if not name or len(name) > max_length:
        raise _invalid(f"{label} must contain between 1 and {max_length} characters.")
    if any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in name):
        raise _invalid(f"{label} cannot contain control characters.")
    return name, _normalize(name)


def _emoji_base(codepoint: int) -> bool:
    return (
        codepoint in _ADDITIONAL_EMOJI_BASES
        or
        0x1F300 <= codepoint <= 0x1FAFF
        or 0x2600 <= codepoint <= 0x27BF
        or codepoint in {0x00A9, 0x00AE, 0x203C, 0x2049, 0x2122, 0x2139, 0x24C2, 0x3030, 0x303D, 0x3297, 0x3299}
        or 0x2194 <= codepoint <= 0x21AA
        or 0x2300 <= codepoint <= 0x23FF
        or 0x25AA <= codepoint <= 0x25FE
        or 0x2934 <= codepoint <= 0x2935
        or 0x2B05 <= codepoint <= 0x2B55
    )


def _consume_emoji_component(value: str, offset: int) -> int | None:
    if offset >= len(value) or not _emoji_base(ord(value[offset])):
        return None
    offset += 1
    if offset < len(value) and ord(value[offset]) == 0xFE0F:
        offset += 1
    if offset < len(value) and 0x1F3FB <= ord(value[offset]) <= 0x1F3FF:
        offset += 1
    return offset


def _clean_emoji(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    emoji = value.strip()

    if emoji in _SUBDIVISION_FLAG_EMOJI:
        return emoji

    # Keycap emoji are the one accepted sequence whose first scalar is not an
    # emoji code point by itself.
    if len(emoji) in (2, 3) and emoji[0] in "0123456789#*" and emoji[-1] == "\u20e3":
        middle = emoji[1:-1]
        if middle in ("", "\ufe0f"):
            return emoji

    # A flag is one grapheme made from exactly two regional-indicator symbols.
    if len(emoji) == 2 and all(0x1F1E6 <= ord(character) <= 0x1F1FF for character in emoji):
        return emoji

    offset = _consume_emoji_component(emoji, 0)
    if offset is None:
        raise _invalid("Enter one emoji, or leave the emoji field empty.")
    while offset < len(emoji):
        if ord(emoji[offset]) != 0x200D:
            raise _invalid("Enter one emoji, or leave the emoji field empty.")
        offset = _consume_emoji_component(emoji, offset + 1)
        if offset is None:
            raise _invalid("Enter one emoji, or leave the emoji field empty.")
    return emoji


def _require_member(connection, household_id: str, user_id: str) -> None:
    row = connection.execute(text("""
        SELECT 1 FROM households h
        JOIN household_members hm ON hm.household_id = h.id
        WHERE h.id = :household_id AND h.deleted_at IS NULL
          AND hm.user_id = :user_id AND hm.removed_at IS NULL
    """), {"household_id": household_id, "user_id": user_id}).scalar_one_or_none()
    if row is None:
        raise _not_found()


def list_units(user: CurrentUser, household_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        _require_member(connection, household_id, user.id)
        built_in = connection.execute(text("""
            SELECT code, label, unit_group FROM catalog_shopping_units
            WHERE EXISTS (
                SELECT 1 FROM households h JOIN household_members hm ON hm.household_id = h.id
                WHERE h.id = :household_id AND h.deleted_at IS NULL
                  AND hm.user_id = :user_id AND hm.removed_at IS NULL
            ) ORDER BY unit_group, label
        """), {"household_id": household_id, "user_id": user.id}).mappings().all()
        if not built_in:
            raise _not_found()
        custom = connection.execute(text("""
            SELECT id::text AS id, name AS label FROM household_shopping_units
            WHERE household_id = :household_id AND archived_at IS NULL
              AND EXISTS (
                SELECT 1 FROM households h JOIN household_members hm ON hm.household_id = h.id
                WHERE h.id = :household_id AND h.deleted_at IS NULL
                  AND hm.user_id = :user_id AND hm.removed_at IS NULL
              )
            ORDER BY normalized_name, id
        """), {"household_id": household_id, "user_id": user.id}).mappings().all()
        recipe = connection.execute(text("""
            SELECT code, label, dimension FROM recipe_measurement_units
            WHERE EXISTS (
                SELECT 1 FROM households h JOIN household_members hm ON hm.household_id = h.id
                WHERE h.id = :household_id AND h.deleted_at IS NULL
                  AND hm.user_id = :user_id AND hm.removed_at IS NULL
            )
            ORDER BY dimension, label
        """), {"household_id": household_id, "user_id": user.id}).mappings().all()
    return {
        "shopping_units": {
            "built_in": [dict(row) for row in built_in],
            "household": [dict(row) for row in custom],
        },
        "recipe_measurement_units": [dict(row) for row in recipe],
    }


def list_categories(user: CurrentUser, household_id: str, item_type: str | None, engine: Engine | None = None) -> list[dict]:
    if item_type is not None and item_type not in ITEM_TYPES:
        raise _invalid("Item type must be food or household.")
    type_clause = "AND c.item_type = :item_type" if item_type is not None else ""
    parameters = {"household_id": household_id, "user_id": user.id}
    if item_type is not None:
        parameters["item_type"] = item_type
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text(f"""
            SELECT c.id::text AS id, c.item_type, c.name, c.created_at, c.updated_at
                , c.emoji,
                (SELECT count(*)::int FROM catalog_items ci
                 WHERE ci.household_id = c.household_id AND ci.category_id = c.id
                   AND ci.archived_at IS NULL) AS active_item_count
            FROM catalog_categories c
            JOIN households h ON h.id = c.household_id
            JOIN household_members hm ON hm.household_id = h.id
            WHERE c.household_id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
              AND c.archived_at IS NULL
              {type_clause}
            ORDER BY c.item_type, c.normalized_name, c.id
        """), parameters).mappings().all()
        if not rows:
            _require_member(connection, household_id, user.id)
    return [dict(row) for row in rows]


def list_stores(user: CurrentUser, household_id: str, engine: Engine | None = None) -> list[dict]:
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text("""
            SELECT s.id::text AS id, s.name, s.created_at, s.updated_at
            FROM catalog_stores s
            JOIN households h ON h.id = s.household_id
            JOIN household_members hm ON hm.household_id = h.id
            WHERE s.household_id = :household_id AND hm.user_id = :user_id
              AND hm.removed_at IS NULL AND h.deleted_at IS NULL
              AND s.archived_at IS NULL
            ORDER BY s.normalized_name, s.id
        """), {"household_id": household_id, "user_id": user.id}).mappings().all()
        if not rows:
            _require_member(connection, household_id, user.id)
    return [dict(row) for row in rows]


_ITEM_SELECT = """
    SELECT ci.id::text AS id, ci.household_id::text AS household_id,
        ci.item_type, ci.name, ci.category_id::text AS category_id,
        CASE WHEN c.archived_at IS NULL THEN c.name ELSE NULL END AS category_name,
        ci.shopping_unit_code,
        CASE WHEN ci.shopping_unit_code IS NOT NULL THEN builtin.label
             WHEN custom.archived_at IS NULL THEN custom.name ELSE NULL END AS shopping_unit_label,
        CASE WHEN ci.shopping_unit_code IS NOT NULL THEN 'built_in'
             WHEN custom.id IS NOT NULL AND custom.archived_at IS NULL THEN 'household'
             ELSE NULL END AS shopping_unit_source,
        ci.custom_shopping_unit_id::text AS custom_shopping_unit_id,
        ci.preferred_store_id::text AS preferred_store_id,
        CASE WHEN s.archived_at IS NULL THEN s.name ELSE NULL END AS preferred_store_name,
        ci.recipe_measurement_dimension, ci.recipe_measurement_unit_code,
        recipe.label AS recipe_measurement_unit_label,
        ci.created_at, ci.updated_at
    FROM catalog_items ci
    JOIN households h ON h.id = ci.household_id
    JOIN household_members hm ON hm.household_id = h.id
    LEFT JOIN catalog_categories c ON c.household_id = ci.household_id AND c.id = ci.category_id
    LEFT JOIN catalog_shopping_units builtin ON builtin.code = ci.shopping_unit_code
    LEFT JOIN household_shopping_units custom ON custom.household_id = ci.household_id AND custom.id = ci.custom_shopping_unit_id
    LEFT JOIN catalog_stores s ON s.household_id = ci.household_id AND s.id = ci.preferred_store_id
    LEFT JOIN recipe_measurement_units recipe
        ON recipe.code = ci.recipe_measurement_unit_code AND recipe.dimension = ci.recipe_measurement_dimension
    WHERE ci.household_id = :household_id AND hm.user_id = :user_id
      AND hm.removed_at IS NULL AND h.deleted_at IS NULL
      AND ci.archived_at IS NULL
"""


def list_items(
    user: CurrentUser,
    household_id: str,
    item_type: str | None = None,
    search: str | None = None,
    engine: Engine | None = None,
) -> list[dict]:
    if item_type is not None and item_type not in ITEM_TYPES:
        raise _invalid("Item type must be food or household.")
    normalized_search = _normalize(search) if search else ""
    filters: list[str] = []
    parameters = {"household_id": household_id, "user_id": user.id}
    if item_type is not None:
        filters.append("AND ci.item_type = :item_type")
        parameters["item_type"] = item_type
    if normalized_search:
        filters.append("AND ci.normalized_name LIKE '%' || :search || '%'")
        parameters["search"] = normalized_search
    with (engine or get_engine()).connect() as connection:
        rows = connection.execute(text(_ITEM_SELECT + "\n".join(filters) + """
            ORDER BY ci.normalized_name, ci.id
        """), parameters).mappings().all()
        if not rows:
            _require_member(connection, household_id, user.id)
    return [dict(row) for row in rows]


def get_item(user: CurrentUser, household_id: str, item_id: str, engine: Engine | None = None) -> dict:
    with (engine or get_engine()).connect() as connection:
        row = connection.execute(text(_ITEM_SELECT + "AND ci.id = :item_id"), {
            "household_id": household_id, "user_id": user.id, "item_id": item_id,
        }).mappings().one_or_none()
    if row is None:
        raise _not_found()
    return dict(row)


def _check_reference(connection, household_id: str, values: dict) -> None:
    category_id = values.get("category_id")
    item_type = values["item_type"]
    if category_id is not None:
        category = connection.execute(text("""
            SELECT item_type, archived_at FROM catalog_categories
            WHERE household_id = :household_id AND id = :id
        """), {"household_id": household_id, "id": category_id}).mappings().one_or_none()
        if category is None:
            raise _not_found()
        if category["archived_at"] is not None:
            raise _conflict("CATALOG_REFERENCE_ARCHIVED", "That category is no longer available. Refresh choices and select another.")
        if category["item_type"] != item_type:
            raise _invalid("Choose a category for this item type.")

    store_id = values.get("preferred_store_id")
    if store_id is not None:
        store = connection.execute(text("""
            SELECT archived_at FROM catalog_stores WHERE household_id = :household_id AND id = :id
        """), {"household_id": household_id, "id": store_id}).mappings().one_or_none()
        if store is None:
            raise _not_found()
        if store["archived_at"] is not None:
            raise _conflict("CATALOG_REFERENCE_ARCHIVED", "That store is no longer available. Refresh choices and select another.")

    custom_id = values.get("custom_shopping_unit_id")
    if custom_id is not None:
        unit = connection.execute(text("""
            SELECT name, archived_at FROM household_shopping_units
            WHERE household_id = :household_id AND id = :id
        """), {"household_id": household_id, "id": custom_id}).mappings().one_or_none()
        if unit is None:
            raise _not_found()
        if unit["archived_at"] is not None:
            raise _conflict("CATALOG_REFERENCE_ARCHIVED", "That shopping unit is no longer available. Refresh choices and select another.")

    unit_code = values.get("shopping_unit_code")
    if unit_code is not None and connection.execute(
        text("SELECT 1 FROM catalog_shopping_units WHERE code = :code"), {"code": unit_code}
    ).scalar_one_or_none() is None:
        raise _invalid("Choose a built-in shopping unit.")
    if unit_code is not None and custom_id is not None:
        raise _invalid("Choose one shopping unit.")
    if custom_id is not None and unit_code is not None:
        raise _invalid("Choose one shopping unit.")

    dimension = values.get("recipe_measurement_dimension")
    recipe_code = values.get("recipe_measurement_unit_code")
    if (dimension is None) != (recipe_code is None):
        raise _invalid("Choose both a recipe measurement and its unit.")
    if dimension is not None:
        if item_type != "food":
            raise _invalid("Recipe measurements are only available for food items.")
        if dimension not in RECIPE_DIMENSIONS or connection.execute(text("""
            SELECT 1 FROM recipe_measurement_units WHERE code = :code AND dimension = :dimension
        """), {"code": recipe_code, "dimension": dimension}).scalar_one_or_none() is None:
            raise _invalid("Choose a valid recipe measurement unit for that dimension.")


def _assert_item_name_available(connection, household_id: str, normalized_name: str, item_id: str | None = None) -> None:
    exclusion_clause = "AND id <> :item_id" if item_id is not None else ""
    parameters = {"household_id": household_id, "normalized_name": normalized_name}
    if item_id is not None:
        parameters["item_id"] = item_id
    duplicate = connection.execute(text(f"""
        SELECT 1 FROM catalog_items
        WHERE household_id = :household_id AND normalized_name = :normalized_name
          AND archived_at IS NULL {exclusion_clause}
    """), parameters).scalar_one_or_none()
    if duplicate is not None:
        raise _conflict("CATALOG_ITEM_ALREADY_EXISTS", "An active item with that name already exists in this household.")


def create_item(user: CurrentUser, household_id: str, values: dict, engine: Engine | None = None) -> dict:
    name, normalized_name = _clean_name(values["name"], max_length=160, label="Item name")
    item_type = values["item_type"]
    if item_type not in ITEM_TYPES:
        raise _invalid("Item type must be food or household.")
    item = {**values, "name": name, "normalized_name": normalized_name}
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        _assert_item_name_available(connection, household_id, normalized_name)
        _check_reference(connection, household_id, item)
        created_id = connection.execute(text("""
            INSERT INTO catalog_items (
                household_id, item_type, category_id, name, normalized_name,
                shopping_unit_code, custom_shopping_unit_id, preferred_store_id,
                recipe_measurement_dimension, recipe_measurement_unit_code, created_by_user_id
            ) VALUES (
                :household_id, :item_type, :category_id, :name, :normalized_name,
                :shopping_unit_code, :custom_shopping_unit_id, :preferred_store_id,
                :recipe_measurement_dimension, :recipe_measurement_unit_code, :user_id
            ) RETURNING id::text
        """), {**item, "household_id": household_id, "user_id": user.id}).scalar_one()
        row = connection.execute(text(_ITEM_SELECT + "AND ci.id = :item_id"), {
            "household_id": household_id, "user_id": user.id, "item_id": created_id,
        }).mappings().one()
    return dict(row)


def update_item(user: CurrentUser, household_id: str, item_id: str, values: dict, fields: set[str], engine: Engine | None = None) -> dict:
    if not fields:
        raise _invalid("Provide at least one field to update.")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        current = connection.execute(text("""
            SELECT id::text AS id, item_type, category_id::text AS category_id, name,
                normalized_name,
                shopping_unit_code, custom_shopping_unit_id::text AS custom_shopping_unit_id,
                preferred_store_id::text AS preferred_store_id, recipe_measurement_dimension,
                recipe_measurement_unit_code
            FROM catalog_items
            WHERE household_id = :household_id AND id = :item_id AND archived_at IS NULL
            FOR UPDATE
        """), {"household_id": household_id, "item_id": item_id}).mappings().one_or_none()
        if current is None:
            raise _not_found()
        merged = dict(current)
        for field in fields:
            if field in values:
                merged[field] = values[field]
        if "shopping_unit_code" in fields and values.get("shopping_unit_code") is not None and "custom_shopping_unit_id" not in fields:
            merged["custom_shopping_unit_id"] = None
        if "custom_shopping_unit_id" in fields and values.get("custom_shopping_unit_id") is not None and "shopping_unit_code" not in fields:
            merged["shopping_unit_code"] = None
        if "name" in fields:
            name, normalized_name = _clean_name(merged["name"], max_length=160, label="Item name")
            merged["name"] = name
            merged["normalized_name"] = normalized_name
            _assert_item_name_available(connection, household_id, normalized_name, item_id)
        _check_reference(connection, household_id, merged)
        if merged["item_type"] not in ITEM_TYPES:
            raise _invalid("Item type must be food or household.")
        connection.execute(text("""
            UPDATE catalog_items SET
                item_type = :item_type, category_id = :category_id, name = :name,
                normalized_name = :normalized_name, shopping_unit_code = :shopping_unit_code,
                custom_shopping_unit_id = :custom_shopping_unit_id,
                preferred_store_id = :preferred_store_id,
                recipe_measurement_dimension = :recipe_measurement_dimension,
                recipe_measurement_unit_code = :recipe_measurement_unit_code,
                updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :item_id AND archived_at IS NULL
        """), {
            **merged, "household_id": household_id, "item_id": item_id,
        })
        row = connection.execute(text(_ITEM_SELECT + "AND ci.id = :item_id"), {
            "household_id": household_id, "user_id": user.id, "item_id": item_id,
        }).mappings().one()
    return dict(row)


def archive_item(user: CurrentUser, household_id: str, item_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        archived = connection.execute(text("""
            UPDATE catalog_items SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :item_id AND archived_at IS NULL
            RETURNING id
        """), {"household_id": household_id, "item_id": item_id}).scalar_one_or_none()
        if archived is None:
            raise _not_found()


def _assert_name_available(connection, table: str, household_id: str, normalized_name: str,
                           *, item_type: str | None = None, exclude_id: str | None = None) -> None:
    type_clause = "AND item_type = :item_type" if item_type is not None else ""
    exclusion_clause = "AND id <> :exclude_id" if exclude_id is not None else ""
    parameters = {"household_id": household_id, "normalized_name": normalized_name}
    if item_type is not None:
        parameters["item_type"] = item_type
    if exclude_id is not None:
        parameters["exclude_id"] = exclude_id
    row = connection.execute(text(f"""
        SELECT 1 FROM {table}
        WHERE household_id = :household_id AND normalized_name = :normalized_name
          AND archived_at IS NULL {exclusion_clause}
          {type_clause}
    """), parameters).scalar_one_or_none()
    if row is not None:
        raise _conflict("CATALOG_CHOICE_ALREADY_EXISTS", "A choice with that name already exists.")


def create_category(
    user: CurrentUser,
    household_id: str,
    item_type: str,
    name: str,
    emoji: str | None = None,
    engine: Engine | None = None,
) -> dict:
    if item_type not in ITEM_TYPES:
        raise _invalid("Item type must be food or household.")
    clean, normalized = _clean_name(name, max_length=80, label="Category name")
    clean_emoji = _clean_emoji(emoji)
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        _assert_name_available(connection, "catalog_categories", household_id, normalized, item_type=item_type)
        row = connection.execute(text("""
            INSERT INTO catalog_categories (household_id, item_type, name, normalized_name, emoji)
            VALUES (:household_id, :item_type, :name, :normalized_name, :emoji)
            RETURNING id::text AS id, item_type, name, emoji, created_at, updated_at
        """), {"household_id": household_id, "item_type": item_type, "name": clean, "normalized_name": normalized, "emoji": clean_emoji}).mappings().one()
    return {**dict(row), "active_item_count": 0}


def update_category(
    user: CurrentUser,
    household_id: str,
    category_id: str,
    name: str,
    emoji: str | None = None,
    emoji_provided: bool = True,
    engine: Engine | None = None,
) -> dict:
    clean, normalized = _clean_name(name, max_length=80, label="Category name")
    clean_emoji = _clean_emoji(emoji) if emoji_provided else None
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        current = connection.execute(text("""
            SELECT item_type FROM catalog_categories WHERE household_id = :household_id
              AND id = :id AND archived_at IS NULL FOR UPDATE
        """), {"household_id": household_id, "id": category_id}).mappings().one_or_none()
        if current is None:
            raise _not_found()
        _assert_name_available(connection, "catalog_categories", household_id, normalized,
                               item_type=current["item_type"], exclude_id=category_id)
        row = connection.execute(text("""
            UPDATE catalog_categories SET name = :name, normalized_name = :normalized_name,
                emoji = CASE WHEN :emoji_provided THEN :emoji ELSE emoji END,
                updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :id AND archived_at IS NULL
            RETURNING id::text AS id, item_type, name, emoji, created_at, updated_at
        """), {"household_id": household_id, "id": category_id, "name": clean, "normalized_name": normalized, "emoji": clean_emoji, "emoji_provided": emoji_provided}).mappings().one()
        active_item_count = connection.execute(text("""
            SELECT count(*)::int FROM catalog_items
            WHERE household_id = :household_id AND category_id = :category_id AND archived_at IS NULL
        """), {"household_id": household_id, "category_id": category_id}).scalar_one()
    return {**dict(row), "active_item_count": active_item_count}


def archive_category(
    user: CurrentUser,
    household_id: str,
    category_id: str,
    expected_active_item_count: int,
    engine: Engine | None = None,
) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        exists = connection.execute(text("""
            SELECT 1 FROM catalog_categories WHERE household_id = :household_id
              AND id = :id AND archived_at IS NULL FOR UPDATE
        """), {"household_id": household_id, "id": category_id}).scalar_one_or_none()
        if exists is None:
            raise _not_found()
        active_item_count = connection.execute(text("""
            SELECT count(*)::int FROM catalog_items WHERE household_id = :household_id
              AND category_id = :id AND archived_at IS NULL
        """), {"household_id": household_id, "id": category_id}).scalar_one()
        if active_item_count != expected_active_item_count:
            raise _conflict("CATALOG_CATEGORY_COUNT_CHANGED", "The number of active items changed. Refresh the category and confirm again.")
        connection.execute(text("""
            UPDATE catalog_items SET category_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND category_id = :id AND archived_at IS NULL
        """), {"household_id": household_id, "id": category_id})
        connection.execute(text("""
            UPDATE catalog_categories SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :id
        """), {"household_id": household_id, "id": category_id})


def create_store(user: CurrentUser, household_id: str, name: str, engine: Engine | None = None) -> dict:
    clean, normalized = _clean_name(name, max_length=120, label="Store name")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        _assert_name_available(connection, "catalog_stores", household_id, normalized)
        row = connection.execute(text("""
            INSERT INTO catalog_stores (household_id, name, normalized_name)
            VALUES (:household_id, :name, :normalized_name)
            RETURNING id::text AS id, name, created_at, updated_at
        """), {"household_id": household_id, "name": clean, "normalized_name": normalized}).mappings().one()
    return dict(row)


def update_store(user: CurrentUser, household_id: str, store_id: str, name: str, engine: Engine | None = None) -> dict:
    clean, normalized = _clean_name(name, max_length=120, label="Store name")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        exists = connection.execute(text("""
            SELECT 1 FROM catalog_stores WHERE household_id = :household_id AND id = :id
              AND archived_at IS NULL FOR UPDATE
        """), {"household_id": household_id, "id": store_id}).scalar_one_or_none()
        if exists is None:
            raise _not_found()
        _assert_name_available(connection, "catalog_stores", household_id, normalized, exclude_id=store_id)
        row = connection.execute(text("""
            UPDATE catalog_stores SET name = :name, normalized_name = :normalized_name,
                updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :id AND archived_at IS NULL
            RETURNING id::text AS id, name, created_at, updated_at
        """), {"household_id": household_id, "id": store_id, "name": clean, "normalized_name": normalized}).mappings().one()
    return dict(row)


def archive_store(user: CurrentUser, household_id: str, store_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        exists = connection.execute(text("""
            SELECT 1 FROM catalog_stores WHERE household_id = :household_id AND id = :id
              AND archived_at IS NULL FOR UPDATE
        """), {"household_id": household_id, "id": store_id}).scalar_one_or_none()
        if exists is None:
            raise _not_found()
        in_use = connection.execute(text("""
            SELECT 1 FROM catalog_items WHERE household_id = :household_id
              AND preferred_store_id = :id AND archived_at IS NULL LIMIT 1
        """), {"household_id": household_id, "id": store_id}).scalar_one_or_none()
        if in_use is not None:
            raise _conflict("CATALOG_CHOICE_IN_USE", "Remove this store from active items before removing it.")
        connection.execute(text("""
            UPDATE catalog_stores SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :id
        """), {"household_id": household_id, "id": store_id})


def create_custom_unit(user: CurrentUser, household_id: str, name: str, engine: Engine | None = None) -> dict:
    clean, normalized = _clean_name(name, max_length=40, label="Shopping unit")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        builtin = connection.execute(text("SELECT 1 FROM catalog_shopping_units WHERE lower(label) = :name"), {"name": normalized}).scalar_one_or_none()
        if builtin is not None:
            raise _conflict("CATALOG_CHOICE_ALREADY_EXISTS", "A built-in shopping unit already has that name.")
        _assert_name_available(connection, "household_shopping_units", household_id, normalized)
        row = connection.execute(text("""
            INSERT INTO household_shopping_units (household_id, name, normalized_name)
            VALUES (:household_id, :name, :normalized_name)
            RETURNING id::text AS id, name, created_at, updated_at
        """), {"household_id": household_id, "name": clean, "normalized_name": normalized}).mappings().one()
    return dict(row)


def update_custom_unit(user: CurrentUser, household_id: str, unit_id: str, name: str, engine: Engine | None = None) -> dict:
    clean, normalized = _clean_name(name, max_length=40, label="Shopping unit")
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        exists = connection.execute(text("""
            SELECT 1 FROM household_shopping_units WHERE household_id = :household_id
              AND id = :id AND archived_at IS NULL FOR UPDATE
        """), {"household_id": household_id, "id": unit_id}).scalar_one_or_none()
        if exists is None:
            raise _not_found()
        builtin = connection.execute(text("SELECT 1 FROM catalog_shopping_units WHERE lower(label) = :name"), {"name": normalized}).scalar_one_or_none()
        if builtin is not None:
            raise _conflict("CATALOG_CHOICE_ALREADY_EXISTS", "A built-in shopping unit already has that name.")
        _assert_name_available(connection, "household_shopping_units", household_id, normalized, exclude_id=unit_id)
        row = connection.execute(text("""
            UPDATE household_shopping_units SET name = :name, normalized_name = :normalized_name,
                updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :id AND archived_at IS NULL
            RETURNING id::text AS id, name, created_at, updated_at
        """), {"household_id": household_id, "id": unit_id, "name": clean, "normalized_name": normalized}).mappings().one()
    return dict(row)


def archive_custom_unit(user: CurrentUser, household_id: str, unit_id: str, engine: Engine | None = None) -> None:
    with (engine or get_engine()).begin() as connection:
        lock_household(connection, household_id, user.id)
        exists = connection.execute(text("""
            SELECT 1 FROM household_shopping_units WHERE household_id = :household_id
              AND id = :id AND archived_at IS NULL FOR UPDATE
        """), {"household_id": household_id, "id": unit_id}).scalar_one_or_none()
        if exists is None:
            raise _not_found()
        in_use = connection.execute(text("""
            SELECT 1 FROM catalog_items WHERE household_id = :household_id
              AND custom_shopping_unit_id = :id AND archived_at IS NULL LIMIT 1
        """), {"household_id": household_id, "id": unit_id}).scalar_one_or_none()
        if in_use is not None:
            raise _conflict("CATALOG_CHOICE_IN_USE", "Remove this unit from active items before removing it.")
        connection.execute(text("""
            UPDATE household_shopping_units SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE household_id = :household_id AND id = :id
        """), {"household_id": household_id, "id": unit_id})
