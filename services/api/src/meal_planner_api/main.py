from time import perf_counter
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Query, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, StrictBool, StrictInt

from meal_planner_api import catalog, meal_planning, recipes
from meal_planner_api.current_user import CurrentUser
from meal_planner_api.household_management import (
    delete_household,
    household_detail,
    leave_household,
    list_invitations,
    list_members,
    member_detail,
    reissue_invitation,
    remove_member,
    set_member_role,
    update_household,
)
from meal_planner_api.onboarding import (
    accept_invitation,
    create_household,
    create_invitation,
    list_households,
    require_current_user,
    revoke_invitation,
)
from meal_planner_api.shopping_lists import add_item, delete_item, get_list, set_checked

app = FastAPI(
    title="Meal Planner API",
    version="0.1.0",
)


@app.middleware("http")
async def measure_me_request(request: Request, call_next):
    from meal_planner_api.startup_diagnostics import (
        elapsed_ms,
        enabled,
        log_timing,
        new_request_id,
        request_id_for,
    )

    if request.url.path != "/v1/me" or not enabled():
        return await call_next(request)

    request_id = new_request_id(request.headers.get("x-request-id"))
    request.state.startup_request_id = request_id
    log_timing(request_id, "request_received", 0)
    started_at = perf_counter()
    response_status = status.HTTP_500_INTERNAL_SERVER_ERROR
    try:
        response = await call_next(request)
        response_status = response.status_code
        return response
    finally:
        log_timing(request_id_for(request), "request_complete", elapsed_ms(started_at), response_status)


@app.get("/v1/health", tags=["system"])
def get_health() -> dict[str, str]:
    return {"status": "ok"}


User = Annotated[CurrentUser, Depends(require_current_user)]


class CreateHouseholdRequest(BaseModel):
    name: str = Field(max_length=200)
    time_zone: str = Field(max_length=100)


class UpdateHouseholdRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    time_zone: str | None = Field(default=None, max_length=100)


class SetMemberRoleRequest(BaseModel):
    role: str = Field(pattern="^(owner|member)$")


class CreateInvitationRequest(BaseModel):
    email: EmailStr


class AcceptInvitationRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)


class CreateShoppingListItemRequest(BaseModel):
    name: str = Field(max_length=200)


class SetShoppingListItemCheckedRequest(BaseModel):
    is_checked: StrictBool


class CreateMealPlanEntryRequest(BaseModel):
    planned_for: str = Field(min_length=10, max_length=10)
    meal_slot: Literal["breakfast", "lunch", "dinner"]
    recipe_id: UUID


class UpdateMealPlanEntryRequest(CreateMealPlanEntryRequest):
    expected_revision: StrictInt = Field(gt=0)


class AddReviewedMealPlanNeedsRequest(BaseModel):
    week_start: str = Field(min_length=10, max_length=10)
    review_token: str = Field(min_length=64, max_length=64)
    request_id: UUID
    selected_need_keys: list[str] = Field(min_length=1, max_length=500)


CatalogItemType = Literal["food", "household"]
RecipeDimension = Literal["volume", "mass", "count"]


class CatalogItemCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    item_type: CatalogItemType
    category_id: UUID | None = None
    shopping_unit_code: str | None = Field(default=None, max_length=40)
    custom_shopping_unit_id: UUID | None = None
    preferred_store_id: UUID | None = None
    recipe_measurement_dimension: RecipeDimension | None = None
    recipe_measurement_unit_code: str | None = Field(default=None, max_length=40)


class CatalogItemUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    item_type: CatalogItemType | None = None
    category_id: UUID | None = None
    shopping_unit_code: str | None = Field(default=None, max_length=40)
    custom_shopping_unit_id: UUID | None = None
    preferred_store_id: UUID | None = None
    recipe_measurement_dimension: RecipeDimension | None = None
    recipe_measurement_unit_code: str | None = Field(default=None, max_length=40)


class CatalogChoiceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    item_type: CatalogItemType | None = None


class CatalogChoiceUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CatalogCategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    item_type: CatalogItemType
    emoji: str | None = Field(default=None, max_length=16)


class CatalogCategoryUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=16)


class RecipeIngredientRequest(BaseModel):
    catalog_item_id: UUID
    amount: str | None = Field(default=None, max_length=40)
    unit_code: str | None = Field(default=None, max_length=40)
    custom_unit_label: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=1000)


class RecipeCreateRequest(BaseModel):
    create_request_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    cover_kind: Literal["initials", "emoji"] = "initials"
    cover_emoji: str | None = Field(default=None, max_length=16)
    servings: StrictInt | None = Field(default=None, gt=0)
    prep_hours: StrictInt | None = Field(default=None, ge=0, le=999999)
    prep_minutes: StrictInt | None = Field(default=None, ge=0, le=59)
    cook_hours: StrictInt | None = Field(default=None, ge=0, le=999999)
    cook_minutes: StrictInt | None = Field(default=None, ge=0, le=59)
    notes: str | None = Field(default=None, max_length=10000)
    source_url: str | None = Field(default=None, max_length=2048)
    ingredients: list[RecipeIngredientRequest] = Field(min_length=1, max_length=200)
    steps: list[str] | None = Field(default=None, max_length=200)


class RecipeUpdateRequest(BaseModel):
    expected_revision: StrictInt = Field(gt=0)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    cover_kind: Literal["initials", "emoji"] | None = None
    cover_emoji: str | None = Field(default=None, max_length=16)
    servings: StrictInt | None = Field(default=None, gt=0)
    prep_hours: StrictInt | None = Field(default=None, ge=0, le=999999)
    prep_minutes: StrictInt | None = Field(default=None, ge=0, le=59)
    cook_hours: StrictInt | None = Field(default=None, ge=0, le=999999)
    cook_minutes: StrictInt | None = Field(default=None, ge=0, le=59)
    notes: str | None = Field(default=None, max_length=10000)
    source_url: str | None = Field(default=None, max_length=2048)
    ingredients: list[RecipeIngredientRequest] | None = Field(default=None, min_length=1, max_length=200)
    steps: list[str] | None = Field(default=None, max_length=200)


@app.get("/v1/me", tags=["onboarding"])
def get_me(user: User, request: Request) -> dict:
    from meal_planner_api.startup_diagnostics import request_id_for

    return {
        "user": {"id": user.id, "email": user.normalized_email, "display_name": user.display_name},
        "households": list_households(user, request_id=request_id_for(request)),
    }


@app.get("/v1/households", tags=["households"])
def get_households(user: User) -> dict:
    return {"households": list_households(user)}


@app.post("/v1/households", status_code=status.HTTP_201_CREATED, tags=["households"])
def post_household(payload: CreateHouseholdRequest, user: User) -> dict:
    return {"household": create_household(user, payload.name, payload.time_zone)}


@app.get("/v1/households/{household_id}", tags=["households"])
def get_household(household_id: UUID, user: User) -> dict:
    return {"household": household_detail(user, str(household_id))}


@app.patch("/v1/households/{household_id}", tags=["households"])
def patch_household(household_id: UUID, payload: UpdateHouseholdRequest, user: User) -> dict:
    if not payload.model_fields_set:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="At least one household field is required.")
    return {"household": update_household(user, str(household_id), payload.name, payload.time_zone)}


@app.get("/v1/households/{household_id}/members", tags=["households"])
def get_household_members(household_id: UUID, user: User) -> dict:
    return {"members": list_members(user, str(household_id))}


@app.get("/v1/households/{household_id}/members/{membership_id}", tags=["households"])
def get_household_member(household_id: UUID, membership_id: UUID, user: User) -> dict:
    return {"member": member_detail(user, str(household_id), str(membership_id))}


