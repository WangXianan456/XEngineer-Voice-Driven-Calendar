import { useMemo, useState } from "react";
import { addDays, differenceInMinutes } from "date-fns";
import {
  Bell,
  CalendarDays,
  Check,
  Clock3,
  Mic,
  PanelRightOpen,
  RotateCcw,
  Send,
  Settings,
  Trash2,
  Volume2
} from "lucide-react";
import { parseCalendarCommand } from "./agent/commandParser";
import type { CalendarEvent, CreateCalendarEventInput } from "./calendar/eventTypes";
import { useCalendarEvents } from "./calendar/useCalendarEvents";
import { speak } from "./speech/synthesis";
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
      summary: string;
    }
  | {
      type: "delete_event";
      event: CalendarEvent;
      summary: string;
    }
  | {
      type: "update_event";
      event: CalendarEvent;
      start: Date;
      end: Date;
      summary: string;
    };

const examples = [
  "明天下午三点开产品评审会，提前十分钟提醒我",
  "我明天有什么安排",
  "把产品评审会改到下午四点",
  "删除明天的产品评审会",
  "今天晚上八点提醒我复盘项目"
];

const initialMessages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    text: "我可以帮你用文字或语音管理日程。当前已支持文字指令解析，写入类操作会先确认。"
  }
];

export function App() {
  const { events, addEvent, deleteEvent, updateEvent, resetDemoEvents, clearEvents } = useCalendarEvents();
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const speech = useSpeechRecognition((text) => {
    setCommand(text);
    handleCommand(text);
  });

  const todayEvents = events.filter((event) => formatDateLabel(new Date(event.start)) === "今天");
  const tomorrowEvents = events.filter((event) => formatDateLabel(new Date(event.start)) === "明天");
  const reminderCount = events.filter((event) => event.reminderMinutes > 0).length;
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

  function handleCommand(text = command) {
    const trimmed = text.trim();

    if (!trimmed) {
      respond("请输入一条日程指令，或点击下方示例指令。");
      return;
    }

    appendMessage("user", trimmed);

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

    const parsed = parseCalendarCommand(trimmed, events);

    if (parsed.intent === "create_event") {
      setPendingAction({
        type: "create_event",
        event: parsed.event,
        summary: parsed.reply
      });
      respond(parsed.reply);
    }

    if (parsed.intent === "list_events") {
      appendMessage("agent", formatListReply(parsed.events, parsed.reply));
    }

    if (parsed.intent === "delete_event") {
      if (parsed.candidates.length === 0) {
        respond(parsed.reply);
      } else {
        const event = parsed.candidates[0];
        setPendingAction({
          type: "delete_event",
          event,
          summary: `确认删除「${event.title}」吗？删除后下一阶段会支持撤销。`
        });
        respond(`我找到了「${event.title}」，删除前需要你确认。`);
      }
    }

    if (parsed.intent === "update_event") {
      if (parsed.candidates.length === 0 || !parsed.start || !parsed.end) {
        respond(parsed.reply);
      } else {
        const event = parsed.candidates[0];
        setPendingAction({
          type: "update_event",
          event,
          start: parsed.start,
          end: parsed.end,
          summary: `将「${event.title}」从 ${formatEventTime(event.start, event.end)} 改到 ${formatEventTime(
            parsed.start.toISOString(),
            parsed.end.toISOString()
          )}。`
        });
        respond(parsed.reply);
      }
    }

    if (parsed.intent === "unknown") {
      respond(parsed.reply);
    }

    setCommand("");
  }

  function confirmPendingAction() {
    if (!pendingAction) {
      respond("当前没有待确认操作。");
      return;
    }

    if (pendingAction.type === "create_event") {
      const event = addEvent(pendingAction.event);
      respond(`已添加「${event.title}」，${formatEventTime(event.start, event.end)}。`);
    }

    if (pendingAction.type === "delete_event") {
      deleteEvent(pendingAction.event.id);
      respond(`已删除「${pendingAction.event.title}」。`);
    }

    if (pendingAction.type === "update_event") {
      updateEvent(pendingAction.event.id, {
        start: pendingAction.start.toISOString(),
        end: pendingAction.end.toISOString()
      });
      respond(`已修改「${pendingAction.event.title}」的时间。`);
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
      event,
      summary: `确认删除「${event.title}」吗？`
    });
    respond(`删除「${event.title}」前需要确认。`);
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
            {speech.statusLabel}
          </span>
          <button className="icon-button" type="button" aria-label="打开演示控制台">
            <Settings size={18} />
          </button>
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

            <button
              className="mic-button"
              type="button"
              disabled={!speech.isSupported}
              onClick={speech.status === "listening" ? speech.stopListening : speech.startListening}
            >
              <Mic size={34} />
              <span>{speech.isSupported ? "点击说话" : "请使用 Chrome 或文字输入"}</span>
            </button>

            <div className="command-input">
              <input
                aria-label="文字指令兜底输入"
                placeholder="输入：明天下午三点开产品评审会..."
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCommand();
                  }
                }}
              />
              <button type="button" aria-label="发送指令" onClick={() => handleCommand()}>
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
                可撤销
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
              <h2>今日与本周安排</h2>
            </div>
            <button className="secondary-button" type="button">
              <PanelRightOpen size={17} />
              演示控制台
            </button>
          </div>

          <div className="summary-grid">
            <article>
              <CalendarDays size={20} />
              <strong>{events.length}</strong>
              <span>本地日程</span>
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

          <div className="calendar-grid">
            {Array.from({ length: 7 }, (_, index) => {
              const date = addDays(new Date(), index);
              return (
                <article className={index === 0 ? "day-card active" : "day-card"} key={date.toISOString()}>
                  <span>{formatDateLabel(date)}</span>
                  <strong>{date.getDate()}</strong>
                </article>
              );
            })}
          </div>

          <div className="event-list">
            <div className="section-title">
              <h2>事件列表</h2>
              <span>{todayEvents.length} 个今日安排</span>
            </div>
            {events.length === 0 ? (
              <article className="empty-state">
                当前没有日程。可以点击「填充演示数据」，或输入自然语言指令创建日程。
              </article>
            ) : (
              events.map((event) => (
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
      { label: "下一步", value: "语音识别" }
    ];
  }

  if (pendingAction.type === "create_event") {
    return [
      { label: "操作", value: "新增日程" },
      { label: "标题", value: pendingAction.event.title },
      {
        label: "时间",
        value: `${formatEventTime(pendingAction.event.start.toISOString(), pendingAction.event.end.toISOString())}`
      },
      { label: "提醒", value: formatReminder(pendingAction.event.reminderMinutes) }
    ];
  }

  if (pendingAction.type === "delete_event") {
    return [
      { label: "操作", value: "删除日程" },
      { label: "标题", value: pendingAction.event.title },
      { label: "时间", value: formatEventTime(pendingAction.event.start, pendingAction.event.end) },
      { label: "风险", value: "需要二次确认" }
    ];
  }

  const duration = differenceInMinutes(pendingAction.end, pendingAction.start);

  return [
    { label: "操作", value: "修改日程" },
    { label: "标题", value: pendingAction.event.title },
    { label: "新时间", value: formatEventTime(pendingAction.start.toISOString(), pendingAction.end.toISOString()) },
    { label: "时长", value: `${duration} 分钟` }
  ];
}

function formatListReply(events: CalendarEvent[], fallback: string) {
  if (events.length === 0) {
    return fallback;
  }

  return events
    .map((event, index) => `${index + 1}. ${event.title}，${formatEventTime(event.start, event.end)}`)
    .join("\n");
}
