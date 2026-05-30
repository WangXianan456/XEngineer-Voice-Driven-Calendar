import { useState } from "react";
import { addDays, set } from "date-fns";
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
import { useCalendarEvents } from "./calendar/useCalendarEvents";
import { formatDateLabel, formatEventTime, formatReminder } from "./utils/dateFormat";

type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
};

const examples = [
  "明天下午三点开产品评审会，提前十分钟提醒我",
  "我明天有什么安排",
  "把产品评审会改到下午四点",
  "删除明天的产品评审会",
  "明天下午我什么时候有空"
];

const initialMessages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    text: "我可以帮你用语音添加、查看、修改和删除日程。当前阶段已接入本地日历数据层。"
  }
];

export function App() {
  const { events, addEvent, deleteEvent, resetDemoEvents, clearEvents } = useCalendarEvents();
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages);

  const todayEvents = events.filter((event) => formatDateLabel(new Date(event.start)) === "今天");
  const tomorrowEvents = events.filter((event) => formatDateLabel(new Date(event.start)) === "明天");
  const reminderCount = events.filter((event) => event.reminderMinutes > 0).length;

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

  function handleCreateDemoCommand(text = command) {
    const trimmed = text.trim();

    if (!trimmed) {
      appendMessage("agent", "请输入一条日程指令，或点击下方示例指令。");
      return;
    }

    appendMessage("user", trimmed);

    const tomorrow = addDays(new Date(), 1);
    const event = addEvent({
      title: "产品评审会",
      start: set(tomorrow, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 }),
      end: set(tomorrow, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 }),
      reminderMinutes: 10,
      sourceText: trimmed,
      type: "meeting"
    });

    appendMessage(
      "agent",
      `已创建演示日程：「${event.title}」，${formatEventTime(event.start, event.end)}，${formatReminder(
        event.reminderMinutes
      )}。下一阶段会替换为真实中文指令解析和确认流程。`
    );
    setCommand("");
  }

  function handleDeleteEvent(eventId: string, title: string) {
    const confirmed = window.confirm(`确认删除「${title}」吗？后续会替换为 Agent 二次确认。`);

    if (!confirmed) {
      return;
    }

    deleteEvent(eventId);
    appendMessage("agent", `已删除「${title}」。`);
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
            Chrome 语音优先
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
              <span className="listening-dot">待命</span>
            </div>

            <button className="mic-button" type="button">
              <Mic size={34} />
              <span>按住说话</span>
            </button>

            <div className="command-input">
              <input
                aria-label="文字指令兜底输入"
                placeholder="也可以输入：明天下午三点开产品评审会..."
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleCreateDemoCommand();
                  }
                }}
              />
              <button type="button" aria-label="发送指令" onClick={() => handleCreateDemoCommand()}>
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
              <span>data layer ready</span>
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
                下一阶段确认流
              </div>
              <dl>
                <div>
                  <dt>当前能力</dt>
                  <dd>本地事件 CRUD</dd>
                </div>
                <div>
                  <dt>持久化</dt>
                  <dd>localStorage</dd>
                </div>
                <div>
                  <dt>下一步</dt>
                  <dd>指令解析</dd>
                </div>
                <div>
                  <dt>安全策略</dt>
                  <dd>写入前确认</dd>
                </div>
              </dl>
              <div className="confirmation-actions">
                <button className="primary-button" type="button" onClick={resetDemoEvents}>
                  填充演示数据
                </button>
                <button className="secondary-button" type="button" onClick={clearEvents}>
                  清空本地数据
                </button>
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
                当前没有日程。可以点击「填充演示数据」，或输入任意文字创建演示日程。
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
                    <button type="button" aria-label={`删除 ${event.title}`} onClick={() => handleDeleteEvent(event.id, event.title)}>
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
                handleCreateDemoCommand(example);
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
