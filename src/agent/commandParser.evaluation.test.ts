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

type ExpectedIntent = ParsedCommand["intent"];

type EvaluationCase = {
  name: string;
  text: string;
  expectedIntent: ExpectedIntent;
  expectedTitle?: string;
  expectedType?: "meeting" | "focus" | "personal";
  expectedStartDate?: string;
  expectedStartHour?: number;
  expectedStartMinute?: number;
  expectedEndHour?: number;
  expectedEndMinute?: number;
  expectedReminderMinutes?: number;
  expectedEventTitles?: string[];
  expectedCandidateTitles?: string[];
  expectedCandidateCount?: number;
  expectedSlotHours?: Array<[number, number]>;
};

const evaluationCases: EvaluationCase[] = [
  {
    name: "create event with reminder",
    text: "明天下午三点开产品评审会，提前十分钟提醒我",
    expectedIntent: "create_event",
    expectedTitle: "产品评审会",
    expectedStartDate: "2026-05-31",
    expectedStartHour: 15,
    expectedStartMinute: 0,
    expectedReminderMinutes: 10
  },
  {
    name: "create event with quarter and end time",
    text: "后天下午三点一刻到四点半开技术评审会",
    expectedIntent: "create_event",
    expectedTitle: "技术评审会",
    expectedStartDate: "2026-06-01",
    expectedStartHour: 15,
    expectedStartMinute: 15,
    expectedEndHour: 16,
    expectedEndMinute: 30
  },
  {
    name: "create reminder-style focus event",
    text: "今天晚上八点提醒我复盘项目",
    expectedIntent: "create_event",
    expectedTitle: "复盘项目",
    expectedType: "focus",
    expectedStartDate: "2026-05-30",
    expectedStartHour: 20
  },
  {
    name: "create casual meeting tomorrow morning",
    text: "帮我约个会明早九点",
    expectedIntent: "create_event",
    expectedStartDate: "2026-05-31",
    expectedStartHour: 9
  },
  {
    name: "create today half-hour time",
    text: "今天下午三点半开站会",
    expectedIntent: "create_event",
    expectedTitle: "站会",
    expectedStartDate: "2026-05-30",
    expectedStartHour: 15,
    expectedStartMinute: 30
  },
  {
    name: "create noon event",
    text: "今天中午十二点开午餐会",
    expectedIntent: "create_event",
    expectedTitle: "午餐会",
    expectedStartDate: "2026-05-30",
    expectedStartHour: 12
  },
  {
    name: "create tomorrow half past two event",
    text: "明天下午两点半开设计评审",
    expectedIntent: "create_event",
    expectedTitle: "设计评审",
    expectedStartDate: "2026-05-31",
    expectedStartHour: 14,
    expectedStartMinute: 30
  },
  {
    name: "create day after tomorrow morning event",
    text: "后天上午十点开技术同步",
    expectedIntent: "create_event",
    expectedTitle: "技术同步",
    expectedStartDate: "2026-06-01",
    expectedStartHour: 10
  },
  {
    name: "create next Monday event",
    text: "下周一上午十点开周会",
    expectedIntent: "create_event",
    expectedTitle: "周会",
    expectedStartDate: "2026-06-01",
    expectedStartHour: 10
  },
  {
    name: "create next Sunday afternoon event",
    text: "下周日下午三点开家庭聚餐",
    expectedIntent: "create_event",
    expectedTitle: "家庭聚餐",
    expectedStartDate: "2026-06-07",
    expectedStartHour: 15
  },
  {
    name: "create tomorrow night reminder",
    text: "明晚八点提醒我交周报",
    expectedIntent: "create_event",
    expectedTitle: "交周报",
    expectedStartDate: "2026-05-31",
    expectedStartHour: 20
  },
  {
    name: "create event with one-hour reminder",
    text: "明天下午三点开会提前一小时提醒我",
    expectedIntent: "create_event",
    expectedStartDate: "2026-05-31",
    expectedStartHour: 15,
    expectedReminderMinutes: 60
  },
  {
    name: "create digit hour event",
    text: "明天下午3点开面试",
    expectedIntent: "create_event",
    expectedTitle: "面试",
    expectedStartDate: "2026-05-31",
    expectedStartHour: 15
  },
  {
    name: "create explicit morning range",
    text: "后天上午十点到十一点开需求评审",
    expectedIntent: "create_event",
    expectedTitle: "需求评审",
    expectedStartDate: "2026-06-01",
    expectedStartHour: 10,
    expectedEndHour: 11
  },
  {
    name: "create dusk event",
    text: "今天傍晚六点开晚间同步",
    expectedIntent: "create_event",
    expectedTitle: "晚间同步",
    expectedStartDate: "2026-05-30",
    expectedStartHour: 18
  },
  {
    name: "list events by tomorrow",
    text: "我明天有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: ["产品评审会"]
  },
  {
    name: "list empty today schedule",
    text: "今天有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: []
  },
  {
    name: "list next Sunday event",
    text: "下周日有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: ["周末活动"]
  },
  {
    name: "list next week range",
    text: "下周一到周三有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: ["设计团队同步", "周三评审"]
  },
  {
    name: "list next workdays",
    text: "下周工作日有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: ["设计团队同步", "周三评审"]
  },
  {
    name: "list next Monday schedule",
    text: "查看下周一日程",
    expectedIntent: "list_events",
    expectedEventTitles: ["设计团队同步"]
  },
  {
    name: "list tomorrow schedule with casual phrasing",
    text: "看看明天日程",
    expectedIntent: "list_events",
    expectedEventTitles: ["产品评审会"]
  },
  {
    name: "list day after tomorrow schedule",
    text: "后天有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: ["设计团队同步"]
  },
  {
    name: "list next Wednesday schedule",
    text: "查看下周三日程",
    expectedIntent: "list_events",
    expectedEventTitles: ["周三评审"]
  },
  {
    name: "list next Monday through Sunday schedule",
    text: "下周一到周日有什么安排",
    expectedIntent: "list_events",
    expectedEventTitles: ["设计团队同步", "周三评审", "周末活动"]
  },
  {
    name: "list all schedule without date scope",
    text: "查看日程",
    expectedIntent: "list_events",
    expectedEventTitles: ["产品评审会", "设计团队同步", "周三评审", "周末活动"]
  },
  {
    name: "delete by date and title",
    text: "删除明天的产品评审会",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["产品评审会"]
  },
  {
    name: "delete by title without date",
    text: "删除产品评审会",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["产品评审会"]
  },
  {
    name: "delete next Monday event by date and title",
    text: "删除下周一的设计团队同步",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["设计团队同步"]
  },
  {
    name: "cancel next Wednesday event",
    text: "取消下周三的周三评审",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["周三评审"]
  },
  {
    name: "delete next Sunday event",
    text: "删掉下周日周末活动",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["周末活动"]
  },
  {
    name: "delete empty date scope safely",
    text: "删除下周二的产品评审会",
    expectedIntent: "delete_event",
    expectedCandidateCount: 0
  },
  {
    name: "cancel by title",
    text: "取消产品评审会",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["产品评审会"]
  },
  {
    name: "delete next workday event by title",
    text: "删除下周工作日的设计团队同步",
    expectedIntent: "delete_event",
    expectedCandidateTitles: ["设计团队同步"]
  },
  {
    name: "update by date and title",
    text: "把产品评审会改到明天下午四点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["产品评审会"],
    expectedStartDate: "2026-05-31",
    expectedStartHour: 16
  },
  {
    name: "update with explicit end time",
    text: "把产品评审会改到明天下午四点到五点半",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["产品评审会"],
    expectedStartDate: "2026-05-31",
    expectedStartHour: 16,
    expectedEndHour: 17,
    expectedEndMinute: 30
  },
  {
    name: "update time without changing matched event date",
    text: "把产品评审会改到下午四点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["产品评审会"],
    expectedStartDate: "2026-05-31",
    expectedStartHour: 16
  },
  {
    name: "update next Monday event to afternoon",
    text: "将设计团队同步改到下周一下午两点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["设计团队同步"],
    expectedStartDate: "2026-06-01",
    expectedStartHour: 14
  },
  {
    name: "postpone next Wednesday event",
    text: "把周三评审推迟到下周三下午三点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["周三评审"],
    expectedStartDate: "2026-06-03",
    expectedStartHour: 15
  },
  {
    name: "move next Sunday event earlier",
    text: "把周末活动提前到下周日上午九点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["周末活动"],
    expectedStartDate: "2026-06-07",
    expectedStartHour: 9
  },
  {
    name: "update unknown title safely",
    text: "修改不存在会议到明天下午三点",
    expectedIntent: "update_event",
    expectedCandidateCount: 0,
    expectedStartDate: "2026-05-31",
    expectedStartHour: 15
  },
  {
    name: "update to half-hour time",
    text: "把产品评审会修改到明天下午四点半",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["产品评审会"],
    expectedStartDate: "2026-05-31",
    expectedStartHour: 16,
    expectedStartMinute: 30
  },
  {
    name: "update next Monday event to eleven",
    text: "把设计团队同步修改到下周一上午十一点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["设计团队同步"],
    expectedStartDate: "2026-06-01",
    expectedStartHour: 11
  },
  {
    name: "update with digit hour",
    text: "把产品评审会改到明天下午4点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["产品评审会"],
    expectedStartDate: "2026-05-31",
    expectedStartHour: 16
  },
  {
    name: "update to tomorrow night",
    text: "把产品评审会改到明天晚上八点",
    expectedIntent: "update_event",
    expectedCandidateTitles: ["产品评审会"],
    expectedStartDate: "2026-05-31",
    expectedStartHour: 20
  },
  {
    name: "find free time around busy events",
    text: "明天下午我什么时候有空",
    expectedIntent: "find_free_time",
    expectedSlotHours: [
      [13, 15],
      [16, 18]
    ]
  },
  {
    name: "find free morning time",
    text: "明天上午我什么时候有空",
    expectedIntent: "find_free_time",
    expectedSlotHours: [[9, 12]]
  },
  {
    name: "find next Monday morning free time",
    text: "下周一上午有空吗",
    expectedIntent: "find_free_time",
    expectedSlotHours: [
      [9, 10],
      [11, 12]
    ]
  },
  {
    name: "find next Monday afternoon free time",
    text: "下周一下午我什么时候有空",
    expectedIntent: "find_free_time",
    expectedSlotHours: [[13, 18]]
  },
  {
    name: "find tonight free time",
    text: "今晚什么时候有空",
    expectedIntent: "find_free_time",
    expectedSlotHours: [[18, 22]]
  },
  {
    name: "return unknown when time is missing",
    text: "帮我安排一个复盘",
    expectedIntent: "unknown"
  },
  {
    name: "return unknown when command is too vague",
    text: "帮我安排",
    expectedIntent: "unknown"
  },
  {
    name: "return unknown for unrelated input",
    text: "天气怎么样",
    expectedIntent: "unknown"
  },
  {
    name: "return unknown for empty input",
    text: "",
    expectedIntent: "unknown"
  },
  {
    name: "return unknown for small talk",
    text: "随便聊聊",
    expectedIntent: "unknown"
  }
];

