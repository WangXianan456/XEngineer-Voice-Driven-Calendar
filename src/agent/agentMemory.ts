import type { CalendarEvent } from "../calendar/eventTypes";

export type AgentMemory = {
  lastIntent: string | null;
  lastMentionedEvents: CalendarEvent[];
  lastCandidates: CalendarEvent[];
  pendingClarification: string | null;
  selectedEventId: string | null;
  conversationSummary: string;
};

export function createInitialAgentMemory(): AgentMemory {
  return {
    lastIntent: null,
    lastMentionedEvents: [],
    lastCandidates: [],
    pendingClarification: null,
    selectedEventId: null,
    conversationSummary: ""
  };
}

export function rememberIntent(memory: AgentMemory, intent: string): AgentMemory {
  return {
    ...memory,
    lastIntent: intent
  };
}

export function rememberMentionedEvents(memory: AgentMemory, events: CalendarEvent[], intent?: string): AgentMemory {
  return {
    ...memory,
    lastIntent: intent ?? memory.lastIntent,
    lastMentionedEvents: events,
    selectedEventId: events.length === 1 ? events[0].id : memory.selectedEventId,
    conversationSummary: createMentionSummary(events, intent ?? memory.lastIntent)
  };
}

export function rememberCandidates(memory: AgentMemory, candidates: CalendarEvent[], intent?: string): AgentMemory {
  return {
    ...memory,
    lastIntent: intent ?? memory.lastIntent,
    lastCandidates: candidates,
    lastMentionedEvents: candidates.length > 0 ? candidates : memory.lastMentionedEvents,
    selectedEventId: candidates.length === 1 ? candidates[0].id : null,
    pendingClarification: candidates.length > 1 ? "candidate_selection" : null,
    conversationSummary: createMentionSummary(candidates, intent ?? memory.lastIntent)
  };
}

export function selectMemoryCandidate(memory: AgentMemory, index: number): { memory: AgentMemory; event: CalendarEvent | null } {
  const event = memory.lastCandidates[index] ?? null;

  if (!event) {
    return { memory, event: null };
  }

  return {
    event,
    memory: {
      ...memory,
      selectedEventId: event.id,
      lastMentionedEvents: [event],
      pendingClarification: null,
      conversationSummary: createMentionSummary([event], memory.lastIntent)
    }
  };
}

export function resolveMemoryReference(memory: AgentMemory, events: CalendarEvent[]): CalendarEvent | null {
  if (memory.selectedEventId) {
    const selected = events.find((event) => event.id === memory.selectedEventId);
    if (selected) {
      return selected;
    }
  }

  if (memory.lastMentionedEvents.length === 1) {
    const [event] = memory.lastMentionedEvents;
    return events.find((item) => item.id === event.id) ?? event;
  }

  return null;
}

export function parseMemoryCandidateChoice(text: string): number | null {
  const digitMatch = text.match(/第?\s*([1-9])\s*(个|项|条)?/);
  if (digitMatch) {
    return Number(digitMatch[1]) - 1;
  }

  const chineseMatch = text.match(/第?\s*([一二两三四五六七八九])\s*(个|项|条)?/);
  if (!chineseMatch) {
    return null;
  }

  const value = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }[chineseMatch[1]];
  return value ? value - 1 : null;
}

export function isMemoryCorrection(text: string) {
  return /不是这个|不是它|换成|应该是|选错/.test(text);
}

export function isReferenceCommand(text: string) {
  return /它|这个|那个|刚才|刚刚|上一个|前一个/.test(text);
}

export function isTargetlessMemoryTimeCommand(text: string) {
  const normalized = text.trim();
  if (!/(改成|改到|修改到|修改为|换到|挪到|推迟到|提前到)/.test(normalized)) {
    return false;
  }

  if (!/(今天|今晚|明天|明早|明晚|后天|下周[一二三四五六日天]?|上午|早上|下午|晚上|中午|傍晚)/.test(normalized)) {
    return false;
  }

  const targetBeforeVerb = normalized.match(/^把(.+?)(?:改成|改到|修改到|修改为|换到|挪到|推迟到|提前到)/);
  if (!targetBeforeVerb?.[1]) {
    return true;
  }

  return /^(它|这个|那个|刚才那个|刚刚那个|上一个|前一个|时间)$/.test(targetBeforeVerb[1].trim());
}

