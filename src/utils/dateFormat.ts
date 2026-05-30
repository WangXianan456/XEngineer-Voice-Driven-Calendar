import { format, isSameWeek, isToday, isTomorrow } from "date-fns";

export function formatEventTime(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${formatDateLabel(start)} ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`;
}

export function formatDateLabel(date: Date) {
  if (isToday(date)) {
    return "今天";
  }

  if (isTomorrow(date)) {
    return "明天";
  }

  if (isSameWeek(date, new Date(), { weekStartsOn: 1 })) {
    return `本周${formatWeekday(date)}`;
  }

  return format(date, "MM-dd");
}

export function formatReminder(minutes: number) {
  if (minutes <= 0) {
    return "准时提醒";
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    return `提前 ${minutes / 60} 小时`;
  }

  return `提前 ${minutes} 分钟`;
}

function formatWeekday(date: Date) {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return weekdays[date.getDay()];
}
