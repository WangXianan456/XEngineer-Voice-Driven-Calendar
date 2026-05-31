import { describe, expect, it } from "vitest";
import { addDays, set } from "date-fns";
import { createCalendarEvent } from "../calendar/eventStore";
import { parseCalendarCommand } from "./commandParser";

const baseDate = new Date("2026-05-30T10:00:00+08:00");

describe("parseCalendarCommand", () => {
  it("parses a Chinese create event command", () => {
    const result = parseCalendarCommand("明天下午三点开产品评审会，提前十分钟提醒我", [], baseDate);

    expect(result.intent).toBe("create_event");

    if (result.intent !== "create_event") {
      throw new Error("expected create_event");
    }

    expect(result.event.title).toBe("产品评审会");
    expect(result.event.start.getHours()).toBe(15);
    expect(result.event.reminderMinutes).toBe(10);
  });

  it("lists events in the requested date range", () => {
    const tomorrow = addDays(baseDate, 1);
    const events = [
      createCalendarEvent({
        title: "产品评审会",
        start: set(tomorrow, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 }),
        end: set(tomorrow, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 }),
        reminderMinutes: 10,
        sourceText: "明天下午三点开产品评审会"
      })
    ];

    const result = parseCalendarCommand("我明天有什么安排", events, baseDate);

    expect(result.intent).toBe("list_events");

    if (result.intent !== "list_events") {
      throw new Error("expected list_events");
    }

    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("产品评审会");
  });

  it("finds a deletion candidate without executing the delete", () => {
    const tomorrow = addDays(baseDate, 1);
    const events = [
      createCalendarEvent({
        title: "产品评审会",
        start: set(tomorrow, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 }),
        end: set(tomorrow, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 }),
        reminderMinutes: 10,
        sourceText: "明天下午三点开产品评审会"
      })
    ];

    const result = parseCalendarCommand("删除明天的产品评审会", events, baseDate);

    expect(result.intent).toBe("delete_event");

    if (result.intent !== "delete_event") {
      throw new Error("expected delete_event");
    }

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe("产品评审会");
  });

  it("finds free time slots around existing events", () => {
    const tomorrow = addDays(baseDate, 1);
    const events = [
      createCalendarEvent({
        title: "产品评审会",
        start: set(tomorrow, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 }),
        end: set(tomorrow, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 }),
        reminderMinutes: 10,
        sourceText: "明天下午三点开产品评审会"
      })
    ];

    const result = parseCalendarCommand("明天下午我什么时候有空", events, baseDate);

    expect(result.intent).toBe("find_free_time");

    if (result.intent !== "find_free_time") {
      throw new Error("expected find_free_time");
    }

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].start.getHours()).toBe(13);
    expect(result.slots[0].end.getHours()).toBe(15);
    expect(result.slots[1].start.getHours()).toBe(16);
    expect(result.slots[1].end.getHours()).toBe(18);
  });

  it("parses quarter-hour and explicit end time", () => {
    const result = parseCalendarCommand("后天下午三点一刻到四点半开技术评审会", [], baseDate);

    expect(result.intent).toBe("create_event");

    if (result.intent !== "create_event") {
      throw new Error("expected create_event");
    }

    expect(result.event.title).toBe("技术评审会");
    expect(result.event.start.getHours()).toBe(15);
    expect(result.event.start.getMinutes()).toBe(15);
    expect(result.event.end.getHours()).toBe(16);
    expect(result.event.end.getMinutes()).toBe(30);
  });

  it("supports casual meeting creation phrasing", () => {
    const result = parseCalendarCommand("帮我约个会明早九点", [], baseDate);

    expect(result.intent).toBe("create_event");

    if (result.intent !== "create_event") {
      throw new Error("expected create_event");
    }

    expect(result.event.start.getHours()).toBe(9);
  });

  it("lists events across a next-week date range", () => {
    const monday = new Date("2026-06-01T10:00:00+08:00");
    const wednesday = new Date("2026-06-03T10:00:00+08:00");
    const friday = new Date("2026-06-05T10:00:00+08:00");
    const events = [
      createCalendarEvent({
        title: "周一例会",
        start: monday,
        end: set(monday, { hours: 11 }),
        reminderMinutes: 10,
        sourceText: "下周一上午十点开周一例会"
      }),
      createCalendarEvent({
        title: "周三评审",
        start: wednesday,
        end: set(wednesday, { hours: 11 }),
        reminderMinutes: 10,
        sourceText: "下周三上午十点开周三评审"
      }),
      createCalendarEvent({
        title: "周五复盘",
        start: friday,
        end: set(friday, { hours: 11 }),
        reminderMinutes: 10,
        sourceText: "下周五上午十点开周五复盘"
      })
    ];

    const result = parseCalendarCommand("下周一到周三有什么安排", events, baseDate);

    expect(result.intent).toBe("list_events");

    if (result.intent !== "list_events") {
      throw new Error("expected list_events");
    }

    expect(result.events.map((event) => event.title)).toEqual(["周一例会", "周三评审"]);
  });

  it("keeps the matched event date when updating time without a new date", () => {
    const tomorrow = addDays(baseDate, 1);
    const events = [
      createCalendarEvent({
        title: "产品评审会",
        start: set(tomorrow, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 }),
        end: set(tomorrow, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 }),
        reminderMinutes: 10,
        sourceText: "明天下午三点开产品评审会"
      })
    ];

    const result = parseCalendarCommand("把产品评审会改到下午四点", events, baseDate);

    expect(result.intent).toBe("update_event");

    if (result.intent !== "update_event") {
      throw new Error("expected update_event");
    }

    expect(result.start?.getDate()).toBe(tomorrow.getDate());
    expect(result.start?.getHours()).toBe(16);
  });

  it("lists next workday events", () => {
    const monday = new Date("2026-06-01T10:00:00+08:00");
    const sunday = new Date("2026-06-07T10:00:00+08:00");
    const events = [
      createCalendarEvent({
        title: "工作日例会",
        start: monday,
        end: set(monday, { hours: 11 }),
        reminderMinutes: 10,
        sourceText: "下周一上午十点开工作日例会"
      }),
      createCalendarEvent({
        title: "周末活动",
        start: sunday,
        end: set(sunday, { hours: 11 }),
        reminderMinutes: 10,
        sourceText: "下周日上午十点开周末活动"
      })
    ];

    const result = parseCalendarCommand("下周工作日有什么安排", events, baseDate);

    expect(result.intent).toBe("list_events");

    if (result.intent !== "list_events") {
      throw new Error("expected list_events");
    }

    expect(result.events.map((event) => event.title)).toEqual(["工作日例会"]);
  });
});
