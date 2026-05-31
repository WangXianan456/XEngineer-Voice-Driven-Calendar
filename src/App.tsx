import { useMemo, useState } from "react";
import { addDays, addMonths, differenceInMinutes, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import {
  Bell,
  CalendarDays,
  Check,
  Clock3,
  Database,
  Download,
  ChevronLeft,
  ChevronRight,
  Mic,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Volume2
} from "lucide-react";
import { parseCalendarCommand } from "./agent/commandParser";
import {
  findBackendTargetEvents,
  isBackendParseEnabled,
  parseBackendDateRange,
  parseWithBackend,
  toCreateEventInput,
  type BackendParsedCommand
} from "./agent/backendParser";
import type { CalendarEvent, CreateCalendarEventInput } from "./calendar/eventTypes";
import { useCalendarEvents } from "./calendar/useCalendarEvents";
import { speak, warmUpSpeechSynthesis } from "./speech/synthesis";
import { useLocalAsrRecognition } from "./speech/useLocalAsrRecognition";
import { useSpeechRecognition } from "./speech/useSpeechRecognition";
import { formatDateLabel, formatEventTime, formatReminder } from "./utils/dateFormat";

type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
};

type PendingAction =
  | {
      type: "create_event";
      event: CreateCalendarEventInput;
      conflicts: CalendarEvent[];
      summary: string;
    }
  | {
      type: "delete_event";
      candidates: CalendarEvent[];
      selectedIndex: number | null;
      summary: string;
    }
  | {
      type: "update_event";
      candidates: CalendarEvent[];
      selectedIndex: number | null;
      start?: Date;
      end?: Date;
      reminderMinutes?: number;
      summary: string;
    };

type UndoAction =
  | {
      type: "create_event";
      event: CalendarEvent;
    }
  | {
      type: "delete_event";
      event: CalendarEvent;
    }
  | {
      type: "update_event";
      event: CalendarEvent;
    };

const examples = [
  "明天下午三点开产品评审会，提前十分钟提醒我",
  "我明天有什么安排",
  "把产品评审会改到下午四点",
  "明天下午我什么时候有空",
  "删除明天的产品评审会",
  "今天晚上八点提醒我复盘项目"
];

const initialMessages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    text: "说出或输入一条日程指令，我会先展示理解结果，再等待你确认写入。"
  }
];

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const defaultSpeechProvider = env?.VITE_SPEECH_PROVIDER === "local" ? "local" : "browser";

