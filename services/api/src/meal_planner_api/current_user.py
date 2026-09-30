"""Resolved local identity used by protected household services."""

from dataclasses import dataclass


@dataclass(frozen=True)
class CurrentUser:
    id: str
    normalized_email: str
    display_name: str
