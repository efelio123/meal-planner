from time import perf_counter
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, StrictBool

from meal_planner_api.onboarding import (
    CurrentUser,
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


class CreateInvitationRequest(BaseModel):
    email: EmailStr


class AcceptInvitationRequest(BaseModel):
    code: str = Field(min_length=1, max_length=512)


class CreateShoppingListItemRequest(BaseModel):
    name: str = Field(max_length=200)


class SetShoppingListItemCheckedRequest(BaseModel):
    is_checked: StrictBool


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


@app.post("/v1/households/{household_id}/invitations", status_code=status.HTTP_201_CREATED, tags=["invitations"])
def post_invitation(household_id: str, payload: CreateInvitationRequest, user: User) -> dict:
    return {"invitation": create_invitation(user, household_id, payload.email)}


@app.post("/v1/households/{household_id}/invitations/{invitation_id}/revoke", status_code=status.HTTP_204_NO_CONTENT, tags=["invitations"])
def post_revoke_invitation(household_id: str, invitation_id: str, user: User) -> Response:
    revoke_invitation(user, household_id, invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
