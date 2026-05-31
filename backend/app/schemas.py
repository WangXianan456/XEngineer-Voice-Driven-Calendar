from typing import Any, Literal

from pydantic import BaseModel, Field


class CalendarContext(BaseModel):
    recentEvents: list[dict[str, Any]] = Field(default_factory=list)
    selectedEvent: dict[str, Any] | None = None


class ParseCommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    locale: str = "zh-CN"
    timezone: str = "Asia/Shanghai"
    now: str
    calendarContext: CalendarContext = Field(default_factory=CalendarContext)


class ParsedAction(BaseModel):
    type: str
    title: str | None = None
    start: str | None = None
    end: str | None = None
    reminderMinutes: int | None = None
    location: str | None = None
    notes: str | None = None
    targetTitle: str | None = None
    targetDate: str | None = None
    eventId: str | None = None


class ParseCommandResponse(BaseModel):
    intent: Literal[
        "create_event",
        "list_events",
        "update_event",
        "delete_event",
        "find_free_time",
        "set_reminder",
        "confirm",
        "cancel",
        "unknown",
    ]
    confidence: float = Field(ge=0, le=1)
    action: ParsedAction | None = None
    missingFields: list[str] = Field(default_factory=list)
    reply: str


class AsrResponse(BaseModel):
    text: str
    language: str | None = None
    duration: float | None = None
