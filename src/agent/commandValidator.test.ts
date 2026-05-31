import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "../calendar/eventStore";
import type { CalendarEvent } from "../calendar/eventTypes";
import { validateParsedCommand } from "./commandValidator";

const currentEvents: CalendarEvent[] = [
  createCalendarEvent({
    title: "产品评审会",
    start: new Date("2026-05-31T15:00:00+08:00"),
    end: new Date("2026-05-31T16:00:00+08:00"),
    reminderMinutes: 10,
    sourceText: "明天下午三点开产品评审会"
  })
];

describe("validateParsedCommand", () => {
  it("accepts a valid create command", () => {
    const result = validateParsedCommand(
      {
        intent: "create_event",
        event: {
          title: "技术评审",
          start: new Date("2026-06-01T10:00:00+08:00"),
          end: new Date("2026-06-01T11:00:00+08:00"),
          reminderMinutes: 10,
          sourceText: "下周一上午十点开技术评审",
          type: "meeting"
        },
        reply: "请确认。"
      },
      currentEvents
    );

    expect(result.ok).toBe(true);
  });

  it("rejects create commands with invalid time ranges", () => {
    const result = validateParsedCommand(
      {
        intent: "create_event",
        event: {
          title: "错误日程",
          start: new Date("2026-06-01T11:00:00+08:00"),
          end: new Date("2026-06-01T10:00:00+08:00"),
          reminderMinutes: 10,
          sourceText: "错误时间",
          type: "meeting"
        },
        reply: "请确认。"
      },
      currentEvents
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_event_time");
    }
  });

  it("rejects create commands with invalid reminders", () => {
    const result = validateParsedCommand(
      {
        intent: "create_event",
        event: {
          title: "技术评审",
          start: new Date("2026-06-01T10:00:00+08:00"),
          end: new Date("2026-06-01T11:00:00+08:00"),
          reminderMinutes: -1,
          sourceText: "下周一上午十点开技术评审",
          type: "meeting"
        },
        reply: "请确认。"
      },
      currentEvents
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_reminder");
    }
  });

  it("rejects delete candidates that are not in the current calendar", () => {
    const externalEvent = createCalendarEvent({
      title: "外部事件",
      start: new Date("2026-06-01T10:00:00+08:00"),
      end: new Date("2026-06-01T11:00:00+08:00"),
      reminderMinutes: 10,
      sourceText: "外部事件"
    });

    const result = validateParsedCommand(
      {
        intent: "delete_event",
        candidates: [externalEvent],
        reply: "删除前需要确认。"
      },
      currentEvents
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_candidate");
    }
  });

  it("rejects duplicate high-risk candidates", () => {
    const result = validateParsedCommand(
      {
        intent: "delete_event",
        candidates: [currentEvents[0], currentEvents[0]],
        reply: "请选择候选。"
      },
      currentEvents
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_candidate");
    }
  });

  it("rejects update commands that have a target but no new time", () => {
    const result = validateParsedCommand(
      {
        intent: "update_event",
        candidates: [currentEvents[0]],
        reply: "我找到了日程，但还不能确定新的时间。"
      },
      currentEvents
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_update_time");
    }
  });

  it("allows empty update candidates so the caller can ask for clarification", () => {
    const result = validateParsedCommand(
      {
        intent: "update_event",
        candidates: [],
        start: new Date("2026-06-01T10:00:00+08:00"),
        end: new Date("2026-06-01T11:00:00+08:00"),
        reply: "没有找到要修改的日程。"
      },
      currentEvents
    );

    expect(result.ok).toBe(true);
  });
});
