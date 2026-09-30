from time import perf_counter
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, StrictBool

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
