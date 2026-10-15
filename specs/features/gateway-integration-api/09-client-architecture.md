# 09 星途客户端架构与维护说明

本篇说明 shilijia-agent 现在如何接入 maas 平台、插件和对话链路如何运转，供维护时定位代码。结论来自 2026-10-14 阅读源码，未做运行验证的地方单独标注。

## 1. 总体结构

| 层 | 位置 | 职责 |
| --- | --- | --- |
| Renderer（React） | `src/renderer/` | 界面、登录表单、账户/套餐弹窗、对话界面 |
| Preload | `src/main/preload.ts` | 通过 `contextBridge` 暴露 `window.electron.*`，每个方法对应一个 IPC 通道 |
| Main（Electron 主进程） | `src/main/main.ts` 及 `src/main/libs/` | 账户、配置、存储、启动 OpenClaw、回调服务、IPC 处理 |
| OpenClaw 运行时 | `../openclaw`（固定版本，见 `package.json` → `openclaw.version`） | 唯一的智能体运行时：模型调用、工具、插件、技能、MCP |
| 共享代码 | `src/shared/` | main 与 renderer 共用的类型、常量、解析函数 |

命名说明：`Cowork` 是星途的会话/产品层（会话、消息、权限、本地存储），`cowork:*` IPC 通道是历史名称；`Lobster*` / `lobsterai-*` 是上游 LobsterAI 的遗留名称，涉及协议和持久化数据时不能机械改名。

## 2. 平台接入现状（核心）

客户端与 maas 平台有**三条独立的链路**，凭据互不复用：

```
┌──────────────┐  ① 账户链路：Refresh Cookie + 内存 JWT
│  maasAuth.ts │ ──► /api/user/auth/refresh|logout, /api/user/login*, /api/status,
└──────────────┘     /api/user/self, /api/subscription/plans|self
┌──────────────┐  ② 模型链路：用户手填的 sk- 密钥
│ OpenClaw     │ ──► https://gateway.ai.shilijia.xyz/v1 （OpenAI 格式）
└──────────────┘
┌──────────────┐  ③ 旧链路（LobsterAI 服务端，未接 maas）
│ main.ts 媒体 │ ──► ${apiBaseUrl}/api/media/*, /api/models/available, /api/auth/* ...
└──────────────┘     apiBaseUrl 在 product.json 中为空
```

### 2.1 账户链路（已接入）

- 入口：`src/main/libs/maasAuth.ts`，在 `main.ts:4967` 通过 `registerMaasAuth(() => mainWindow)` 注册。
- 平台地址固定为 `DEFAULT_MAAS_ORIGIN = 'https://gateway.ai.shilijia.xyz'`（`src/shared/auth/maas.ts`），主进程拒绝其他 origin。
- IPC 通道（`MaasIpc`）：

| 通道 | 平台请求 | 作用 |
| --- | --- | --- |
| `maas:status` | `GET /api/status` | 获取可用登录方式（密码、短信、Turnstile） |
| `maas:sendSMS` | `POST /api/user/login/sms/code` | 获取短信挑战 `challenge_token` |
| `maas:login` | `POST /api/user/login` / `login/sms` / `login/2fa` | 密码、短信、两步验证登录 |
| `maas:openLogin` | 打开 `${origin}/sign-in` 独立窗口 | 需要 Turnstile 或其他登录方式时的回退方案，监听 Cookie 写入后刷新 |
| `maas:snapshot` | `POST /api/user/auth/refresh` | 启动时恢复会话 |
| `maas:billing` | refresh → `GET /api/user/self` + `GET /api/status` | 余额、已用额度、请求数、展示换算 |
| `maas:subscriptions` | refresh → `GET /api/subscription/plans` + `GET /api/subscription/self` | 套餐目录与我的订阅（只读） |
| `maas:logout` | `POST /api/user/auth/logout` | 退出；即使平台离线也清除本机凭据 |

