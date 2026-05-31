from __future__ import annotations

from datetime import datetime

from .schemas import ParseCommandResponse


WRITE_INTENTS = {"create_event", "update_event", "delete_event", "set_reminder"}
ACTION_INTENTS = {
    "create_event",
    "list_events",
    "update_event",
    "delete_event",
    "find_free_time",
    "set_reminder",
}
MAX_REMINDER_MINUTES = 14 * 24 * 60
MAX_EVENT_DURATION_SECONDS = 24 * 60 * 60


def validate_parse_command_response(response: ParseCommandResponse) -> ParseCommandResponse:
    """Apply deterministic safety checks after Pydantic shape validation."""

    if response.intent in {"unknown", "confirm", "cancel"}:
        return normalize_safe_response(response)

    if response.intent in ACTION_INTENTS and response.action is None:
        return unknown_response("我还不能确定要执行的日历操作，请补充更多信息。", ["action"])

    if response.action and response.action.type != response.intent:
        return unknown_response("解析结果的操作类型不一致，请换一种说法。", ["action.type"])

    if response.confidence < 0.3:
        return unknown_response("我对这条指令的理解不够确定，请补充日期、时间或标题。", ["confidence"])

    if response.intent == "create_event":
        return validate_create_event(response)

    if response.intent == "update_event":
        return validate_update_event(response)

    if response.intent == "delete_event":
        return validate_delete_event(response)

    if response.intent == "set_reminder":
        return validate_set_reminder(response)

    if response.intent in {"list_events", "find_free_time"}:
        return normalize_safe_response(response)

    return unknown_response("我还没有理解这条指令，请换一种说法。", ["intent"])


def validate_create_event(response: ParseCommandResponse) -> ParseCommandResponse:
    action = response.action
    assert action is not None

    if not clean_text(action.title):
        return unknown_response("我还不能确定日程标题，请补充要安排的事情。", ["title"])

    if not action.start:
        return unknown_response("我还不能确定开始时间，请补充日期和时间。", ["start"])

    time_check = validate_time_range(action.start, action.end)
    if time_check:
        return unknown_response(time_check, ["start", "end"])

    reminder_check = validate_reminder(action.reminderMinutes)
    if reminder_check:
        return unknown_response(reminder_check, ["reminderMinutes"])

    return normalize_safe_response(response)


def validate_update_event(response: ParseCommandResponse) -> ParseCommandResponse:
    action = response.action
    assert action is not None

    if not has_target(action.targetTitle, action.targetDate, action.eventId, action.title):
        return unknown_response("我还不能确定要修改哪一个日程，请补充标题或日期。", ["targetTitle"])

    has_time_update = bool(action.start)
    has_reminder_update = action.reminderMinutes is not None
    if not has_time_update and not has_reminder_update:
        return unknown_response("我找到了修改意图，但还缺少新的时间或提醒设置。", ["start", "reminderMinutes"])

    if has_time_update:
        time_check = validate_time_range(action.start, action.end)
        if time_check:
            return unknown_response(time_check, ["start", "end"])

    reminder_check = validate_reminder(action.reminderMinutes)
    if reminder_check:
        return unknown_response(reminder_check, ["reminderMinutes"])

    return normalize_safe_response(response)


def validate_delete_event(response: ParseCommandResponse) -> ParseCommandResponse:
    action = response.action
    assert action is not None

    if not has_target(action.targetTitle, action.targetDate, action.eventId, action.title):
        return unknown_response("删除日程前需要明确目标，请补充标题或日期。", ["targetTitle"])

    return normalize_safe_response(response)


def validate_set_reminder(response: ParseCommandResponse) -> ParseCommandResponse:
    action = response.action
    assert action is not None

    if not has_target(action.targetTitle, action.targetDate, action.eventId, action.title):
        return unknown_response("我还不能确定要给哪一个日程设置提醒，请补充标题或日期。", ["targetTitle"])

    reminder_check = validate_reminder(action.reminderMinutes)
    if reminder_check:
        return unknown_response(reminder_check, ["reminderMinutes"])

    return normalize_safe_response(response)


def normalize_safe_response(response: ParseCommandResponse) -> ParseCommandResponse:
    if response.intent in WRITE_INTENTS:
        reply = response.reply or "我已解析出日历操作，请确认后再执行。"
        if not has_confirmation_language(reply):
            response.reply = f"{reply} 请确认后再执行。"

    response.missingFields = list(dict.fromkeys(response.missingFields))
    return response


def unknown_response(reply: str, missing_fields: list[str]) -> ParseCommandResponse:
    return ParseCommandResponse(
        intent="unknown",
        confidence=0,
        action=None,
        missingFields=missing_fields,
        reply=reply,
    )


def validate_time_range(start_raw: str | None, end_raw: str | None) -> str | None:
    start = parse_datetime(start_raw)
    if start is None:
        return "时间解析结果无效，请补充明确日期和时间。"

    if not end_raw:
        return None

    end = parse_datetime(end_raw)
    if end is None:
        return "结束时间解析结果无效，请补充明确结束时间。"

    duration = (end - start).total_seconds()
    if duration <= 0 or duration > MAX_EVENT_DURATION_SECONDS:
        return "结束时间必须晚于开始时间，且单个日程不能超过 24 小时。"

    return None


def validate_reminder(reminder_minutes: int | None) -> str | None:
    if reminder_minutes is None:
        return None

    if reminder_minutes < 0 or reminder_minutes > MAX_REMINDER_MINUTES:
        return "提醒时间不合法，请使用 0 到 14 天以内的提醒时间。"

    return None


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def has_target(*values: str | None) -> bool:
    return any(clean_text(value) for value in values)


def clean_text(value: str | None) -> str:
    return value.strip() if value else ""


def has_confirmation_language(reply: str) -> bool:
    return any(token in reply for token in ("确认", "是否", "可以", "请你"))
