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

type CalendarEvent = {
  id: string;
  title: string;
  time: string;
  dateLabel: string;
  reminder: string;
  type: "meeting" | "focus" | "personal";
};

type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
};

const demoEvents: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "产品评审会",
    time: "明天 15:00 - 16:00",
    dateLabel: "明天",
    reminder: "提前 10 分钟",
    type: "meeting"
  },
  {
    id: "evt-2",
    title: "项目复盘",
    time: "今天 20:00 - 20:30",
    dateLabel: "今天",
    reminder: "准时提醒",
    type: "focus"
  },
  {
    id: "evt-3",
    title: "设计团队同步",
    time: "周一 10:00 - 11:00",
    dateLabel: "本周",
    reminder: "提前 30 分钟",
    type: "meeting"
  }
];

const messages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    text: "我可以帮你用语音添加、查看、修改和删除日程。第一版会在执行前展示确认。"
  },
  {
    id: "msg-2",
    role: "user",
    text: "明天下午三点开产品评审会，提前十分钟提醒我。"
  },
  {
    id: "msg-3",
    role: "agent",
    text: "已理解为：明天 15:00 到 16:00 的产品评审会，提前 10 分钟提醒。请确认。"
  }
];

const examples = [
  "明天下午三点开产品评审会，提前十分钟提醒我",
  "我明天有什么安排",
  "把产品评审会改到下午四点",
  "删除明天的产品评审会",
  "明天下午我什么时候有空"
];

export function App() {
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
              />
              <button type="button" aria-label="发送指令">
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
              <span>pending action</span>
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
                待确认操作
              </div>
              <dl>
                <div>
                  <dt>操作</dt>
                  <dd>新增日程</dd>
                </div>
                <div>
                  <dt>标题</dt>
                  <dd>产品评审会</dd>
                </div>
                <div>
                  <dt>时间</dt>
                  <dd>明天 15:00 - 16:00</dd>
                </div>
                <div>
                  <dt>提醒</dt>
                  <dd>提前 10 分钟</dd>
                </div>
              </dl>
              <div className="confirmation-actions">
                <button className="primary-button" type="button">
                  确认
                </button>
                <button className="secondary-button" type="button">
                  取消
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
              <strong>3</strong>
              <span>本周日程</span>
            </article>
            <article>
              <Bell size={20} />
              <strong>2</strong>
              <span>待提醒</span>
            </article>
            <article>
              <Clock3 size={20} />
              <strong>1</strong>
              <span>明日会议</span>
            </article>
          </div>

          <div className="calendar-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((day, index) => (
              <article className={index === 5 ? "day-card active" : "day-card"} key={day}>
                <span>周{day}</span>
                <strong>{30 + index}</strong>
              </article>
            ))}
          </div>

          <div className="event-list">
            <div className="section-title">
              <h2>事件列表</h2>
              <span>localStorage ready</span>
            </div>
            {demoEvents.map((event) => (
              <article className={`event-item ${event.type}`} key={event.id}>
                <div>
                  <p>{event.dateLabel}</p>
                  <h3>{event.title}</h3>
                  <span>{event.time}</span>
                </div>
                <div className="event-meta">
                  <span>{event.reminder}</span>
                  <button type="button" aria-label={`删除 ${event.title}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
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
            <button type="button" key={example}>
              {example}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
