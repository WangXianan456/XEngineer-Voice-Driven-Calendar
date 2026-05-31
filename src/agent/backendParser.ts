import type { CalendarEvent, CalendarEventType, CreateCalendarEventInput } from "../calendar/eventTypes";

export type BackendParsedCommand = {
  intent:
    | "create_event"
    | "list_events"
    | "update_event"
    | "delete_event"
    | "find_free_time"
    | "set_reminder"
    | "confirm"
    | "cancel"
    | "unknown";
  confidence: number;
  action?: {
    type: string;
    title?: string | null;
    start?: string | null;
    end?: string | null;
    reminderMinutes?: number | null;
    location?: string | null;
    notes?: string | null;
    targetTitle?: string | null;
    targetDate?: string | null;
    eventId?: string | null;
  } | null;
  missingFields: string[];
  reply: string;
};

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const apiBaseUrl = env?.VITE_API_BASE_URL?.trim();

export function isBackendParseEnabled() {
  return Boolean(apiBaseUrl);
}

export async function parseWithBackend(text: string, events: CalendarEvent[]) {
  if (!apiBaseUrl) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/api/parse-command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      now: new Date().toISOString(),
      calendarContext: {
        recentEvents: events.slice(0, 20),
        selectedEvent: null
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Backend parser failed: ${response.status}`);
  }

  return (await response.json()) as BackendParsedCommand;
}

export function toCreateEventInput(parsed: BackendParsedCommand, sourceText: string): CreateCalendarEventInput | null {
  const action = parsed.action;

  if (!action?.start) {
    return null;
  }

  const start = new Date(action.start);
  const end = action.end ? new Date(action.end) : new Date(start.getTime() + 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const title = action.title?.trim() || "新日程";

  return {
    title,
    start,
    end,
    reminderMinutes: typeof action.reminderMinutes === "number" ? action.reminderMinutes : 10,
    location: action.location?.trim() || undefined,
    notes: action.notes?.trim() || undefined,
    sourceText,
    type: inferEventType(title)
  };
}

export function findBackendTargetEvents(parsed: BackendParsedCommand, events: CalendarEvent[]) {
  const action = parsed.action;

  if (!action) {
    return [];
  }

  if (action.eventId) {
    return events.filter((event) => event.id === action.eventId);
  }

  const keyword = (action.targetTitle || action.title || "").trim();
  const scopedEvents = action.targetDate ? filterByTargetDate(events, action.targetDate) : events;

  if (!keyword) {
    return scopedEvents;
  }

  return scopedEvents.filter((event) => event.title.includes(keyword) || keyword.includes(event.title));
}

export function parseBackendDateRange(parsed: BackendParsedCommand) {
  const action = parsed.action;

  if (!action?.start) {
    return null;
  }

  const start = new Date(action.start);
  const end = action.end ? new Date(action.end) : new Date(start.getTime() + 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

function filterByTargetDate(events: CalendarEvent[], targetDate: string) {
  const date = new Date(targetDate);

  if (Number.isNaN(date.getTime())) {
    return events;
  }

  return events.filter((event) => {
    const eventDate = new Date(event.start);
    return (
      eventDate.getFullYear() === date.getFullYear() &&
      eventDate.getMonth() === date.getMonth() &&
      eventDate.getDate() === date.getDate()
    );
  });
}

function inferEventType(title: string): CalendarEventType {
  if (/复盘|专注|写作|学习/.test(title)) {
    return "focus";
  }

  if (/吃饭|生日|运动|健身|家庭/.test(title)) {
    return "personal";
  }

  return "meeting";
}
