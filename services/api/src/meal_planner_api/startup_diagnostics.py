"""Opt-in, development-only startup timing diagnostics."""

import logging
import os
import re
import sys
import time
from uuid import uuid4

from fastapi import Request

logger = logging.getLogger("meal_planner_api.startup_timing")
_REQUEST_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def enabled() -> bool:
    return (
        os.environ.get("APP_ENV", "").lower() == "development"
        and os.environ.get("STARTUP_TIMING_DIAGNOSTICS", "").lower() == "true"
    )


def elapsed_ms(started_at: float) -> float:
    return (time.perf_counter() - started_at) * 1000


def log_timing(request_id: str | None, stage: str, duration_ms: float, response_status: int | None = None) -> None:
    if not enabled() or request_id is None:
        return
    if not logger.hasHandlers():
        logger.addHandler(logging.StreamHandler(sys.stderr))
    logger.setLevel(logging.INFO)
    fields = f"request_id={request_id} stage={stage} elapsed_ms={max(0.0, duration_ms):.1f}"
    if response_status is not None:
        fields += f" status={response_status}"
    logger.info("startup_timing %s", fields)


def request_id_for(request: Request) -> str | None:
    return getattr(request.state, "startup_request_id", None)


def new_request_id(candidate: str | None) -> str:
    if candidate is not None and _REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return uuid4().hex