- 凭据处理：
  - Refresh Cookie 名为 `new_api_refresh`，作用路径 `/api/user/auth`，存放在按 origin 隔离的非持久化 Electron Session 中。
  - 用 `safeStorage` 加密后写入 `userData/maas-session.json`。系统没有可用的加密能力时直接报 `storage` 错误，不会降级为明文。
  - 登录或刷新返回的 AuthBundle 中，`access_token`（JWT）只保存在主进程内存，`session.sid` 作为请求头 `X-Auth-Session` 发送。
  - 刷新遇到 `409 AUTH_SESSION_MISMATCH` 时，不带 SID 重试一次；遇到 `401` 时清空本地会话。
  - 所有请求经 `queue` 串行执行，读取前后校验账户 ID，防止旧请求的结果串到新账户上。
- 解析：`src/shared/auth/maasBilling.ts`（quota 换算）、`maasSubscriptions.ts`（套餐和订阅投影）、`maas.ts`（账户字段）。
- 界面：`src/renderer/components/login/*`（`PlatformSessionGate` 是启动门禁，未登录时不挂载工作空间），`src/renderer/services/maasSession.ts`、`maasAccount.ts`、`maasSubscriptions.ts`。
- 相关 spec：`specs/features/2026-10-12-maas-login.md`、`2026-10-12-platform-startup-gate.md`、`2026-10-12-platform-billing-sync.md`、`2026-10-13-email-and-platform-subscriptions.md`。

### 2.2 模型（对话）链路（已接入）

- `src/shared/auth/platformConfig.ts` 中的 `lockPlatformConfig()` 在启动时和每次写入 `app_config` 时执行：
  - 找到或创建一个 `custom_N` 供应商，`baseUrl` 固定为 `https://gateway.ai.shilijia.xyz/v1`，`apiFormat` 为 OpenAI，`authType` 为 ApiKey。
  - 其他所有供应商一律 `enabled: false`（保留记录但禁用）。
  - 没有密钥或模型时不启用，也不虚构默认模型。
- 用户在设置中只能填写平台密钥（`sk-...`，在平台“令牌”页面创建）。保存时请求 `GET /v1/models` 发现模型，失败时不覆盖原配置。
- **登录 JWT 不用作模型密钥**。所以模型扣费归属于密钥所属的平台账户，和当前登录账户是否一致，客户端不做校验。这是现有的缺口；平台提供 `/api/token/*`，可在登录后管理密钥，见 [11 第 7 节](11-platform-model-apis.md)，是否采用需要产品确认。
- 主进程把配置写入 OpenClaw 的 `openclaw.json`（`src/main/libs/openclawConfigSync.ts`），OpenClaw 直接请求平台的 `/v1/chat/completions`。

### 2.3 旧链路（未接 maas，需要维护时注意）

以下代码沿用 LobsterAI 服务端协议：响应格式为 `{code: 0, data}`，鉴权用旧的 accessToken/refreshToken。服务地址取 `getServerApiBaseUrl()`（`src/main/libs/endpoints.ts`），即 `product.json` 的 `services.apiBaseUrl`，**目前为空字符串**；开发环境可以通过 `API_CONSOLE_SERVER_BASE_URL` 覆盖。

| 功能 | 位置 | 旧接口 |
| --- | --- | --- |
| 旧登录与刷新 | `authSessionManager.ts`、`main.ts:5613` | `/api/auth/exchange`、`/api/auth/refresh`、`/api/auth/logout` |
| 服务端模型列表 | `main.ts:5693` | `/api/models/available`、`/api/models/pricing-catalog` |
| 旧服务端模型代理 | `claudeSettings.ts` 中的 `tryLobsteraiServerFallback`、`openclawTokenProxy.ts` | `${apiBaseUrl}/api/proxy/v1/*` |
| **图片和视频生成** | `main.ts:6043` 中的 `handleMediaGenerationCallback` | `/api/media/images/models`、`/api/media/videos/models`、`/api/media/{images,videos}/generate`、`/api/media/videos/tasks/:id/cancel` |
| 额度、资料、营销 | `main.ts` 7000–8200 行附近 | `/api/user/quota`、`/api/user/profile`、`/api/client-banners/*`、`/api/purchase-offers/*` 等 |
| 企业版 | `src/main/enterpriseAccount/` | `/api/enterprise/context` |