describe("command parser evaluation set", () => {
  it.each(evaluationCases)("$name", (evaluationCase) => {
    const result = parseCalendarCommand(evaluationCase.text, fixtureEvents, baseDate);

    expect(result.intent).toBe(evaluationCase.expectedIntent);
    assertExpectedSlots(result, evaluationCase);
  });

  it("reports aggregate parser metrics", () => {
    const report = calculateMetrics(evaluationCases);

    console.info(
      [
        "Parser evaluation metrics:",
        `cases=${report.totalCases}`,
        `intent_accuracy=${formatRate(report.intentAccuracy)}`,
        `slot_accuracy=${formatRate(report.slotAccuracy)}`,
        `fallback_rate=${formatRate(report.fallbackRate)}`,
        `unsafe_action_rate=${formatRate(report.unsafeActionRate)}`
      ].join(" ")
    );

    expect(report.totalCases).toBeGreaterThanOrEqual(50);
    expect(report.intentAccuracy).toBe(1);
    expect(report.slotAccuracy).toBe(1);
    expect(report.unsafeActionRate).toBe(0);
  });
});

function assertExpectedSlots(result: ParsedCommand, evaluationCase: EvaluationCase) {
  if (result.intent === "create_event") {
    expectString(result.event.title, evaluationCase.expectedTitle);
    expectString(result.event.type, evaluationCase.expectedType);
    expectDate(result.event.start, evaluationCase.expectedStartDate);
    expectNumber(result.event.start.getHours(), evaluationCase.expectedStartHour);
    expectNumber(result.event.start.getMinutes(), evaluationCase.expectedStartMinute);
    expectNumber(result.event.end.getHours(), evaluationCase.expectedEndHour);
    expectNumber(result.event.end.getMinutes(), evaluationCase.expectedEndMinute);
    expectNumber(result.event.reminderMinutes, evaluationCase.expectedReminderMinutes);
  }

  if (result.intent === "list_events") {
    expectArray(
      result.events.map((event) => event.title),
      evaluationCase.expectedEventTitles
    );
  }

  if (result.intent === "delete_event") {
    expectArray(
      result.candidates.map((event) => event.title),
      evaluationCase.expectedCandidateTitles
    );
    expectNumber(result.candidates.length, evaluationCase.expectedCandidateCount);
  }

  if (result.intent === "update_event") {
    expectArray(
      result.candidates.map((event) => event.title),
      evaluationCase.expectedCandidateTitles
    );
    expectNumber(result.candidates.length, evaluationCase.expectedCandidateCount);
    expectDate(result.start, evaluationCase.expectedStartDate);
    expectNumber(result.start?.getHours(), evaluationCase.expectedStartHour);
    expectNumber(result.start?.getMinutes(), evaluationCase.expectedStartMinute);
    expectNumber(result.end?.getHours(), evaluationCase.expectedEndHour);
    expectNumber(result.end?.getMinutes(), evaluationCase.expectedEndMinute);
  }

  if (result.intent === "find_free_time") {
    expectArray(
      result.slots.map((slot) => [slot.start.getHours(), slot.end.getHours()] as [number, number]),
      evaluationCase.expectedSlotHours
    );
  }
}

