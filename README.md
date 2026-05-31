# XEngineer Voice Driven Calendar

语音日历 Agent：一个以语音交互为核心的日历管理工具，帮助用户用自然语言完成添加、查看、修改、删除日程、提醒设置和 ICS 日历导入导出。

## 评委速览

一句话概括：

```text
这是一个本地优先、LLM 增强、状态机驱动、带评测和安全校验的语音日历 Agent。
```

当前版本已经不是简单的日历 CRUD Demo，而是围绕“语音输入如何可信地变成日历操作”做了完整工程闭环：

- 产品闭环：语音 / 文字输入、中文自然语言解析、结构化确认、日历增删改查、月历视图、本地持久化。
- Agent 可信：新增、修改、删除都先进入确认状态机；删除和外部导入事件修改仍需确认。
- 多轮上下文：支持“提醒也提前十五分钟”“把地点改成 A 楼”“刚才那个取消”“改成明天下午”等省略表达。
- 安全校验：前端 deterministic validator 和后端 schema / 语义 validator 都会拦截非法或不安全结果。
- 语音质量：浏览器识别作为默认演示路径，本地 Whisper 作为可选能力；低置信度或纠错后的本地 ASR 会先让用户确认。
- 真实日历交换：支持 ICS 导出 / 导入、外部事件来源标识、重复事件跳过和导入诊断。
- 工程验证：前端 7 个测试文件、104 个测试用例；解析评测集 55 条；后端 14 个 validator / API 测试。

## 项目目标

本项目面向「语音版的日历工具」题目，目标是在一天内开发上线一个可演示、可使用的 Agent 应用。

核心体验：

```text
语音 / 文字输入
-> 本地规则解析，必要时 DeepSeek 兜底
-> deterministic validator 校验
-> Agent 状态机展示结构化确认
-> 执行日历增删改查 / ICS 导入导出
-> 日历视图实时更新
-> 本地持久化与语音反馈
```

第一版优先保证完整闭环和可信执行，不把用户登录、云数据库、Google / Outlook OAuth、独立后台系统作为硬依赖。

## 评审规则对齐

### 作品完整度与创新性，40%

产品设计重点：

- 语音是主入口，文字输入是兜底。
- 支持自然语言添加、删除、查看、修改日程。
- 支持提醒解析、确认、追问、撤销和冲突提示。
- 支持多轮上下文省略表达和候选纠正。
- 支持 ICS 导入导出，导入事件带来源标识。
- 页面不是普通聊天框，而是「语音 Agent + 日历工作台」。
- 所有写操作先确认，保证日历工具的可信度。

### 开发过程与质量，40%

工程设计重点：

- 文档先行，先明确产品、架构、资源、风险、测试和运维设计。
- 采用前端优先的最小可上线架构。
- 核心逻辑模块化：Agent、日历数据层、语音层、存储层、UI 层分离。
- 本地规则解析作为基础能力，AI 解析作为可插拔增强。
- 通过测试清单覆盖中文时间解析、意图识别、确认状态机、Memory、validator、语音纠错和 ICS 交换。

### 演示与表达，20%

标准演示路径：

1. 语音添加：「明天下午三点开产品评审会，提前十分钟提醒我。」
2. 语音查看：「我明天有什么安排？」
3. 语音修改：「把产品评审会改到下午四点。」
4. 语音删除：「删除明天的产品评审会。」
5. 多轮上下文：「提醒也提前十五分钟」「把地点改成 A 楼」「刚才那个取消」。
6. 展示确认机制、日历联动、ICS 导入导出、语音失败时的文字兜底。

## 推荐技术栈

- React + Vite + TypeScript
- 自定义 CSS 工作台样式
- date-fns
- lucide-react
- Web Speech API
- SpeechSynthesis API
- localStorage
- ICS / iCalendar
- Vitest
- 可选：FastAPI AI / ASR 代理

## 已实现能力

### 用户体验

- 浏览器语音识别和文字输入兜底。
- 中文自然语言新增日程，例如“明天下午三点开产品评审会，提前十分钟提醒我”。
- 查询日程，例如“我明天有什么安排”“下周工作日有什么安排”。
- 修改日程，例如“把产品评审会改到下午四点”。
- 删除日程和最近一次操作撤销。
- 冲突提示、空闲时间查询、语音播报、月历视图和日程列表。
- ICS 导入 / 导出，导入事件显示“ICS”，本地事件显示“本地”。

### Agent 工程