推断（未运行验证）：`apiBaseUrl` 为空，旧账号也没有登录，所以媒体生成工具调用时请求地址无效，或者会被账户校验拦下。要接入平台的图片和视频能力，需要把这一段改为调用 maas 的 `/v1/images/*`、`/v1/video/*` 接口（见 [11](11-platform-model-apis.md)），并改用平台密钥。按 AGENTS.md 的要求，旧代码停用但保留，不能直接删除。

## 3. OpenClaw 运行时

- 启动：`src/main/libs/openclawEngineManager.ts` 用 `spawnOpenClawGatewayProcess` 启动本机网关进程，端口记录在 `stateDir/gateway-port.json`，连接地址为 `ws://127.0.0.1:<port>`。
- 通信：`src/main/libs/agentEngine/openclawRuntimeAdapter.ts` 通过 WebSocket 调用网关方法，常量见 `agentEngine/constants.ts`：`chat.send`、`chat.abort`、`chat.history`、`sessions.list` 等。
- 配置：`openclawConfigSync.ts` 生成 `openclaw.json`，内容包括模型供应商、插件 entries、MCP servers 和技能目录。配置变化时可能需要重启网关（`openclawConfigRestartWorkloads`）。
- 构建：首次运行 `npm run electron:dev:openclaw` 会按固定 tag 构建 `../openclaw`。**不能在客户端运行时重建或清理正在使用的 runtime 目录**，见 AGENTS.md。

## 4. 一条对话消息的路径

1. Renderer 调用 `window.electron.cowork.startSession` / `continueSession`，对应 IPC `cowork:session:start` / `cowork:session:continue`（`main.ts:9367`、`main.ts:9619`）。
2. Main 的 Cowork 层落库（`coworkStore.ts`，SQLite），交给 `CoworkEngineRouter`。引擎固定为 `openclaw`。
3. `openclawRuntimeAdapter` 通过 WebSocket 发送 `chat.send` 到 OpenClaw 网关。
4. OpenClaw 按 `openclaw.json` 中的平台供应商请求 `gateway.ai.shilijia.xyz/v1/chat/completions`（流式），执行过程中可能调用工具、插件、技能、MCP。
5. 网关事件流回 adapter，Main 合并后推送 `cowork:stream:message`、`cowork:stream:messageUpdate`、`cowork:stream:sessionStatus` 给 renderer。
6. 对话完成或失败后触发 `maas:billing` 刷新余额。

回答渲染、流式合并、历史和思考提取与上游 LobsterAI 2026.9.23（`791a352d`）保持一致，不能加入星途专属的回答风格提示词。见 `specs/refactors/2026-10-12-official-answer-chain.md`、`specs/bugfixes/2026-10-13-official-conversation-extension-parity.md`。

## 5. 插件、技能与 MCP

三者的区别和维护责任以 `docs/development/extensions.md` 为准。

### 5.1 自有 OpenClaw 插件（`openclaw-extensions/`）

都通过本机回调调回主进程。回调服务是 `src/main/libs/mcpBridgeServer.ts`，只监听 127.0.0.1，每个进程生成一个随机 secret，请求头需带 `x-mcp-bridge-secret` 等字段。

| 插件 | 提供的工具或能力 | 回调路径 | 主进程处理 |
| --- | --- | --- | --- |
| `ask-user-question` | `AskUserQuestion`，结构化地向用户确认 | `/askuser` | 弹出确认卡片，超时 120 秒 |
| `lobster-media-generation` | `lobsterai_image_generate`、`lobsterai_video_generate`、`lobsterai_skin_manage` | `/media-generation/tool` | `handleMediaGenerationCallback`（走旧链路，见 2.3） |
| `lobster-decision` | `decision_evaluate`（实验） | `/decision/tool` | `decisionModelTool.ts`，密钥不写入 openclaw.json |
| `mcp-bridge` | 把星途管理的 MCP 服务暴露为 OpenClaw 原生工具 | 插件配置的 `callbackUrl` | `openclawConfigSync.ts` 中没有找到它的启用代码；当前 MCP 改为直接写入 `openclaw.json` 的 `mcp.servers`（`openclawConfigSync.ts:345`）。推断该插件处于闲置状态，未做运行验证 |
| `lobsterai-model-compat` | 模型运行时兼容配置（思考级别、Kimi 流包装等） | 无 | 在 `onProviders: lobsterai-server` 时激活 |

