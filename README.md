# XEngineer Voice Driven Calendar

语音日历 Agent：一个以语音交互为核心的日历管理工具，帮助用户用自然语言完成添加、查看、修改、删除日程和提醒设置。

## 项目目标

本项目面向「语音版的日历工具」题目，目标是在一天内开发上线一个可演示、可使用的 Agent 应用。

核心体验：

```text
语音 / 文字输入
-> Agent 理解中文日程指令
-> 展示结构化确认
-> 执行日历增删改查
-> 日历视图实时更新
-> 本地持久化与语音反馈
```

第一版优先保证完整闭环，不把用户登录、云数据库、第三方日历同步、独立后台系统作为硬依赖。

## 评审规则对齐

### 作品完整度与创新性，40%

产品设计重点：

- 语音是主入口，文字输入是兜底。
- 支持自然语言添加、删除、查看、修改日程。
- 支持提醒解析、确认、追问、撤销和冲突提示。
- 页面不是普通聊天框，而是「语音 Agent + 日历工作台」。
- 所有写操作先确认，保证日历工具的可信度。

### 开发过程与质量，40%

工程设计重点：

- 文档先行，先明确产品、架构、资源、风险、测试和运维设计。
- 采用前端优先的最小可上线架构。
- 核心逻辑模块化：Agent、日历数据层、语音层、存储层、UI 层分离。
- 本地规则解析作为基础能力，AI 解析作为可插拔增强。
- 通过测试清单覆盖中文时间解析、意图识别、确认状态机和日历 CRUD。

### 演示与表达，20%

标准演示路径：

1. 语音添加：「明天下午三点开产品评审会，提前十分钟提醒我。」
2. 语音查看：「我明天有什么安排？」
3. 语音修改：「把产品评审会改到下午四点。」
4. 语音删除：「删除明天的产品评审会。」
5. 展示确认机制、日历联动、语音失败时的文字兜底。

## 推荐技术栈

- React + Vite + TypeScript
- Tailwind CSS
- date-fns
- lucide-react
- Web Speech API
- SpeechSynthesis API
- localStorage
- Vitest
- 可选：FastAPI AI / ASR 代理

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

P2 后续：

- ICS 导出。
- Google Calendar / Outlook 同步。
- 用户登录和云端同步。
- 后台管理系统。

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

当前仓库处于 MVP 开发阶段：

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
- `npm run test` 通过，5 个测试文件、90 个测试用例。
- `conda run -n base python -m unittest discover -s backend\tests -p "test_*.py"` 通过，14 个后端 validator / API 测试。
- `npm run eval:parser` 可输出解析器指标：55 cases，intent accuracy 100%，slot accuracy 100%，fallback rate 100%，unsafe action rate 0%。
- `npm run build` 通过。
