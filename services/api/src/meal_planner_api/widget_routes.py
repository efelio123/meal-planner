"""Private widget routes. Validation never echoes credential-bearing inputs."""

from functools import wraps
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, SecretStr, StrictBool, StrictInt

from meal_planner_api import widgets
from meal_planner_api.current_user import CurrentUser
from meal_planner_api.onboarding import require_current_user


class PrivateWidgetRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        @wraps(handler)
        async def private(request):
            try:
                response = await handler(request)
            except RequestValidationError as error:
                response = JSONResponse(
                    status_code=422,
                    content={
                        "detail": [
                            {key: entry[key] for key in ("loc", "msg", "type")}
                            for entry in error.errors()
                        ]
                    },
                )
            except HTTPException as error:
                error.headers = {**(error.headers or {}), "Cache-Control": "no-store"}
                raise
            response.headers["Cache-Control"] = "no-store"
            return response

        return private


router = APIRouter(tags=["widgets"], route_class=PrivateWidgetRoute)
User = Annotated[CurrentUser, Depends(require_current_user)]


class Registration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generation: UUID
    secret: SecretStr
    week_start: StrictInt = Field(ge=0, le=6)


class Checkoff(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: UUID
    generation: UUID
    item_id: UUID
    is_checked: StrictBool
    expected_version: StrictInt = Field(gt=0, le=9007199254740991)


@router.put("/v1/households/{household_id}/widget-devices/{device_id}")
def register(household_id: UUID, device_id: UUID, payload: Registration, user: User):
    values = payload.model_dump(mode="json")
    values["secret"] = payload.secret.get_secret_value()
    return widgets.register(user, str(household_id), str(device_id), values)


@router.delete(
    "/v1/households/{household_id}/widget-devices/{device_id}", status_code=204
)
def remove(household_id: UUID, device_id: UUID, user: User):
    widgets.remove_device(user, str(household_id), str(device_id))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/v1/widget/summary")
def summary(request: Request):
    return widgets.summary(request.headers.get("authorization"))


@router.post("/v1/widget/checkoffs")
def check(request: Request, payload: Checkoff):
    return widgets.check_item(
        request.headers.get("authorization"), payload.model_dump(mode="json")
    )


@router.post("/v1/widget/disconnect", status_code=204)
def disconnect(request: Request):
    widgets.revoke(request.headers.get("authorization"))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