function calculateMetrics(cases: EvaluationCase[]) {
  let intentCorrect = 0;
  let fallbackCorrect = 0;
  let fallbackCases = 0;
  let unsafeActionCases = 0;
  let unsafeActionViolations = 0;
  let slotChecks = 0;
  let slotCorrect = 0;

  for (const evaluationCase of cases) {
    const result = parseCalendarCommand(evaluationCase.text, fixtureEvents, baseDate);

    if (result.intent === evaluationCase.expectedIntent) {
      intentCorrect += 1;
    }

    if (evaluationCase.expectedIntent === "unknown") {
      fallbackCases += 1;
      if (result.intent === "unknown") {
        fallbackCorrect += 1;
      }
    }

    if (
      (evaluationCase.expectedIntent === "delete_event" || evaluationCase.expectedIntent === "update_event") &&
      evaluationCase.expectedCandidateCount === 0
    ) {
      unsafeActionCases += 1;
      const candidateCount =
        result.intent === "delete_event" || result.intent === "update_event" ? result.candidates.length : 0;
      if (candidateCount > 0) {
        unsafeActionViolations += 1;
      }
    }

    const slotResult = countSlotChecks(result, evaluationCase);
    slotChecks += slotResult.total;
    slotCorrect += slotResult.correct;
  }

  return {
    totalCases: cases.length,
    intentAccuracy: intentCorrect / cases.length,
    slotAccuracy: slotChecks === 0 ? 1 : slotCorrect / slotChecks,
    fallbackRate: fallbackCases === 0 ? 0 : fallbackCorrect / fallbackCases,
    unsafeActionRate: unsafeActionCases === 0 ? 0 : unsafeActionViolations / unsafeActionCases
  };
}

