import { addDays, addHours, set } from "date-fns";
import type { CalendarEvent, CreateCalendarEventInput } from "../calendar/eventTypes";

export type FreeTimeSlot = {
  start: Date;
  end: Date;
};

export type ParsedCommand =
  | {
      intent: "create_event";
      event: CreateCalendarEventInput;
      reply: string;
    }
  | {
      intent: "list_events";
      events: CalendarEvent[];
      reply: string;
    }
  | {
      intent: "delete_event";
      candidates: CalendarEvent[];
      reply: string;
    }
  | {
      intent: "update_event";
      candidates: CalendarEvent[];
      start?: Date;
      end?: Date;
      reply: string;
    }
  | {
      intent: "find_free_time";
      slots: FreeTimeSlot[];
      reply: string;
    }
  | {
      intent: "unknown";
      reply: string;
    };

type ParsedDateTime = {
  start: Date;
  end: Date;
};

const chineseDigits: Record<string, number> = {
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

export function parseCalendarCommand(
  text: string,
  events: CalendarEvent[],
  now = new Date()
): ParsedCommand {
  const normalized = text.trim();

  if (!normalized) {
    return {
      intent: "unknown",
      reply: "请输入一条日程指令。"
    };
  }

  if (isDeleteIntent(normalized)) {
    const candidates = findMatchingEvents(normalized, events, now);
    return {
      intent: "delete_event",
      candidates,
      reply:
        candidates.length === 0
          ? "没有找到匹配的日程，请补充日期或标题。"
          : `我找到了「${candidates[0].title}」，删除前需要你确认。`
    };
  }

  if (isUpdateIntent(normalized)) {
    const parsedTime = parseDateTime(normalized, now);
    const candidates = findMatchingEvents(normalized, events, now);

    return {
      intent: "update_event",
      candidates,
      start: parsedTime?.start,
      end: parsedTime?.end,
      reply:
        candidates.length === 0
          ? "没有找到要修改的日程，请补充标题或日期。"
          : parsedTime
            ? `我会把「${candidates[0].title}」改到 ${formatCommandTime(parsedTime.start)}，请确认。`
            : "我找到了日程，但还不能确定新的时间，请补充时间。"
    };
  }

  if (isFreeTimeIntent(normalized)) {
    const slots = findFreeTimeSlots(normalized, events, now);
    return {
      intent: "find_free_time",
      slots,
      reply:
        slots.length === 0
          ? "这个时间范围里暂时没有 30 分钟以上的空闲时间。"
          : `我找到了 ${slots.length} 个空闲时间：${slots.map(formatTimeSlot).join("、")}。`
    };
  }

  if (isListIntent(normalized)) {
    const scopedEvents = filterEventsByText(normalized, events, now);
    return {
      intent: "list_events",
      events: scopedEvents,
      reply:
        scopedEvents.length === 0
          ? "这个时间范围内没有日程。"
          : `我找到了 ${scopedEvents.length} 个日程：${scopedEvents.map((event) => event.title).join("、")}。`
    };
  }

  if (isCreateIntent(normalized)) {
    const parsedTime = parseDateTime(normalized, now);

    if (!parsedTime) {
      return {
        intent: "unknown",
        reply: "我还不能确定具体时间，请补充日期和时间。"
      };
    }

    const title = extractTitle(normalized);
    const reminderMinutes = extractReminderMinutes(normalized);

    return {
      intent: "create_event",
      event: {
        title,
        start: parsedTime.start,
        end: parsedTime.end,
        reminderMinutes,
        sourceText: normalized,
        type: title.includes("复盘") || title.includes("专注") ? "focus" : "meeting"
      },
      reply: `我理解为新增「${title}」，时间是 ${formatCommandTime(parsedTime.start)}，${formatReminderText(
        reminderMinutes
      )}。请确认。`
    };
  }

  return {
    intent: "unknown",
    reply: "我还没有理解这条指令，可以换一种说法，例如：明天下午三点开产品评审会。"
  };
}

function isCreateIntent(text: string) {
  return /添加|创建|安排|开.+会|提醒我/.test(text);
}

function isListIntent(text: string) {
  return /查看|看看|有什么|日程|安排/.test(text) && !/添加|创建|删除|删掉|取消|改到|修改/.test(text);
}

function isDeleteIntent(text: string) {
  return /删除|删掉|取消/.test(text);
}

function isUpdateIntent(text: string) {
  return /改到|修改|推迟到|提前到/.test(text);
}

function isFreeTimeIntent(text: string) {
  return /空闲|有空|什么时候有空|有没有空/.test(text);
}

function parseDateTime(text: string, now: Date): ParsedDateTime | null {
  const date = parseDate(text, now);
  const time = parseTime(text);

  if (!time) {
    return null;
  }

  const start = set(date, {
    hours: time.hours,
    minutes: time.minutes,
    seconds: 0,
    milliseconds: 0
  });

  return {
    start,
    end: addHours(start, 1)
  };
}

function parseDate(text: string, now: Date) {
  if (text.includes("后天")) {
    return addDays(now, 2);
  }

  if (text.includes("明天")) {
    return addDays(now, 1);
  }

  const nextWeekday = text.match(/下周([一二三四五六日天])/);
  if (nextWeekday) {
    return getNextWeekday(now, weekdayToNumber(nextWeekday[1]));
  }

  return now;
}

function parseTime(text: string) {
  const match = text.match(/([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})\s*[点时](半|[0-9]{1,2}分?|[零一二三四五六七八九十]{1,3}分?)?/);

  if (!match) {
    return null;
  }

  let hours = parseNumber(match[1]);
  let minutes = 0;
  const minuteToken = match[2];

  if (minuteToken) {
    minutes = minuteToken === "半" ? 30 : parseNumber(minuteToken.replace("分", ""));
  }

  if (/下午|晚上|傍晚/.test(text) && hours < 12) {
    hours += 12;
  }

  if (/中午/.test(text) && hours < 11) {
    hours += 12;
  }

  return { hours, minutes };
}

function extractTitle(text: string) {
  const remindMatch = text.match(/提醒我(.+?)(?:，|,|。|$)/);
  if (remindMatch?.[1]) {
    return cleanupTitle(remindMatch[1]);
  }

  const createMatch = text.match(/(?:添加|创建|安排|开)(.+?)(?:，|,|。|$)/);
  if (createMatch?.[1]) {
    return cleanupTitle(createMatch[1]);
  }

  return "新日程";
}

function cleanupTitle(rawTitle: string) {
  const title = rawTitle
    .replace(/今天|明天|后天|下周[一二三四五六日天]?/g, "")
    .replace(/上午|早上|下午|晚上|中午|傍晚/g, "")
    .replace(/([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})\s*[点时](半|[0-9]{1,2}分?|[零一二三四五六七八九十]{1,3}分?)?/g, "")
    .replace(/提前([0-9]{1,3}|[零一二两三四五六七八九十]{1,3})(分钟|小时)提醒?/g, "")
    .replace(/提醒我|和|一个|一场/g, "")
    .trim();

  return title || "新日程";
}

function extractReminderMinutes(text: string) {
  const match = text.match(/提前([0-9]{1,3}|[零一二两三四五六七八九十]{1,3})(分钟|小时)/);

  if (!match) {
    return 10;
  }

  const value = parseNumber(match[1]);
  return match[2] === "小时" ? value * 60 : value;
}

function findMatchingEvents(text: string, events: CalendarEvent[], now: Date) {
  const scoped = filterEventsByText(text, events, now);
  const keyword = extractEventKeyword(text);
  const titleMatched = scoped.filter(
    (event) => text.includes(event.title) || event.title.includes(keyword) || keyword.includes(event.title)
  );

  return titleMatched.length > 0 ? titleMatched : scoped;
}

function findFreeTimeSlots(text: string, events: CalendarEvent[], now: Date) {
  const date = parseDate(text, now);
  const window = getFreeTimeWindow(text, date);
  const busyEvents = events
    .map((event) => ({
      start: new Date(event.start),
      end: new Date(event.end)
    }))
    .filter((event) => event.start < window.end && event.end > window.start)
    .sort((first, second) => first.start.getTime() - second.start.getTime());

  const slots: FreeTimeSlot[] = [];
  let cursor = window.start;

  for (const event of busyEvents) {
    const busyStart = event.start > window.start ? event.start : window.start;
    const busyEnd = event.end < window.end ? event.end : window.end;

    if (busyStart.getTime() - cursor.getTime() >= 30 * 60 * 1000) {
      slots.push({ start: cursor, end: busyStart });
    }

    if (busyEnd > cursor) {
      cursor = busyEnd;
    }
  }

  if (window.end.getTime() - cursor.getTime() >= 30 * 60 * 1000) {
    slots.push({ start: cursor, end: window.end });
  }

  return slots;
}

function getFreeTimeWindow(text: string, date: Date) {
  if (/上午|早上/.test(text)) {
    return {
      start: set(date, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 })
    };
  }

  if (/下午/.test(text)) {
    return {
      start: set(date, { hours: 13, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(date, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 })
    };
  }

  if (/晚上|傍晚/.test(text)) {
    return {
      start: set(date, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(date, { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 })
    };
  }

  return {
    start: set(date, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }),
    end: set(date, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 })
  };
}

