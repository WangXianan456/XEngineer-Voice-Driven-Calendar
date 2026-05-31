import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "../calendar/eventStore";
import type { CalendarEvent } from "../calendar/eventTypes";
import { parseCalendarCommand, type ParsedCommand } from "./commandParser";

const baseDate = new Date("2026-05-30T10:00:00+08:00");

const fixtureEvents: CalendarEvent[] = [
  createCalendarEvent({
    title: "产品评审会",
    start: new Date("2026-05-31T15:00:00+08:00"),
    end: new Date("2026-05-31T16:00:00+08:00"),
    reminderMinutes: 10,
    sourceText: "明天下午三点开产品评审会"
  }),
  createCalendarEvent({
    title: "设计团队同步",
    start: new Date("2026-06-01T10:00:00+08:00"),
    end: new Date("2026-06-01T11:00:00+08:00"),
    reminderMinutes: 30,
    sourceText: "下周一上午十点和设计团队开会"
  }),
  createCalendarEvent({
    title: "周三评审",
    start: new Date("2026-06-03T10:00:00+08:00"),
    end: new Date("2026-06-03T11:00:00+08:00"),
    reminderMinutes: 10,
    sourceText: "下周三上午十点开周三评审"
  }),
  createCalendarEvent({
    title: "周末活动",
    start: new Date("2026-06-07T10:00:00+08:00"),
    end: new Date("2026-06-07T11:00:00+08:00"),
    reminderMinutes: 10,
    sourceText: "下周日上午十点开周末活动"
  })
];

type EvaluationCase = {
  name: string;
  text: string;
  assert: (result: ParsedCommand) => void;
};

const evaluationCases: EvaluationCase[] = [
  {
    name: "create event with reminder",
    text: "明天下午三点开产品评审会，提前十分钟提醒我",
    assert: (result) => {
      expect(result.intent).toBe("create_event");
      if (result.intent !== "create_event") {
        throw new Error("expected create_event");
      }
      expect(result.event.title).toBe("产品评审会");
      expect(result.event.start.getHours()).toBe(15);
      expect(result.event.reminderMinutes).toBe(10);
    }
  },
  {
    name: "create event with quarter and end time",
    text: "后天下午三点一刻到四点半开技术评审会",
    assert: (result) => {
      expect(result.intent).toBe("create_event");
      if (result.intent !== "create_event") {
        throw new Error("expected create_event");
      }
      expect(result.event.start.getMinutes()).toBe(15);
      expect(result.event.end.getHours()).toBe(16);
      expect(result.event.end.getMinutes()).toBe(30);
    }
  },
  {
    name: "list events by tomorrow",
    text: "我明天有什么安排",
    assert: (result) => {
      expect(result.intent).toBe("list_events");
      if (result.intent !== "list_events") {
        throw new Error("expected list_events");
      }
      expect(result.events.map((event) => event.title)).toEqual(["产品评审会"]);
    }
  },
  {
    name: "delete by date and title",
    text: "删除明天的产品评审会",
    assert: (result) => {
      expect(result.intent).toBe("delete_event");
      if (result.intent !== "delete_event") {
        throw new Error("expected delete_event");
      }
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].title).toBe("产品评审会");
    }
  },
  {
    name: "update by date and title",
    text: "把产品评审会改到明天下午四点",
    assert: (result) => {
      expect(result.intent).toBe("update_event");
      if (result.intent !== "update_event") {
        throw new Error("expected update_event");
      }
      expect(result.candidates).toHaveLength(1);
      expect(result.start?.getHours()).toBe(16);
    }
  },
  {
    name: "find free time around busy events",
    text: "明天下午我什么时候有空",
    assert: (result) => {
      expect(result.intent).toBe("find_free_time");
      if (result.intent !== "find_free_time") {
        throw new Error("expected find_free_time");
      }
      expect(result.slots.map((slot) => [slot.start.getHours(), slot.end.getHours()])).toEqual([
        [13, 15],
        [16, 18]
      ]);
    }
  },
  {
    name: "list next week range",
    text: "下周一到周三有什么安排",
    assert: (result) => {
      expect(result.intent).toBe("list_events");
      if (result.intent !== "list_events") {
        throw new Error("expected list_events");
      }
      expect(result.events.map((event) => event.title)).toEqual(["设计团队同步", "周三评审"]);
    }
  },
  {
    name: "list next workdays",
    text: "下周工作日有什么安排",
    assert: (result) => {
      expect(result.intent).toBe("list_events");
      if (result.intent !== "list_events") {
        throw new Error("expected list_events");
      }
      expect(result.events.map((event) => event.title)).toEqual(["设计团队同步", "周三评审"]);
    }
  },
  {
    name: "return unknown when time is missing",
    text: "帮我安排一个复盘",
    assert: (result) => {
      expect(result.intent).toBe("unknown");
    }
  }
];

describe("command parser evaluation set", () => {
  it.each(evaluationCases)("$name", ({ text, assert }) => {
    assert(parseCalendarCommand(text, fixtureEvents, baseDate));
  });
});
