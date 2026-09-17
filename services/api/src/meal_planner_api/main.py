from typing import Annotated

from fastapi import Depends, FastAPI, Response, status
from pydantic import BaseModel, EmailStr, Field

from meal_planner_api.onboarding import (
    CurrentUser,
    accept_invitation,
    create_household,
    create_invitation,
    list_households,
    require_current_user,
    revoke_invitation,
)

app = FastAPI(
    title="Meal Planner API",
    version="0.1.0",
)


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


@app.get("/v1/me", tags=["onboarding"])
def get_me(user: User) -> dict:
    return {"user": {"id": user.id, "email": user.normalized_email, "display_name": user.display_name}, "households": list_households(user)}


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