插件配置在 `openclawConfigSync.ts` 约 2340–2760 行写入：`callbackUrl` 加 `secret: '${LOBSTER_MCP_BRIDGE_SECRET}'`。

### 5.2 随包第三方插件

`package.json` 中 `openclaw.plugins` 固定了 id、npm 包和版本：qwen、deepseek、moonshot、qianfan、stepfun、zai、xiaomi、volcengine 等模型供应商，以及钉钉、飞书、QQ、Discord、企微、微信等消息渠道。升级时只改这里的版本，并做兼容验证。

### 5.3 用户安装插件

`src/main/plugins/pluginManager.ts`：支持 npm、ClawHub、Git、本地来源。安装时调用 OpenClaw CLI 的 `openclaw plugins install`，先安装到临时目录，再原子发布到 extensions 目录。当前只有 npm 和 ClawHub 支持检查更新。

### 5.4 技能

- 随包技能在 `SKILLs/`，默认启用状态写在 `SKILLs/skills.config.json`。
- 同步和升级由 `src/main/skills/skillManager.ts` 负责。升级前把旧目录备份到 `skill-backups/`，失败时恢复。
- `src/main/skills/openClawSync.ts` 负责把技能同步给 OpenClaw。
- 文档技能使用随包的 Python 运行时（`documentRuntime.ts`、`STARPATH_PYTHON`）。

### 5.5 MCP

`src/main/mcp/mcpStore.ts` 存储 MCP 配置，`mcpRuntime.ts` 负责启动和连接，`mcpLaunchResolution.ts` 解析启动命令。配置最终写入 `openclaw.json` 的 `mcp.servers`。

**维护约束**：没有单独提出并验证过的修复需求时，不能重构、替换或清退插件、技能、MCP 的加载和执行内部逻辑。界面和品牌改动要与这部分分开进行（AGENTS.md）。

## 6. 存储

- SQLite：`src/main/sqliteStore.ts`。键值数据（如 `app_config`）和 Cowork 会话、消息都存在这里。
- 平台会话：`userData/maas-session.json`（加密）。
- OpenClaw 状态目录：`openclaw.json`、`gateway-port.json`、extensions、会话转录。
- 敏感配置：`appConfigSecrets.ts`。

## 7. 开发与验证命令

| 命令 | 用途 |
| --- | --- |
| `npm run electron:dev:openclaw` | 首次运行：构建 OpenClaw 运行时后启动 |
| `npm run electron:dev` | 日常开发：Vite 5175 加 Electron |
| `npm run build` | renderer 生产构建（含 `tsc`） |
| `npm run compile:electron` | 编译 main 和 preload |
| `npm test` | Vitest，CI 使用这条命令 |
| `npx eslint --ext ts,tsx --max-warnings 0 <files>` | 只检查改动过的文件（全量 lint 有历史遗留问题） |

CI 配置：`.github/workflows/ci.yml`、`electron-verify.yml`、`build-platforms.yml`。验收清单：`docs/development/acceptance.md`。

## 8. 维护硬约束（摘自 AGENTS.md）

- maas-token 平台只读：不能改它的代码、配置、部署和数据库。接口不够用时记录缺口，只在客户端适配。
- 先写 spec：在 `specs/` 中写明问题、范围、验收标准和验证方式，并在其中更新最终状态。
- 不能删除隐藏功能对应的存储和运行时代码。清退工作已于 2026-10-13 暂停。
- 不能重建正在运行的 runtime 目录，也不要反复重启用户正在使用的客户端。
- 未经授权不提交、不推送；只推送到个人远端，再向公司仓库提 PR。
- 本地检查、GitHub CI、原生平台验收的结果分开记录。只在 macOS 上通过不等于跨平台通过。
