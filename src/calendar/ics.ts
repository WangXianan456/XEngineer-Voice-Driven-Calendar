import type { CalendarEvent, CreateCalendarEventInput } from "./eventTypes";

export type IcsParseResult = {
  events: CreateCalendarEventInput[];
  totalVevents: number;
  invalidVevents: number;
  hasCalendarEnvelope: boolean;
};

export function exportCalendarEventsToIcs(events: CalendarEvent[], calendarName = "XEngineer Voice Calendar") {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//XEngineer//Voice Driven Calendar//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`
  ];

  for (const event of events) {
    lines.push(...createVeventLines(event));
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
}

export function parseIcsCalendar(content: string): CreateCalendarEventInput[] {
  return parseIcsCalendarWithReport(content).events;
}

export function parseIcsCalendarWithReport(content: string): IcsParseResult {
  const lines = unfoldIcsLines(content);
  const events: CreateCalendarEventInput[] = [];
  let totalVevents = 0;
  let invalidVevents = 0;
  let current: string[] | null = null;
  const hasCalendarEnvelope = lines.includes("BEGIN:VCALENDAR") && lines.includes("END:VCALENDAR");

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      totalVevents += 1;
      current = [];
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) {
        const event = parseVevent(current);
        if (event) {
          events.push(event);
        } else {
          invalidVevents += 1;
        }
      }
      current = null;
      continue;
    }

    if (current) {
      current.push(line);
    }
  }

  return {
    events,
    totalVevents,
    invalidVevents,
    hasCalendarEnvelope
  };
}

function createVeventLines(event: CalendarEvent) {
  const uid = event.externalEventId || event.id;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatIcsUtcDate(new Date(event.updatedAt || event.createdAt))}`,
    `DTSTART:${formatIcsUtcDate(new Date(event.start))}`,
    `DTEND:${formatIcsUtcDate(new Date(event.end))}`,
    `SUMMARY:${escapeIcsText(event.title)}`
  ];

  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  const description = event.notes || event.sourceText;
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }

  if (event.reminderMinutes > 0) {
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${event.reminderMinutes}M`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(event.title)}`,
      "END:VALARM"
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

function parseVevent(lines: string[]): CreateCalendarEventInput | null {
  const fields = new Map<string, string>();
  let reminderMinutes = 10;

  for (const line of lines) {
    const parsed = parseContentLine(line);
    if (!parsed) {
      continue;
    }

    if (parsed.name === "TRIGGER") {
      reminderMinutes = parseTriggerMinutes(parsed.value) ?? reminderMinutes;
      continue;
    }

    if (!fields.has(parsed.name)) {
      fields.set(parsed.name, parsed.value);
    }
  }

  const title = unescapeIcsText(fields.get("SUMMARY") || "导入日程").trim();
  const start = parseIcsDate(fields.get("DTSTART"));
  const end = parseIcsDate(fields.get("DTEND"));

  if (!start || !end || end <= start) {
    return null;
  }

  const uid = fields.get("UID");

  return {
    title: title || "导入日程",
    start,
    end,
    reminderMinutes,
    location: unescapeIcsText(fields.get("LOCATION") || "") || undefined,
    notes: unescapeIcsText(fields.get("DESCRIPTION") || "") || undefined,
    sourceText: "ICS 导入",
    externalSource: "ics",
    externalEventId: uid ? unescapeIcsText(uid) : createIcsFallbackId(title, start, end),
    type: "meeting"
  };
}

function unfoldIcsLines(content: string) {
  const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    if (!rawLine) {
      continue;
    }

    if (/^[ \t]/.test(rawLine) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
      continue;
    }

    lines.push(rawLine.trimEnd());
  }

  return lines;
}

function parseContentLine(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const rawName = line.slice(0, separatorIndex).split(";")[0].toUpperCase();
  return {
    name: rawName,
    value: line.slice(separatorIndex + 1)
  };
}

function parseIcsDate(value?: string) {
  if (!value) {
    return null;
  }

  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!dateTime) {
    return null;
  }

  const [, year, month, day, hour, minute, second, utc] = dateTime;
  if (utc) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }

  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function parseTriggerMinutes(value: string) {
  const match = value.match(/^-PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) {
    return null;
  }

  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}

function formatIcsUtcDate(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeIcsText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function unescapeIcsText(text: string) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function foldIcsLine(line: string) {
  if (line.length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let cursor = line;

  while (cursor.length > 75) {
    chunks.push(cursor.slice(0, 75));
    cursor = ` ${cursor.slice(75)}`;
  }

  chunks.push(cursor);
  return chunks.join("\r\n");
}

function createIcsFallbackId(title: string, start: Date, end: Date) {
  return `${title}:${start.toISOString()}:${end.toISOString()}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
