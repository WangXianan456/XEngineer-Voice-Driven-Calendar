import type { CalendarEvent, CreateCalendarEventInput } from "../calendar/eventTypes";
import type { ParsedCommand } from "./commandParser";

export type ValidationResult =
  | {
      ok: true;
      command: ParsedCommand;
    }
  | {
      ok: false;
      command: ParsedCommand;
      message: string;
      reason: ValidationFailureReason;
    };

export type ValidationFailureReason =
  | "invalid_event_time"
  | "invalid_reminder"
  | "invalid_title"
  | "invalid_candidate"
  | "missing_update_time"
  | "invalid_slot";

const maxReminderMinutes = 14 * 24 * 60;
const maxEventDurationMinutes = 24 * 60;

export function validateParsedCommand(command: ParsedCommand, events: CalendarEvent[]): ValidationResult {
  if (command.intent === "create_event") {
    return validateCreateCommand(command);
  }

  if (command.intent === "delete_event") {
    return validateDeleteCommand(command, events);
  }

  if (command.intent === "update_event") {
    return validateUpdateCommand(command, events);
  }

  if (command.intent === "list_events") {
    return validateListCommand(command, events);
  }

  if (command.intent === "find_free_time") {
    return validateFreeTimeCommand(command);
  }

  return { ok: true, command };
}

export function createValidationUnknown(message: string): ParsedCommand {
  return {
    intent: "unknown",
    reply: message
  };
}

function validateCreateCommand(command: Extract<ParsedCommand, { intent: "create_event" }>): ValidationResult {
  const eventValidation = validateCreateEventInput(command.event);

  if (!eventValidation.ok) {
    return {
      ok: false,
      command,
      reason: eventValidation.reason,
      message: eventValidation.message
    };
  }

  return { ok: true, command };
}

function validateDeleteCommand(
  command: Extract<ParsedCommand, { intent: "delete_event" }>,
  events: CalendarEvent[]
): ValidationResult {
  const candidateValidation = validateCandidates(command.candidates, events);

  if (!candidateValidation.ok) {
    return {
      ok: false,
      command,
      reason: "invalid_candidate",
      message: candidateValidation.message
    };
  }

  return { ok: true, command };
}

function validateUpdateCommand(
  command: Extract<ParsedCommand, { intent: "update_event" }>,
  events: CalendarEvent[]
): ValidationResult {
  const candidateValidation = validateCandidates(command.candidates, events);

  if (!candidateValidation.ok) {
    return {
      ok: false,
      command,
      reason: "invalid_candidate",
      message: candidateValidation.message
    };
  }

  if (command.candidates.length > 0 && (!command.start || !command.end)) {
    return {
      ok: false,
      command,
      reason: "missing_update_time",
      message: "我找到了要修改的日程，但还缺少新的时间，请补充后再执行。"
    };
  }

  if (command.start && command.end) {
    const timeValidation = validateTimeRange(command.start, command.end);

    if (!timeValidation.ok) {
      return {
        ok: false,
        command,
        reason: "invalid_event_time",
        message: timeValidation.message
      };
    }
  }

  return { ok: true, command };
}

function validateListCommand(
  command: Extract<ParsedCommand, { intent: "list_events" }>,
  events: CalendarEvent[]
): ValidationResult {
  const candidateValidation = validateCandidates(command.events, events);

  if (!candidateValidation.ok) {
    return {
      ok: false,
      command,
      reason: "invalid_candidate",
      message: "查询结果包含当前日历之外的事件，已阻止展示。"
    };
  }

  return { ok: true, command };
}

function validateFreeTimeCommand(command: Extract<ParsedCommand, { intent: "find_free_time" }>): ValidationResult {
  const invalidSlot = command.slots.find((slot) => !validateTimeRange(slot.start, slot.end).ok);

  if (invalidSlot) {
    return {
      ok: false,
      command,
      reason: "invalid_slot",
      message: "空闲时间结果包含非法时间段，请换一种说法重新查询。"
    };
  }

  return { ok: true, command };
}

function validateCreateEventInput(input: CreateCalendarEventInput) {
  const title = input.title.trim();

  if (!title || title.length > 80) {
    return {
      ok: false as const,
      reason: "invalid_title" as const,
      message: "日程标题为空或过长，请补充一个明确标题。"
    };
  }

  const timeValidation = validateTimeRange(input.start, input.end);

  if (!timeValidation.ok) {
    return timeValidation;
  }

  if (!Number.isInteger(input.reminderMinutes) || input.reminderMinutes < 0 || input.reminderMinutes > maxReminderMinutes) {
    return {
      ok: false as const,
      reason: "invalid_reminder" as const,
      message: "提醒时间不合法，请使用 0 到 14 天以内的提醒时间。"
    };
  }

  return { ok: true as const };
}

function validateTimeRange(start: Date, end: Date) {
  if (!isValidDate(start) || !isValidDate(end)) {
    return {
      ok: false as const,
      reason: "invalid_event_time" as const,
      message: "时间解析结果无效，请补充明确日期和时间。"
    };
  }

  const durationMinutes = (end.getTime() - start.getTime()) / (60 * 1000);

  if (durationMinutes <= 0 || durationMinutes > maxEventDurationMinutes) {
    return {
      ok: false as const,
      reason: "invalid_event_time" as const,
      message: "日程结束时间必须晚于开始时间，且单个日程不能超过 24 小时。"
    };
  }

  return { ok: true as const };
}

function validateCandidates(candidates: CalendarEvent[], events: CalendarEvent[]) {
  const eventIds = new Set(events.map((event) => event.id));
  const seenCandidateIds = new Set<string>();

  for (const candidate of candidates) {
    if (!eventIds.has(candidate.id)) {
      return {
        ok: false as const,
        message: "候选日程不在当前日历中，已阻止这次高风险操作。"
      };
    }

    if (seenCandidateIds.has(candidate.id)) {
      return {
        ok: false as const,
        message: "候选日程存在重复项，请重新选择目标日程。"
      };
    }

    seenCandidateIds.add(candidate.id);
  }

  return { ok: true as const };
}

function isValidDate(date: Date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}