function extractEventKeyword(text: string) {
  return cleanupTitle(
    text
      .replace(/删除|删掉|取消|把|将|改到|修改|推迟到|提前到/g, "")
      .replace(/今天|明天|后天|下周[一二三四五六日天]?/g, "")
  );
}

function filterEventsByText(text: string, events: CalendarEvent[], now: Date) {
  if (text.includes("今天")) {
    return events.filter((event) => isSameDate(new Date(event.start), now));
  }

  if (text.includes("明天")) {
    return events.filter((event) => isSameDate(new Date(event.start), addDays(now, 1)));
  }

  return events;
}

function parseNumber(token: string) {
  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  if (token === "十") {
    return 10;
  }

  if (token.startsWith("十")) {
    return 10 + (chineseDigits[token[1]] ?? 0);
  }

  if (token.endsWith("十")) {
    return (chineseDigits[token[0]] ?? 0) * 10;
  }

  if (token.includes("十")) {
    const [tens, ones] = token.split("十");
    return (chineseDigits[tens] ?? 1) * 10 + (chineseDigits[ones] ?? 0);
  }

  return chineseDigits[token] ?? 0;
}

function weekdayToNumber(token: string) {
  if (token === "日" || token === "天") {
    return 0;
  }

  return chineseDigits[token] ?? 1;
}

function getNextWeekday(now: Date, weekday: number) {
  const current = now.getDay();
  const diff = (weekday - current + 7) % 7 || 7;
  return addDays(now, diff);
}

function isSameDate(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function formatCommandTime(date: Date) {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function formatTimeSlot(slot: FreeTimeSlot) {
  return `${String(slot.start.getHours()).padStart(2, "0")}:${String(slot.start.getMinutes()).padStart(
    2,
    "0"
  )}-${String(slot.end.getHours()).padStart(2, "0")}:${String(slot.end.getMinutes()).padStart(2, "0")}`;
}

function formatReminderText(minutes: number) {
  if (minutes <= 0) {
    return "准时提醒";
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    return `提前 ${minutes / 60} 小时提醒`;
  }

  return `提前 ${minutes} 分钟提醒`;
}