- `src/agent/agentStateMachine.ts`：把待确认动作、候选选择、取消、确认、撤销从 UI 中抽离。
- `src/agent/agentMemory.ts`：短期 Memory 保存最近意图、最近提到日程、候选列表和选中事件。
- `src/agent/commandValidator.ts`：所有解析结果进入确认卡片前先做 deterministic validation。
- `src/agent/commandParser.evaluation.test.ts`：55 条中文口语评测集输出 intent / slot / fallback / unsafe 指标。
- `src/speech/speechCorrection.ts`：语音热词纠错和低置信度确认策略。
- `src/calendar/ics.ts`：ICS 导入导出、重复检测所需外部 ID、无效事件诊断。

### 后端增强

- FastAPI 作为可选后端，不影响纯前端主路径。
- `POST /api/parse-command`：DeepSeek 日历意图 JSON 解析代理。
- `POST /api/asr`：本地 `faster-whisper` 语音转文字。
- 后端输出经过 schema 和语义 validator；非法 JSON、缺目标删除、非法时间会降级或拒绝，不直接进入执行链路。

## 本地运行

```bash
npm install
npm run dev
```

构建和测试：

```bash
npm run build
npm run test
npm run eval:parser
conda run -n base python -m unittest discover -s backend\tests -p "test_*.py"
```

预览生产包：

```bash
npm run build
npm run preview
```

开发服务默认运行在：

```text
http://127.0.0.1:5173
```

## 可选后端增强

后端只做两件事：保护 DeepSeek Key 并提供本地免费语音识别接口；日历写入仍由前端确认后执行。

先复制环境变量示例：

```bash
copy .env.example .env.local
```

把轮换后的 DeepSeek Key 写入 `.env.local`：

```text
DEEPSEEK_API_KEY=your_rotated_key
DEEPSEEK_MODEL=deepseek-v4-flash
VITE_API_BASE_URL=http://localhost:8000
```

启动后端：

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

接口：

- `POST /api/parse-command`：DeepSeek 日历意图 JSON 解析。
- `POST /api/asr`：`faster-whisper` 本地语音转文字。
- `GET /api/health`：健康检查。

前端默认仍使用本地规则解析。只有配置了 `VITE_API_BASE_URL`，并且本地规则返回 `unknown` 时，才会调用后端 DeepSeek 兜底。

ASR 默认使用 CPU，适合本机稳定演示：

```text
ASR_MODEL=base
ASR_DEVICE=cpu
ASR_COMPUTE_TYPE=int8
ASR_MAX_CONCURRENT=1
```

如果部署到 CUDA 12.x / cuDNN 环境可用的 NVIDIA GPU 主机，可以切换为 GPU：

```text
ASR_MODEL=small
ASR_DEVICE=cuda
ASR_COMPUTE_TYPE=float16
ASR_MAX_CONCURRENT=1
```

GPU 版本建议先从 `base` 或 `small` 试起。`medium` 及以上模型会显著增加显存和延迟压力，不建议作为默认演示配置。

生产预览默认运行在：

```text
http://127.0.0.1:4173
```

## 部署

本项目是纯前端静态应用，可以部署到 Vercel、Netlify、Cloudflare Pages 或任意静态文件服务器。

推荐配置：

- Build command：`npm run build`
- Output directory：`dist`
- Node.js：建议使用 20 LTS

如果使用静态服务器，执行 `npm run build` 后发布 `dist/` 目录即可。

完整部署说明见 [docs/19-部署说明.md](./docs/19-部署说明.md)。

部署注意事项：

- 默认演示路径使用浏览器语音识别。
- 本地 Whisper 只作为可选模式，不作为线上静态部署硬依赖。
- `.env`、`.env.local` 不能提交，真实 DeepSeek Key 只能留在本机或后端运行环境。
- 静态生产站不要把 API Key 写入 `VITE_` 前缀变量。

## 录制视频建议

推荐录制 4 到 5 分钟，不要拍成普通功能流水账。重点证明三件事：

- 用户体验完整：自然语言输入可以稳定落到日历操作。
- Agent 可信：写操作不会被模型或解析器直接执行，必须确认。
- 工程质量可验证：测试、评测集、validator、Memory 和 ICS 交换都有实现。

推荐主路径：

```text
清空本地数据
-> 明天下午三点开产品评审会，提前十分钟提醒我
-> 确认新增
-> 我明天有什么安排
-> 把产品评审会改到下午四点
-> 明天下午四点半安排一个设计评审，展示冲突后取消
-> 提醒也提前十五分钟
-> 把地点改成 A 楼
-> 删除明天的产品评审会，确认后撤销
-> 导出 ICS，再说明可导入外部 ICS
-> 展示测试和评测结果
```

录制前建议先跑：