@app.patch("/v1/households/{household_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["households"])
def patch_household_member(household_id: UUID, membership_id: UUID, payload: SetMemberRoleRequest, user: User) -> Response:
    set_member_role(user, str(household_id), str(membership_id), payload.role)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/v1/households/{household_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["households"])
def delete_household_member(household_id: UUID, membership_id: UUID, user: User) -> Response:
    remove_member(user, str(household_id), str(membership_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/v1/households/{household_id}/leave", status_code=status.HTTP_204_NO_CONTENT, tags=["households"])
def delete_household_membership(household_id: UUID, user: User) -> Response:
    leave_household(user, str(household_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/v1/households/{household_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["households"])
def delete_household_route(household_id: UUID, user: User) -> Response:
    delete_household(user, str(household_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/catalog/units", tags=["catalog"])
def get_catalog_units(household_id: UUID, user: User) -> dict:
    return catalog.list_units(user, str(household_id))


@app.get("/v1/households/{household_id}/catalog/categories", tags=["catalog"])
def get_catalog_categories(household_id: UUID, user: User, item_type: CatalogItemType | None = None) -> dict:
    return {"categories": catalog.list_categories(user, str(household_id), item_type)}


@app.post("/v1/households/{household_id}/catalog/categories", status_code=status.HTTP_201_CREATED, tags=["catalog"])
def post_catalog_category(household_id: UUID, payload: CatalogCategoryCreateRequest, user: User) -> dict:
    return {"category": catalog.create_category(user, str(household_id), payload.item_type, payload.name, payload.emoji)}


@app.patch("/v1/households/{household_id}/catalog/categories/{category_id}", tags=["catalog"])
def patch_catalog_category(household_id: UUID, category_id: UUID, payload: CatalogCategoryUpdateRequest, user: User) -> dict:
    return {"category": catalog.update_category(
        user,
        str(household_id),
        str(category_id),
        payload.name,
        payload.emoji,
        emoji_provided="emoji" in payload.model_fields_set,
    )}


@app.delete("/v1/households/{household_id}/catalog/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["catalog"])
def delete_catalog_category(
    household_id: UUID,
    category_id: UUID,
    user: User,
    expected_active_item_count: int = Query(ge=0),
) -> Response:
    catalog.archive_category(user, str(household_id), str(category_id), expected_active_item_count)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/catalog/stores", tags=["catalog"])
def get_catalog_stores(household_id: UUID, user: User) -> dict:
    return {"stores": catalog.list_stores(user, str(household_id))}


@app.post("/v1/households/{household_id}/catalog/stores", status_code=status.HTTP_201_CREATED, tags=["catalog"])
def post_catalog_store(household_id: UUID, payload: CatalogChoiceCreateRequest, user: User) -> dict:
    return {"store": catalog.create_store(user, str(household_id), payload.name)}


@app.patch("/v1/households/{household_id}/catalog/stores/{store_id}", tags=["catalog"])
def patch_catalog_store(household_id: UUID, store_id: UUID, payload: CatalogChoiceUpdateRequest, user: User) -> dict:
    return {"store": catalog.update_store(user, str(household_id), str(store_id), payload.name)}


@app.delete("/v1/households/{household_id}/catalog/stores/{store_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["catalog"])
def delete_catalog_store(household_id: UUID, store_id: UUID, user: User) -> Response:
    catalog.archive_store(user, str(household_id), str(store_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/households/{household_id}/catalog/shopping-units", status_code=status.HTTP_201_CREATED, tags=["catalog"])
def post_catalog_shopping_unit(household_id: UUID, payload: CatalogChoiceCreateRequest, user: User) -> dict:
    return {"unit": catalog.create_custom_unit(user, str(household_id), payload.name)}


@app.patch("/v1/households/{household_id}/catalog/shopping-units/{unit_id}", tags=["catalog"])
def patch_catalog_shopping_unit(household_id: UUID, unit_id: UUID, payload: CatalogChoiceUpdateRequest, user: User) -> dict:
    return {"unit": catalog.update_custom_unit(user, str(household_id), str(unit_id), payload.name)}


@app.delete("/v1/households/{household_id}/catalog/shopping-units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["catalog"])
def delete_catalog_shopping_unit(household_id: UUID, unit_id: UUID, user: User) -> Response:
    catalog.archive_custom_unit(user, str(household_id), str(unit_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/catalog/items", tags=["catalog"])
def get_catalog_items(household_id: UUID, user: User, item_type: CatalogItemType | None = None, search: str | None = None) -> dict:
    return {"items": catalog.list_items(user, str(household_id), item_type, search)}


@app.post("/v1/households/{household_id}/catalog/items", status_code=status.HTTP_201_CREATED, tags=["catalog"])
def post_catalog_item(household_id: UUID, payload: CatalogItemCreateRequest, user: User) -> dict:
    return {"item": catalog.create_item(user, str(household_id), payload.model_dump(mode="json"))}


@app.get("/v1/households/{household_id}/catalog/items/{item_id}", tags=["catalog"])
def get_catalog_item(household_id: UUID, item_id: UUID, user: User) -> dict:
    return {"item": catalog.get_item(user, str(household_id), str(item_id))}


@app.patch("/v1/households/{household_id}/catalog/items/{item_id}", tags=["catalog"])
def patch_catalog_item(household_id: UUID, item_id: UUID, payload: CatalogItemUpdateRequest, user: User) -> dict:
    return {"item": catalog.update_item(user, str(household_id), str(item_id), payload.model_dump(mode="json"), payload.model_fields_set)}


@app.delete("/v1/households/{household_id}/catalog/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["catalog"])
def delete_catalog_item(household_id: UUID, item_id: UUID, user: User) -> Response:
    catalog.archive_item(user, str(household_id), str(item_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/recipes", tags=["recipes"])
def get_recipes(
    household_id: UUID,
    user: User,
    archived: bool = False,
    search: str | None = None,
) -> dict:
    return {"recipes": recipes.list_recipes(user, str(household_id), archived=archived, search=search)}


@app.post("/v1/households/{household_id}/recipes", status_code=status.HTTP_201_CREATED, tags=["recipes"])
def post_recipe(household_id: UUID, payload: RecipeCreateRequest, user: User) -> dict:
    return {"recipe": recipes.create_recipe(user, str(household_id), payload.model_dump(mode="python"))}


@app.get("/v1/households/{household_id}/recipes/{recipe_id}", tags=["recipes"])
def get_recipe(household_id: UUID, recipe_id: UUID, user: User) -> dict:
    return {"recipe": recipes.get_recipe(user, str(household_id), str(recipe_id))}


@app.patch("/v1/households/{household_id}/recipes/{recipe_id}", tags=["recipes"])
def patch_recipe(household_id: UUID, recipe_id: UUID, payload: RecipeUpdateRequest, user: User) -> dict:
    return {"recipe": recipes.update_recipe(
        user,
        str(household_id),
        str(recipe_id),
        payload.model_dump(mode="python", exclude_unset=True),
        payload.model_fields_set,
    )}


@app.post("/v1/households/{household_id}/recipes/{recipe_id}/archive", status_code=status.HTTP_204_NO_CONTENT, tags=["recipes"])
def post_archive_recipe(household_id: UUID, recipe_id: UUID, user: User) -> Response:
    recipes.archive_recipe(user, str(household_id), str(recipe_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/households/{household_id}/recipes/{recipe_id}/restore", status_code=status.HTTP_204_NO_CONTENT, tags=["recipes"])
def post_restore_recipe(household_id: UUID, recipe_id: UUID, user: User) -> Response:
    recipes.restore_recipe(user, str(household_id), str(recipe_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/households/{household_id}/invitations", status_code=status.HTTP_201_CREATED, tags=["invitations"])
def post_invitation(household_id: UUID, payload: CreateInvitationRequest, user: User) -> dict:
    return {"invitation": create_invitation(user, str(household_id), payload.email)}


@app.get("/v1/households/{household_id}/invitations", tags=["invitations"])
def get_invitations(household_id: UUID, user: User) -> dict:
    return {"invitations": list_invitations(user, str(household_id))}


@app.post("/v1/households/{household_id}/invitations/{invitation_id}/revoke", status_code=status.HTTP_204_NO_CONTENT, tags=["invitations"])
def post_revoke_invitation(household_id: UUID, invitation_id: UUID, user: User) -> Response:
    revoke_invitation(user, str(household_id), str(invitation_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/v1/households/{household_id}/invitations/{invitation_id}/reissue", status_code=status.HTTP_201_CREATED, tags=["invitations"])
def post_reissue_invitation(household_id: UUID, invitation_id: UUID, user: User) -> dict:
    return {"invitation": reissue_invitation(user, str(household_id), str(invitation_id))}


@app.post("/v1/invitations/accept", status_code=status.HTTP_204_NO_CONTENT, tags=["invitations"])
def post_accept_invitation(payload: AcceptInvitationRequest, user: User) -> Response:
    accept_invitation(user, payload.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/shopping-list", tags=["shopping-list"])
def get_shopping_list(household_id: UUID, user: User) -> dict:
    return {"shopping_list": get_list(user, str(household_id))}


@app.post("/v1/households/{household_id}/shopping-list/items", status_code=status.HTTP_201_CREATED, tags=["shopping-list"])
def post_shopping_list_item(household_id: UUID, payload: CreateShoppingListItemRequest, user: User) -> dict:
    return {"item": add_item(user, str(household_id), payload.name)}


@app.patch("/v1/households/{household_id}/shopping-list/items/{item_id}", tags=["shopping-list"])
def patch_shopping_list_item(household_id: UUID, item_id: UUID, payload: SetShoppingListItemCheckedRequest, user: User) -> dict:
    return {"item": set_checked(user, str(household_id), str(item_id), payload.is_checked)}


@app.delete("/v1/households/{household_id}/shopping-list/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["shopping-list"])
def remove_shopping_list_item(household_id: UUID, item_id: UUID, user: User) -> Response:
    delete_item(user, str(household_id), str(item_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/meal-plan", tags=["meal-plan"])
def get_meal_plan(household_id: UUID, user: User, week_offset: int = Query(default=0, ge=-520, le=520)) -> dict:
    return meal_planning.get_week(user, str(household_id), week_offset)


@app.post("/v1/households/{household_id}/meal-plan/entries", status_code=status.HTTP_201_CREATED, tags=["meal-plan"])
def post_meal_plan_entry(household_id: UUID, payload: CreateMealPlanEntryRequest, user: User) -> dict:
    return {"entry": meal_planning.create_entry(user, str(household_id), payload.planned_for, payload.meal_slot, str(payload.recipe_id))}


@app.patch("/v1/households/{household_id}/meal-plan/entries/{entry_id}", tags=["meal-plan"])
def patch_meal_plan_entry(household_id: UUID, entry_id: UUID, payload: UpdateMealPlanEntryRequest, user: User) -> dict:
    return {"entry": meal_planning.update_entry(user, str(household_id), str(entry_id), payload.planned_for, payload.meal_slot, str(payload.recipe_id), payload.expected_revision)}


@app.delete("/v1/households/{household_id}/meal-plan/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["meal-plan"])
def delete_meal_plan_entry(household_id: UUID, entry_id: UUID, user: User, expected_revision: int = Query(gt=0)) -> Response:
    meal_planning.delete_entry(user, str(household_id), str(entry_id), expected_revision)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/v1/households/{household_id}/meal-plan/shopping-review", tags=["meal-plan"])
def get_meal_plan_shopping_review(household_id: UUID, user: User, week_start: str = Query(min_length=10, max_length=10)) -> dict:
    return meal_planning.get_shopping_review(user, str(household_id), week_start)


@app.post("/v1/households/{household_id}/meal-plan/shopping", status_code=status.HTTP_201_CREATED, tags=["meal-plan"])
def post_meal_plan_shopping(household_id: UUID, payload: AddReviewedMealPlanNeedsRequest, user: User) -> dict:
    return meal_planning.add_reviewed_needs(user, str(household_id), payload.week_start, payload.review_token, str(payload.request_id), payload.selected_need_keys)
