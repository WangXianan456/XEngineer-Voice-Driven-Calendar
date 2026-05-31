import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "./eventStore";
import { exportCalendarEventsToIcs, parseIcsCalendar, parseIcsCalendarWithReport } from "./ics";

describe("ICS calendar exchange", () => {
  it("exports local events to a valid ICS calendar", () => {
    const event = createCalendarEvent({
      title: "产品评审会",
      start: new Date("2026-06-01T15:00:00+08:00"),
      end: new Date("2026-06-01T16:00:00+08:00"),
      reminderMinutes: 10,
      location: "A 楼",
      sourceText: "明天下午三点开产品评审会"
    });

    const ics = exportCalendarEventsToIcs([event]);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:产品评审会");
    expect(ics).toContain("LOCATION:A 楼");
    expect(ics).toContain("TRIGGER:-PT10M");
  });

  it("imports ICS events as calendar event inputs", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-1@example.com",
      "DTSTART:20260601T070000Z",
      "DTEND:20260601T080000Z",
      "SUMMARY:产品评审会",
      "LOCATION:A 楼",
      "DESCRIPTION:从外部日历导入",
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const events = parseIcsCalendar(ics);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("产品评审会");
    expect(events[0].start.toISOString()).toBe("2026-06-01T07:00:00.000Z");
    expect(events[0].reminderMinutes).toBe(15);
    expect(events[0].externalSource).toBe("ics");
    expect(events[0].externalEventId).toBe("event-1@example.com");
  });

  it("round trips exported events back into importable inputs", () => {
    const event = createCalendarEvent({
      title: "设计,评审;会",
      start: new Date("2026-06-01T10:00:00+08:00"),
      end: new Date("2026-06-01T11:00:00+08:00"),
      reminderMinutes: 0,
      notes: "第一行\n第二行",
      sourceText: "导出测试"
    });

    const imported = parseIcsCalendar(exportCalendarEventsToIcs([event]));

    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe("设计,评审;会");
    expect(imported[0].notes).toBe("第一行\n第二行");
    expect(imported[0].start.toISOString()).toBe(event.start);
  });

  it("reports invalid events and malformed calendar envelopes", () => {
    const report = parseIcsCalendarWithReport(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:bad-event",
        "SUMMARY:缺少时间",
        "END:VEVENT",
        "END:VCALENDAR"
      ].join("\r\n")
    );

    expect(report.hasCalendarEnvelope).toBe(true);
    expect(report.totalVevents).toBe(1);
    expect(report.invalidVevents).toBe(1);
    expect(report.events).toHaveLength(0);

    const malformed = parseIcsCalendarWithReport("BEGIN:VEVENT\r\nSUMMARY:孤立事件\r\nEND:VEVENT");
    expect(malformed.hasCalendarEnvelope).toBe(false);
  });
});
