export type CalendarEventType = "meeting" | "focus" | "personal";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  reminderMinutes: number;
  location?: string;
  notes?: string;
  sourceText: string;
  type: CalendarEventType;
  createdAt: string;
  updatedAt: string;
};

export type CreateCalendarEventInput = {
  title: string;
  start: Date;
  end: Date;
  reminderMinutes: number;
  location?: string;
  notes?: string;
  sourceText: string;
  type?: CalendarEventType;
};