export function resolveMemoryTimeUpdate(
  text: string,
  event: CalendarEvent | null,
  now = new Date()
): { start: Date; end: Date } | null {
  if (!event || !isTargetlessMemoryTimeCommand(text)) {
    return null;
  }

  const originalStart = new Date(event.start);
  const originalEnd = new Date(event.end);
  if (Number.isNaN(originalStart.getTime()) || Number.isNaN(originalEnd.getTime())) {
    return null;
  }

  const targetDate = resolveMemoryTargetDate(text, now);
  const explicitTime = parseMemoryClockTime(text);
  const periodTime = explicitTime ?? getMemoryPeriodDefaultTime(text);
  const duration = originalEnd.getTime() - originalStart.getTime();
  const start = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    periodTime?.hours ?? originalStart.getHours(),
    periodTime?.minutes ?? originalStart.getMinutes(),
    0,
    0
  );

  return {
    start,
    end: new Date(start.getTime() + duration)
  };
}

function createMentionSummary(events: CalendarEvent[], intent: string | null) {
  if (events.length === 0) {
    return intent ? `最近意图：${intent}` : "";
  }

  const titles = events.map((event) => event.title).join("、");
  return intent ? `最近意图：${intent}；提到：${titles}` : `提到：${titles}`;
}

function resolveMemoryTargetDate(text: string, now: Date) {
  if (text.includes("后天")) {
    return addCalendarDays(now, 2);
  }

  if (/明天|明早|明晚/.test(text)) {
    return addCalendarDays(now, 1);
  }

  const nextWeekday = text.match(/下周([一二三四五六日天])/);
  if (nextWeekday) {
    return getNextWeekday(now, weekdayToNumber(nextWeekday[1]));
  }

  return now;
}

function getMemoryPeriodDefaultTime(text: string): { hours: number; minutes: number } | null {
  if (/上午|早上|明早/.test(text)) {
    return { hours: 10, minutes: 0 };
  }

  if (/下午/.test(text)) {
    return { hours: 15, minutes: 0 };
  }

  if (/晚上|傍晚|今晚|明晚/.test(text)) {
    return { hours: 19, minutes: 0 };
  }

  if (/中午/.test(text)) {
    return { hours: 12, minutes: 0 };
  }

  return null;
}

function parseMemoryClockTime(text: string): { hours: number; minutes: number } | null {
  const match = text.match(/([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})\s*[点时](半|[一二两三]刻|[0-9]{1,2}分?|[零一二三四五六七八九十]{1,3}分?)?/);
  if (!match) {
    return null;
  }

  let hours = parseChineseNumber(match[1]);
  const minutes = parseMinuteToken(match[2]);

  if (/下午|晚上|傍晚|今晚|明晚/.test(text) && hours < 12) {
    hours += 12;
  }

  if (/中午/.test(text) && hours < 11) {
    hours += 12;
  }

  return { hours, minutes };
}

function parseMinuteToken(token?: string) {
  if (!token) {
    return 0;
  }

  if (token === "半") {
    return 30;
  }

  if (token.includes("刻")) {
    return parseChineseNumber(token.replace("刻", "") || "一") * 15;
  }

  return parseChineseNumber(token.replace("分", ""));
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getNextWeekday(now: Date, weekday: number) {
  const current = now.getDay();
  const daysUntilNextMonday = (1 - current + 7) % 7 || 7;
  const offsetFromMonday = weekday === 0 ? 6 : weekday - 1;
  return addCalendarDays(now, daysUntilNextMonday + offsetFromMonday);
}

function weekdayToNumber(token: string) {
  if (token === "日" || token === "天") {
    return 0;
  }

  return parseChineseNumber(token) || 1;
}

function parseChineseNumber(token: string) {
  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };

  if (token === "十") {
    return 10;
  }

  if (token.startsWith("十")) {
    return 10 + (digits[token[1]] ?? 0);
  }

  if (token.endsWith("十")) {
    return (digits[token[0]] ?? 0) * 10;
  }

  if (token.includes("十")) {
    const [tens, ones] = token.split("十");
    return (digits[tens] ?? 1) * 10 + (digits[ones] ?? 0);
  }

  return digits[token] ?? 0;
}
