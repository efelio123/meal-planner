from collections.abc import Mapping

from sqlalchemy.sql.elements import TextClause

from meal_planner_api.catalog import (
    _assert_item_name_available,
    _assert_name_available,
    list_categories,
    list_items,
)
from meal_planner_api.current_user import CurrentUser


class RecordingResult:
    def __init__(self, scalar_value=None) -> None:
        self.scalar_value = scalar_value

    def scalar_one_or_none(self):
        return self.scalar_value

    def mappings(self):
        return self

    def all(self):
        return []


class RecordingConnection:
    def __init__(self) -> None:
        self.executions: list[tuple[str, Mapping[str, object]]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def execute(self, statement: TextClause, parameters: Mapping[str, object]) -> RecordingResult:
        sql = str(statement)
        self.executions.append((sql, dict(parameters)))
        return RecordingResult(1 if "SELECT 1 FROM households h" in sql else None)


class RecordingEngine:
    def __init__(self) -> None:
        self.connection = RecordingConnection()

    def connect(self) -> RecordingConnection:
        return self.connection


def test_item_name_check_omits_nullable_exclusion_for_create_and_binds_it_for_rename() -> None:
    create_connection = RecordingConnection()
    _assert_item_name_available(create_connection, "household-id", "milk")
    create_sql, create_parameters = create_connection.executions[0]
    assert "item_id" not in create_sql
    assert "item_id" not in create_parameters

    rename_connection = RecordingConnection()
    _assert_item_name_available(rename_connection, "household-id", "milk", "item-id")
    rename_sql, rename_parameters = rename_connection.executions[0]
    assert "id <> :item_id" in rename_sql
    assert rename_parameters["item_id"] == "item-id"
    assert "IS NULL OR" not in rename_sql


def test_choice_name_check_conditionally_includes_type_and_exclusion_predicates() -> None:
    create_connection = RecordingConnection()
    _assert_name_available(
        create_connection, "catalog_categories", "household-id", "produce", item_type="food"
    )
    create_sql, create_parameters = create_connection.executions[0]
    assert "item_type = :item_type" in create_sql
    assert create_parameters["item_type"] == "food"
    assert "exclude_id" not in create_sql
    assert "exclude_id" not in create_parameters

    rename_connection = RecordingConnection()
    _assert_name_available(
        rename_connection,
        "catalog_categories",
        "household-id",
        "produce",
        item_type="household",
        exclude_id="category-id",
    )
    rename_sql, rename_parameters = rename_connection.executions[0]
    assert "item_type = :item_type" in rename_sql
    assert "id <> :exclude_id" in rename_sql
    assert rename_parameters["item_type"] == "household"
    assert rename_parameters["exclude_id"] == "category-id"
    assert "IS NULL OR" not in rename_sql

    unfiltered_connection = RecordingConnection()
    _assert_name_available(unfiltered_connection, "catalog_stores", "household-id", "market")
    unfiltered_sql, unfiltered_parameters = unfiltered_connection.executions[0]
    assert "item_type" not in unfiltered_sql
    assert "exclude_id" not in unfiltered_sql
    assert "item_type" not in unfiltered_parameters
    assert "exclude_id" not in unfiltered_parameters


def test_optional_item_type_filters_are_omitted_when_unset_and_bound_when_present() -> None:
    user = CurrentUser("user-id", "user@example.test", "Test User")
    categories_engine = RecordingEngine()
    list_categories(user, "household-id", None, engine=categories_engine)  # type: ignore[arg-type]
    category_sql, category_parameters = categories_engine.connection.executions[0]
    assert ":item_type" not in category_sql
    assert "item_type" not in category_parameters

    filtered_categories_engine = RecordingEngine()
    list_categories(user, "household-id", "household", engine=filtered_categories_engine)  # type: ignore[arg-type]
    filtered_category_sql, filtered_category_parameters = filtered_categories_engine.connection.executions[0]
    assert "c.item_type = :item_type" in filtered_category_sql
    assert filtered_category_parameters["item_type"] == "household"

    items_engine = RecordingEngine()
    list_items(user, "household-id", engine=items_engine)  # type: ignore[arg-type]
    item_sql, item_parameters = items_engine.connection.executions[0]
    assert ":item_type" not in item_sql
    assert ":search" not in item_sql
    assert "item_type" not in item_parameters
    assert "search" not in item_parameters

    filtered_items_engine = RecordingEngine()
    list_items(user, "household-id", item_type="food", search="  Red Apple  ", engine=filtered_items_engine)  # type: ignore[arg-type]
    filtered_item_sql, filtered_item_parameters = filtered_items_engine.connection.executions[0]
    assert "ci.item_type = :item_type" in filtered_item_sql
    assert "ci.normalized_name LIKE '%' || :search || '%'" in filtered_item_sql
    assert filtered_item_parameters["item_type"] == "food"
    assert filtered_item_parameters["search"] == "red apple"