function countSlotChecks(result: ParsedCommand, evaluationCase: EvaluationCase) {
  let total = 0;
  let correct = 0;

  const check = (actual: unknown, expected: unknown) => {
    if (expected === undefined) {
      return;
    }

    total += 1;
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      correct += 1;
    }
  };

  if (result.intent === "create_event") {
    check(result.event.title, evaluationCase.expectedTitle);
    check(result.event.type, evaluationCase.expectedType);
    check(toDateKey(result.event.start), evaluationCase.expectedStartDate);
    check(result.event.start.getHours(), evaluationCase.expectedStartHour);
    check(result.event.start.getMinutes(), evaluationCase.expectedStartMinute);
    check(result.event.end.getHours(), evaluationCase.expectedEndHour);
    check(result.event.end.getMinutes(), evaluationCase.expectedEndMinute);
    check(result.event.reminderMinutes, evaluationCase.expectedReminderMinutes);
  }

  if (result.intent === "list_events") {
    check(
      result.events.map((event) => event.title),
      evaluationCase.expectedEventTitles
    );
  }

  if (result.intent === "delete_event") {
    check(
      result.candidates.map((event) => event.title),
      evaluationCase.expectedCandidateTitles
    );
    check(result.candidates.length, evaluationCase.expectedCandidateCount);
  }

  if (result.intent === "update_event") {
    check(
      result.candidates.map((event) => event.title),
      evaluationCase.expectedCandidateTitles
    );
    check(result.candidates.length, evaluationCase.expectedCandidateCount);
    check(result.start ? toDateKey(result.start) : undefined, evaluationCase.expectedStartDate);
    check(result.start?.getHours(), evaluationCase.expectedStartHour);
    check(result.start?.getMinutes(), evaluationCase.expectedStartMinute);
    check(result.end?.getHours(), evaluationCase.expectedEndHour);
    check(result.end?.getMinutes(), evaluationCase.expectedEndMinute);
  }

  if (result.intent === "find_free_time") {
    check(
      result.slots.map((slot) => [slot.start.getHours(), slot.end.getHours()]),
      evaluationCase.expectedSlotHours
    );
  }

  return { total, correct };
}

function expectString(actual: string | undefined, expected: string | undefined) {
  if (expected !== undefined) {
    expect(actual).toBe(expected);
  }
}

function expectNumber(actual: number | undefined, expected: number | undefined) {
  if (expected !== undefined) {
    expect(actual).toBe(expected);
  }
}

function expectDate(actual: Date | string | undefined, expected: string | undefined) {
  if (expected !== undefined) {
    expect(actual ? toDateKey(actual) : undefined).toBe(expected);
  }
}

function expectArray<T>(actual: T[], expected: T[] | undefined) {
  if (expected !== undefined) {
    expect(actual).toEqual(expected);
  }
}

function toDateKey(date: Date | string) {
  const normalized = typeof date === "string" ? new Date(date) : date;
  return normalized.toISOString().slice(0, 10);
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
