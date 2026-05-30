import { addDays, set } from "date-fns";
import type { CalendarEvent, CreateCalendarEventInput } from "./eventTypes";

export const CALENDAR_STORAGE_KEY = "xengineer.voice-calendar.events";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createCalendarEvent(input: CreateCalendarEventInput): CalendarEvent {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: input.title,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    reminderMinutes: input.reminderMinutes,
    location: input.location,
    notes: input.notes,
    sourceText: input.sourceText,
    type: input.type ?? "meeting",
    createdAt: now,
    updatedAt: now
  };
}

export function createDemoEvents(baseDate = new Date()): CalendarEvent[] {
  const tomorrow = addDays(baseDate, 1);
  const nextMonday = addDays(baseDate, 2);

  return [
    createCalendarEvent({
      title: "产品评审会",
      start: set(tomorrow, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(tomorrow, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 }),
      reminderMinutes: 10,
      sourceText: "明天下午三点开产品评审会，提前十分钟提醒我",
      type: "meeting"
    }),
    createCalendarEvent({
      title: "项目复盘",
      start: set(baseDate, { hours: 20, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(baseDate, { hours: 20, minutes: 30, seconds: 0, milliseconds: 0 }),
      reminderMinutes: 0,
      sourceText: "今天晚上八点提醒我复盘项目",
      type: "focus"
    }),
    createCalendarEvent({
      title: "设计团队同步",
      start: set(nextMonday, { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(nextMonday, { hours: 11, minutes: 0, seconds: 0, milliseconds: 0 }),
      reminderMinutes: 30,
      sourceText: "下周一上午十点和设计团队开会",
      type: "meeting"
    })
  ];
}

export function loadCalendarEvents(): CalendarEvent[] {
  const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);

  if (!raw) {
    return createDemoEvents();
  }

  try {
    const parsed = JSON.parse(raw) as CalendarEvent[];
    return Array.isArray(parsed) ? parsed : createDemoEvents();
  } catch {
    return createDemoEvents();
  }
}

export function saveCalendarEvents(events: CalendarEvent[]) {
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(events));
}