```bash
npm run test
npm run eval:parser
npm run build
conda run -n base python -m unittest discover -s backend\tests -p "test_*.py"
```

录制时不要展示 `.env`、`.env.local` 或任何真实 API Key。如果语音识别现场波动，直接用文字输入录主路径，旁白说明语音是主入口、文字是稳定兜底。

## 第一版功能范围

P0 必做：

- 语音 / 文字指令输入。
- 中文日程指令解析。
- 添加、查看、修改、删除事件。
- 写操作确认。
- 删除二次确认。
- 今日 / 本周日历视图。
- localStorage 持久化。

P1 加分：

- 语音播报。
- 冲突检测。
- 撤销最近操作。
- 空闲时间查询。
- 一键演示数据。

已完成的加分项：

- ICS 导出。
- ICS 导入和外部来源标识。
- 解析器评测集。
- 多轮 Memory。
- 语音纠错。
- 后端 DeepSeek / ASR 可选增强。

P2 后续：

- Google Calendar / Outlook 同步。
- 用户登录和云端同步。
- 后台管理系统。
- 智能排期和真实提醒任务。

## 文档索引

项目设计文档见 [docs/README.md](./docs/README.md)。

核心文档：

- [00-项目题目](./docs/00-项目题目.md)
- [01-开发计划](./docs/01-开发计划.md)
- [03-技术选型](./docs/03-技术选型.md)
- [04-项目重难点分析](./docs/04-项目重难点分析.md)
- [05-前端设计文档](./docs/05-前端设计文档.md)
- [06-后端设计文档](./docs/06-后端设计文档.md)
- [08-测试设计文档](./docs/08-测试设计文档.md)
- [12-演示脚本](./docs/12-演示脚本.md)
- [20-演示视频方案](./docs/20-演示视频方案.md)
- [21-演示视频拍摄执行方案](./docs/21-演示视频拍摄执行方案.md)

## 开发策略

一天内开发建议按以下顺序：

```text
项目初始化
-> 静态工作台 UI
-> 本地日历 CRUD
-> 文字指令 Agent
-> 确认 / 追问状态机
-> 语音识别
-> 语音播报
-> 冲突检测 / 撤销
-> 测试和部署
```

关键原则：

- 先打通文字指令闭环，再接语音。
- 先保证日历状态正确，再追求复杂 Agent 能力。
- AI 解析可以增强，但不能成为唯一可用路径。
- 现场演示必须有文字输入兜底。

## 当前状态

当前仓库已经完成可录制演示的 Agent 版本：

- 已完成题目分析。
- 已完成开发计划。
- 已完成前端、后端、测试、运维设计。
- 已完成风险预案和演示脚本。
- 已新增演示视频方案和拍摄执行方案。
- 已初始化 React + Vite + TypeScript 前端项目。
- 已实现语音日历工作台首屏。
- 已实现 localStorage 日历事件存储。
- 已实现文字指令 Agent 初版。
- 已接入浏览器语音识别和语音播报。
- 已实现写操作确认、冲突提示、最近一次操作撤销和 JSON 导出。
- 已实现空闲时间查询。
- 已新增可选 FastAPI 后端：DeepSeek 意图解析代理与 `faster-whisper` 本地 ASR。
- 已抽取 Agent 状态机，覆盖待确认动作、多候选选择、取消和确认执行结果。
- 已建立解析器评测集，覆盖新增、查询、修改、删除、空闲时间、下周范围、安全候选和降级输入。
- 已完成浏览器端文字兜底演示路径回归：新增、查询、修改、冲突、删除、撤销均通过。
- 已接入 deterministic validator，本地规则和 DeepSeek 兜底输出进入确认卡片前都会校验时间、提醒和候选安全性。
- 后端 DeepSeek JSON 输出已接入 deterministic schema validator，非法结构会降级为 `unknown` 追问，不直接返回给前端执行链路。
- 已新增短期 Agent Memory，支持最近日程引用、多候选记忆、候选纠正、提醒省略修改、地点省略修改和“刚才那个取消”。
- 已支持“改成明天下午 / 改到后天 / 改到下周三下午四点半”这类上下文时间修改。
- 已新增语音纠错层和本地 ASR 低置信度确认。
- 已实现 ICS 导入导出、外部来源标识、重复跳过和导入诊断。
- `npm run test` 通过，7 个测试文件、104 个测试用例。
- `conda run -n base python -m unittest discover -s backend\tests -p "test_*.py"` 通过，14 个后端 validator / API 测试。
- `npm run eval:parser` 可输出解析器指标：55 cases，intent accuracy 100%，slot accuracy 100%，fallback rate 100%，unsafe action rate 0%。
- `npm run build` 通过。