export function App() {
  const { events, addEvent, restoreEvent, deleteEvent, updateEvent, resetDemoEvents, clearEvents } =
    useCalendarEvents();
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [lastUndoAction, setLastUndoAction] = useState<UndoAction | null>(null);
  const [lastReferencedEvent, setLastReferencedEvent] = useState<CalendarEvent | null>(null);
  const [speechProvider, setSpeechProvider] = useState<"browser" | "local">(defaultSpeechProvider);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const browserSpeech = useSpeechRecognition((text) => {
    setCommand(text);
    handleCommand(text);
  });
  const localSpeech = useLocalAsrRecognition((text) => {
    setCommand(text);
    handleCommand(text);
  });
  const speech = speechProvider === "local" ? localSpeech : browserSpeech;
  const backendParserEnabled = isBackendParseEnabled();

  const selectedDateEvents = events.filter((event) => isSameDate(new Date(event.start), selectedDate));
  const monthEvents = events.filter((event) => isSameMonth(new Date(event.start), visibleMonth));
  const todayEvents = events.filter((event) => formatDateLabel(new Date(event.start)) === "今天");
  const tomorrowEvents = events.filter((event) => formatDateLabel(new Date(event.start)) === "明天");
  const reminderCount = events.filter((event) => event.reminderMinutes > 0).length;
  const calendarDays = useMemo(() => getMonthCalendarDays(visibleMonth), [visibleMonth]);
  const pendingFields = useMemo(() => getPendingFields(pendingAction), [pendingAction]);

  function appendMessage(role: AgentMessage["role"], text: string) {
    setMessages((current) => [
      ...current,
      {
        id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        text
      }
    ]);
  }

  function respond(text: string) {
    appendMessage("agent", text);
    speak(text);
  }

  async function handleCommand(text = command) {
    const trimmed = text.trim();

    if (!trimmed) {
      respond("请输入一条日程指令，或点击下方示例指令。");
      return;
    }

    appendMessage("user", trimmed);

    const candidateIndex = parseCandidateChoice(trimmed);
    if (pendingAction && candidateIndex !== null) {
      selectPendingCandidate(candidateIndex);
      setCommand("");
      return;
    }

    if (pendingAction && /确认|好的|可以|执行/.test(trimmed)) {
      confirmPendingAction();
      setCommand("");
      return;
    }

    if (pendingAction && /取消|不用|算了/.test(trimmed)) {
      setPendingAction(null);
      respond("已取消当前待确认操作。");
      setCommand("");
      return;
    }

    if (/撤销|恢复刚才|还原/.test(trimmed)) {
      undoLastAction();
      setCommand("");
      return;
    }

    const parsed = parseCalendarCommand(trimmed, events);
    const referenceEvent = isReferenceCommand(trimmed) ? lastReferencedEvent : null;

    if (parsed.intent === "create_event") {
      const conflicts = findConflictingEvents(parsed.event.start, parsed.event.end, events);
      setPendingAction({
        type: "create_event",
        event: parsed.event,
        conflicts,
        summary:
          conflicts.length > 0
            ? `${parsed.reply} 但这个时间和「${conflicts[0].title}」冲突，是否仍然添加？`
            : parsed.reply
      });
      respond(
        conflicts.length > 0
          ? `${parsed.reply} 但这个时间和「${conflicts[0].title}」冲突，是否仍然添加？`
          : parsed.reply
      );
    }

    if (parsed.intent === "list_events") {
      respond(formatListReply(parsed.events, parsed.reply));
      if (parsed.events.length === 1) {
        setLastReferencedEvent(parsed.events[0]);
      }
    }

    if (parsed.intent === "find_free_time") {
      respond(formatFreeTimeReply(parsed.slots, parsed.reply));
    }

    if (parsed.intent === "delete_event") {
      const candidates = referenceEvent ? [referenceEvent] : parsed.candidates;

      if (candidates.length === 0) {
        respond(parsed.reply);
      } else {
        requestDeleteCandidates(candidates);
      }
    }

    if (parsed.intent === "update_event") {
      const candidates = referenceEvent ? [referenceEvent] : parsed.candidates;

      if (candidates.length === 0 || !parsed.start || !parsed.end) {
        respond(parsed.reply);
      } else {
        requestUpdateCandidates(candidates, parsed.start, parsed.end);
      }
    }

    if (parsed.intent === "unknown" && referenceEvent && isReminderOnlyCommand(trimmed)) {
      const reminderMinutes = parseReminderMinutesFromText(trimmed);
      if (reminderMinutes !== null) {
        requestReminderUpdate(referenceEvent, reminderMinutes);
        setCommand("");
        return;
      }
    }

    if (parsed.intent === "unknown") {
      let handledByBackend = false;

      if (backendParserEnabled) {
        try {
          const backendParsed = await parseWithBackend(trimmed, events);
          handledByBackend = backendParsed ? handleBackendParsedCommand(backendParsed, trimmed) : false;
        } catch {
          respond("后端增强解析暂时不可用，已使用本地规则兜底。");
        }
      }

      if (!handledByBackend) {
        respond(parsed.reply);
      }
    }

    setCommand("");
  }

  function handleBackendParsedCommand(parsed: BackendParsedCommand, sourceText: string) {
    if (parsed.intent === "create_event") {
      const eventInput = toCreateEventInput(parsed, sourceText);

      if (!eventInput) {
        respond(parsed.reply);
        return true;
      }

      const conflicts = findConflictingEvents(eventInput.start, eventInput.end, events);
      const summary =
        conflicts.length > 0
          ? `${parsed.reply} 但这个时间和「${conflicts[0].title}」冲突，是否仍然添加？`
          : parsed.reply;

      setPendingAction({
        type: "create_event",
        event: eventInput,
        conflicts,
        summary
      });
      respond(summary);
      return true;
    }

    if (parsed.intent === "delete_event") {
      const candidates = findBackendTargetEvents(parsed, events);

      if (candidates.length === 0) {
        respond(parsed.reply);
        return true;
      }

      requestDeleteCandidates(candidates);
      return true;
    }

    if (parsed.intent === "update_event") {
      const candidates = findBackendTargetEvents(parsed, events);
      const range = parseBackendDateRange(parsed);

      if (candidates.length === 0 || !range) {
        respond(parsed.reply);
        return true;
      }

      requestUpdateCandidates(candidates, range.start, range.end, parsed.reply);
      return true;
    }

    if (parsed.intent === "list_events" || parsed.intent === "find_free_time") {
      respond(parsed.reply);
      return true;
    }

    if (parsed.intent === "confirm" || parsed.intent === "cancel") {
      respond(parsed.reply);
      return true;
    }

    respond(parsed.reply);
    return true;
  }

  function requestDeleteCandidates(candidates: CalendarEvent[]) {
    const selectedIndex = candidates.length === 1 ? 0 : null;
    const summary =
      candidates.length === 1
        ? `确认删除「${candidates[0].title}」吗？删除后可以撤销最近一次操作。`
        : `找到 ${candidates.length} 个匹配日程，请先选择要删除的候选。`;

    setPendingAction({
      type: "delete_event",
      candidates,
      selectedIndex,
      summary
    });
    setLastReferencedEvent(candidates[0]);
    respond(
      candidates.length === 1
        ? `我找到了「${candidates[0].title}」，删除前需要你确认。`
        : `${summary} 可以说“第一个”或点击候选。`
    );
  }

  function requestUpdateCandidates(candidates: CalendarEvent[], start: Date, end: Date, reply?: string) {
    const selectedIndex = candidates.length === 1 ? 0 : null;
    const summary =
      candidates.length === 1
        ? `将「${candidates[0].title}」从 ${formatEventTime(candidates[0].start, candidates[0].end)} 改到 ${formatEventTime(
            start.toISOString(),
            end.toISOString()
          )}。`
        : `找到 ${candidates.length} 个匹配日程，请先选择要修改的候选。`;

    setPendingAction({
      type: "update_event",
      candidates,
      selectedIndex,
      start,
      end,
      summary
    });
    setLastReferencedEvent(candidates[0]);
    respond(candidates.length === 1 ? (reply ?? summary) : `${summary} 可以说“第一个”或点击候选。`);
  }

  function requestReminderUpdate(event: CalendarEvent, reminderMinutes: number) {
    setPendingAction({
      type: "update_event",
      candidates: [event],
      selectedIndex: 0,
      reminderMinutes,
      summary: `将「${event.title}」的提醒改为 ${formatReminder(reminderMinutes)}。`
    });
    setLastReferencedEvent(event);
    respond(`我会把「${event.title}」的提醒改为 ${formatReminder(reminderMinutes)}，请确认。`);
  }

  function selectPendingCandidate(index: number) {
    if (!pendingAction || pendingAction.type === "create_event") {
      respond("当前没有需要选择的候选。");
      return;
    }

    if (index < 0 || index >= pendingAction.candidates.length) {
      respond(`没有第 ${index + 1} 个候选，请重新选择。`);
      return;
    }

    const event = pendingAction.candidates[index];
    setPendingAction({
      ...pendingAction,
      selectedIndex: index,
      summary:
        pendingAction.type === "delete_event"
          ? `确认删除「${event.title}」吗？删除后可以撤销最近一次操作。`
          : pendingAction.reminderMinutes !== undefined
            ? `将「${event.title}」的提醒改为 ${formatReminder(pendingAction.reminderMinutes)}。`
            : `将「${event.title}」从 ${formatEventTime(event.start, event.end)} 改到 ${formatEventTime(
                pendingAction.start!.toISOString(),
                pendingAction.end!.toISOString()
              )}。`
    });
    setLastReferencedEvent(event);
    respond(`已选择第 ${index + 1} 个：「${event.title}」。请确认或取消。`);
  }

  function confirmPendingAction() {
    if (!pendingAction) {
      respond("当前没有待确认操作。");
      return;
    }

    if (pendingAction.type === "create_event") {
      const event = addEvent(pendingAction.event);
      setLastUndoAction({ type: "create_event", event });
      setLastReferencedEvent(event);
      respond(`已添加「${event.title}」，${formatEventTime(event.start, event.end)}。`);
    }

    if (pendingAction.type === "delete_event") {
      const event = getSelectedPendingEvent(pendingAction);
      if (!event) {
        respond("请先选择要删除的候选。");
        return;
      }

      deleteEvent(event.id);
      setLastUndoAction({ type: "delete_event", event });
      setLastReferencedEvent(event);
      respond(`已删除「${event.title}」。`);
    }

    if (pendingAction.type === "update_event") {
      const event = getSelectedPendingEvent(pendingAction);
      if (!event) {
        respond("请先选择要修改的候选。");
        return;
      }

      const updates: Partial<CalendarEvent> = {};
      if (pendingAction.start && pendingAction.end) {
        updates.start = pendingAction.start.toISOString();
        updates.end = pendingAction.end.toISOString();
      }
      if (pendingAction.reminderMinutes !== undefined) {
        updates.reminderMinutes = pendingAction.reminderMinutes;
      }

      setLastUndoAction({ type: "update_event", event });
      updateEvent(event.id, updates);
      setLastReferencedEvent({ ...event, ...updates });
      respond(`已修改「${event.title}」。`);
    }

    setPendingAction(null);
  }

  function cancelPendingAction() {
    setPendingAction(null);
    respond("已取消当前待确认操作。");
  }

  function requestDeleteEvent(event: CalendarEvent) {
    setPendingAction({
      type: "delete_event",
      candidates: [event],
      selectedIndex: 0,
      summary: `确认删除「${event.title}」吗？`
    });
    setLastReferencedEvent(event);
    respond(`删除「${event.title}」前需要确认。`);
  }

  function undoLastAction() {
    if (!lastUndoAction) {
      respond("当前没有可以撤销的操作。");
      return;
    }

    if (lastUndoAction.type === "create_event") {
      deleteEvent(lastUndoAction.event.id);
      respond(`已撤销新增「${lastUndoAction.event.title}」。`);
    }

    if (lastUndoAction.type === "delete_event") {
      restoreEvent(lastUndoAction.event);
      respond(`已恢复「${lastUndoAction.event.title}」。`);
    }

    if (lastUndoAction.type === "update_event") {
      updateEvent(lastUndoAction.event.id, lastUndoAction.event);
      respond(`已撤销对「${lastUndoAction.event.title}」的修改。`);
    }

    setLastUndoAction(null);
  }

  function exportEvents() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "voice-calendar-events.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Voice Calendar Agent</p>
          <h1>语音日历工作台</h1>
        </div>
        <div className="topbar-actions" aria-label="全局状态">
          <span className="status-pill">
            <Mic size={16} />
            {speechProvider === "local" ? "本地 Whisper" : "浏览器识别"} · {speech.statusLabel}
          </span>
          <span className="status-pill muted">
            <ShieldCheck size={16} />
            本地确认
          </span>
        </div>
      </header>

      <section className="workspace">
        <aside className="agent-panel" aria-label="语音 Agent 区">
          <section className="voice-card">
            <div className="voice-header">
              <div>
                <p className="section-kicker">语音主入口</p>
                <h2>说一句话管理日程</h2>
              </div>
              <span className="listening-dot">{speech.statusLabel}</span>
            </div>

            <div className="speech-mode-toggle" aria-label="语音识别模式">
              <button
                className={speechProvider === "browser" ? "selected" : ""}
                type="button"
                onClick={() => setSpeechProvider("browser")}
              >
                浏览器识别
              </button>
              <button
                className={speechProvider === "local" ? "selected" : ""}
                type="button"
                onClick={() => setSpeechProvider("local")}
              >
                本地 Whisper
              </button>
            </div>

            <button
              className="mic-button"
              type="button"
              disabled={!speech.isSupported}
              onClick={() => {
                warmUpSpeechSynthesis();
                if (speech.status === "listening") {
                  speech.stopListening();
                } else {
                  speech.startListening();
                }
              }}
            >
              <Mic size={34} />
              <span>{getMicButtonLabel(speech.isSupported, speech.status)}</span>
            </button>

            <div className="command-input">
              <input
                aria-label="文字指令兜底输入"
                placeholder="输入：明天下午三点开产品评审会..."
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    warmUpSpeechSynthesis();
                    handleCommand();
                  }
                }}
              />
              <button
                type="button"
                aria-label="发送指令"
                onClick={() => {
                  warmUpSpeechSynthesis();
                  handleCommand();
                }}
              >
                <Send size={18} />
              </button>
            </div>

            <div className="capability-row">
              <span>
                <Volume2 size={15} />
                语音播报
              </span>
              <span>
                <RotateCcw size={15} />
                {lastUndoAction ? "可撤销" : "无待撤销"}
              </span>
              <span>
                <Database size={15} />
                本地存储
              </span>
            </div>
          </section>

          <section className="conversation" aria-label="Agent 对话">
            <div className="section-title">
              <h2>Agent 确认区</h2>
              <span>{pendingAction ? "waiting confirm" : "ready"}</span>
            </div>
            <div className="message-list">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  {message.text}
                </article>
              ))}
            </div>

            <article className="confirmation-card">
              <div className="confirmation-title">
                <Check size={18} />
                {pendingAction ? "待确认操作" : "演示控制台"}
              </div>
              <dl>
                {pendingFields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              {pendingAction && pendingAction.type !== "create_event" && pendingAction.candidates.length > 1 ? (
                <div className="candidate-list" aria-label="候选日程">
                  {pendingAction.candidates.map((candidate, index) => (
                    <button
                      className={pendingAction.selectedIndex === index ? "candidate-option selected" : "candidate-option"}
                      type="button"
                      key={candidate.id}
                      onClick={() => selectPendingCandidate(index)}
                    >
                      <strong>{index + 1}. {candidate.title}</strong>
                      <span>{formatEventTime(candidate.start, candidate.end)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="confirmation-actions">
                {pendingAction ? (
                  <>
                    <button className="primary-button" type="button" onClick={confirmPendingAction}>
                      确认
                    </button>
                    <button className="secondary-button" type="button" onClick={cancelPendingAction}>
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <button className="primary-button" type="button" onClick={resetDemoEvents}>
                      填充演示数据
                    </button>
                    <button className="secondary-button" type="button" onClick={clearEvents}>
                      清空本地数据
                    </button>
                    <button className="secondary-button" type="button" onClick={exportEvents}>
                      导出 JSON
                    </button>
                  </>
                )}
              </div>
            </article>
          </section>
        </aside>

        <section className="calendar-panel" aria-label="日历视图">
          <div className="calendar-header">
            <div>
              <p className="section-kicker">Calendar Workspace</p>
              <h2>日历与日程</h2>
            </div>
            <button className="secondary-button" type="button" onClick={exportEvents}>
              <Download size={17} />
              导出 JSON
            </button>
          </div>

          <div className="summary-grid">
            <article>
              <CalendarDays size={20} />
              <strong>{monthEvents.length}</strong>
              <span>本月日程</span>
            </article>
            <article>
              <Bell size={20} />
              <strong>{reminderCount}</strong>
              <span>待提醒</span>
            </article>
            <article>
              <Clock3 size={20} />
              <strong>{tomorrowEvents.length}</strong>
              <span>明日安排</span>
            </article>
          </div>

          <section className="month-calendar" aria-label="月历">
            <div className="month-toolbar">
              <button
                className="icon-button"
                type="button"
                aria-label="上个月"
                onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <strong>{format(visibleMonth, "yyyy 年 M 月")}</strong>
                <span>{format(selectedDate, "M 月 d 日")} · {formatWeekdayLabel(selectedDate)}</span>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="下个月"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="secondary-button today-button"
                type="button"
                onClick={() => {
                  const today = startOfDay(new Date());
                  setSelectedDate(today);
                  setVisibleMonth(startOfMonth(today));
                }}
              >
                今天
              </button>
            </div>
            <div className="weekday-row" aria-hidden="true">
              {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
                <span key={weekday}>周{weekday}</span>
              ))}
            </div>
            <div className="month-grid">
              {calendarDays.map((date) => {
                const dayEvents = events.filter((event) => isSameDate(new Date(event.start), date));
                const inCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                const selected = isSameDate(date, selectedDate);
                return (
                  <button
                    className={[
                      "month-day",
                      inCurrentMonth ? "" : "muted",
                      selected ? "selected" : "",
                      isSameDate(date, new Date()) ? "today" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    key={date.toISOString()}
                    onClick={() => {
                      setSelectedDate(startOfDay(date));
                      setVisibleMonth(startOfMonth(date));
                    }}
                  >
                    <span className="day-number">{date.getDate()}</span>
                    {dayEvents.length > 0 ? <span className="event-count">{dayEvents.length}</span> : null}
                    <span className="day-event-title">{dayEvents[0]?.title ?? ""}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="event-list">
            <div className="section-title">
              <h2>{format(selectedDate, "M 月 d 日")}日程</h2>
              <span>{selectedDateEvents.length} 个安排</span>
            </div>
            {selectedDateEvents.length === 0 ? (
              <article className="empty-state">
                这一天没有日程。可以点击其他日期查看，或输入自然语言指令创建日程。
              </article>
            ) : (
              selectedDateEvents.map((event) => (
                <article className={`event-item ${event.type}`} key={event.id}>
                  <div>
                    <p>{formatDateLabel(new Date(event.start))}</p>
                    <h3>{event.title}</h3>
                    <span>{formatEventTime(event.start, event.end)}</span>
                  </div>
                  <div className="event-meta">
                    <span>{formatReminder(event.reminderMinutes)}</span>
                    <button type="button" aria-label={`删除 ${event.title}`} onClick={() => requestDeleteEvent(event)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="bottom-panel">
        <div>
          <p className="section-kicker">示例指令</p>
          <h2>用于快速验收的语音脚本</h2>
        </div>
        <div className="example-list">
          {examples.map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => {
                setCommand(example);
                handleCommand(example);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function getPendingFields(pendingAction: PendingAction | null) {
  if (!pendingAction) {
    return [
      { label: "当前能力", value: "文字指令 Agent" },
      { label: "持久化", value: "localStorage" },
      { label: "安全策略", value: "写入前确认" },
      { label: "验收状态", value: "阶段 6 测试与部署准备" }
    ];
  }

  if (pendingAction.type === "create_event") {
    const fields = [
      { label: "操作", value: "新增日程" },
      { label: "标题", value: pendingAction.event.title },
      {
        label: "时间",
        value: `${formatEventTime(pendingAction.event.start.toISOString(), pendingAction.event.end.toISOString())}`
      },
      { label: "提醒", value: formatReminder(pendingAction.event.reminderMinutes) }
    ];

    if (pendingAction.conflicts.length > 0) {
      fields.push({ label: "冲突", value: pendingAction.conflicts.map((event) => event.title).join("、") });
    }

    return fields;
  }

  if (pendingAction.type === "delete_event") {
    const event = getSelectedPendingEvent(pendingAction);
    return [
      { label: "操作", value: "删除日程" },
      { label: "候选", value: `${pendingAction.candidates.length} 个` },
      { label: "标题", value: event?.title ?? "待选择" },
      { label: "时间", value: event ? formatEventTime(event.start, event.end) : "待选择" },
      { label: "风险", value: "需要二次确认" }
    ];
  }

  const event = getSelectedPendingEvent(pendingAction);
  const duration =
    pendingAction.start && pendingAction.end ? differenceInMinutes(pendingAction.end, pendingAction.start) : null;

  return [
    { label: "操作", value: "修改日程" },
    { label: "候选", value: `${pendingAction.candidates.length} 个` },
    { label: "标题", value: event?.title ?? "待选择" },
    {
      label: pendingAction.start && pendingAction.end ? "新时间" : "提醒",
      value:
        pendingAction.start && pendingAction.end
          ? formatEventTime(pendingAction.start.toISOString(), pendingAction.end.toISOString())
          : formatReminder(pendingAction.reminderMinutes ?? 10)
    },
    { label: "时长", value: duration === null ? "不变" : `${duration} 分钟` }
  ];
}

function getMicButtonLabel(isSupported: boolean, status: string) {
  if (!isSupported) {
    return "请使用文字输入";
  }

  if (status === "listening") {
    return "点击停止录音";
  }

  if (status === "transcribing") {
    return "正在本地识别";
  }

  if (status === "error") {
    return "重试语音输入";
  }

  return "点击开始录音";
}

function getSelectedPendingEvent(
  pendingAction: Extract<PendingAction, { type: "delete_event" | "update_event" }>
) {
  if (pendingAction.selectedIndex === null) {
    return null;
  }

  return pendingAction.candidates[pendingAction.selectedIndex] ?? null;
}

function parseCandidateChoice(text: string) {
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

function isReferenceCommand(text: string) {
  return /它|这个|那个|刚才|刚刚|上一个|前一个/.test(text);
}

function isReminderOnlyCommand(text: string) {
  return /提醒/.test(text) && !/添加|创建|安排|开.+会/.test(text);
}

function parseReminderMinutesFromText(text: string) {
  const match = text.match(/提前([0-9]{1,3}|[零一二两三四五六七八九十]{1,3})(分钟|小时)/);
  if (!match) {
    return null;
  }

  const value = parseChineseNumber(match[1]);
  return match[2] === "小时" ? value * 60 : value;
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

function getMonthCalendarDays(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  let cursor = start;

  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
}

function isSameMonth(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

function isSameDate(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatWeekdayLabel(date: Date) {
  return `周${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}`;
}

function findConflictingEvents(start: Date, end: Date, events: CalendarEvent[]) {
  const startTime = start.getTime();
  const endTime = end.getTime();

  return events.filter((event) => {
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    return startTime < eventEnd && endTime > eventStart;
  });
}

function formatListReply(events: CalendarEvent[], fallback: string) {
  if (events.length === 0) {
    return fallback;
  }

  return events
    .map((event, index) => `${index + 1}. ${event.title}，${formatEventTime(event.start, event.end)}`)
    .join("\n");
}

function formatFreeTimeReply(slots: { start: Date; end: Date }[], fallback: string) {
  if (slots.length === 0) {
    return fallback;
  }

  return slots
    .map(
      (slot, index) =>
        `${index + 1}. ${formatEventTime(slot.start.toISOString(), slot.end.toISOString()).replace("今天 ", "")}`
    )
    .join("\n");
}
