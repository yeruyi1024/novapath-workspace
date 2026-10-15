# 星途平台登录与初始页

状态：实现与本地验证完成；真实账户登录、Windows/Linux 真机验收待完成。

本阶段后续启动门禁、固定模型网关和仅密钥设置，以 [平台启动门禁方案](2026-10-12-platform-startup-gate.md) 为准；“稍后登录”和编辑网关入口已移除。

## 问题与范围

旧登录依赖授权码交换、JSON refresh token 和旧套餐接口；maas-token 使用 AuthBundle 与 HttpOnly Refresh Cookie，不能直接替换地址。默认平台为 https://gateway.ai.shilijia.xyz。

当前桌面端新增独立 maas 登录适配器、侧栏账户入口、首次欢迎页和登录表单。平台仓库仅阅读，不修改；保留旧账户接入边界，不启用其计费、营销或模型列表。未经用户授权不提交或推送。

## 最终行为

- 初始页沿用用户确认的左右布局，左侧展示星途与项目/文件能力，右侧直接放登录表单，标题自然分为两行。账号密码、短信验证码按实时 `/api/status` 展示。注册入口始终不展示；当前线上 `register_enabled=false`。
- 默认账号密码登录调用 `/api/user/login`；两步验证用临时 `flow_token` 调用 `/api/user/login/2fa`，验证成功前不保存登录态。短信通过 `/api/user/login/sms/code` 获取挑战，再用 `challenge_token` 和 code 调用 `/api/user/login/sms`；尊重平台发送间隔并检查挑战过期。切换方式、错误、加载和重试有反馈。
- 凭据通过 preload 与经过来源校验的 IPC 进入主进程。密码、JWT 不进入持久化和日志。renderer 仅获得账户与实际额度投影；一次性短信/2FA 流程在当前表单内存中保留。
- Electron 主进程使用按平台 Origin 隔离的非持久化 Session 接收 HttpOnly Cookie；仅以 safeStorage 加密形式保存 Cookie 到用户目录。系统加密能力不可用或写入失败时返回存储错误，不明文降级。
- `/api/user/auth/refresh`、logout 携带正确 Origin 和当前 SID；会话不一致时无旧 SID 刷新后重试。网络故障保留账户；确认失效/过期清理账户。退出需平台确认撤销，并清除隔离存储。登录、恢复和退出串行处理。
- 仅平台额外要求 Turnstile 或只开放未内置登录方式时，提供独立平台登录窗口作为回退；该窗口无 preload，sandbox/contextIsolation 开启。普通密码/短信在初始页直接完成。
- 模型调用继续使用现有配置的网关 API Key；没有擅自签发 PAT/模型 Key、推断套餐协议或人民币换算。额度按平台原始单位显示。

## 验收与验证记录

- macOS、Node 24.21.0；`npm run build`、`npm run compile:electron`、改动文件 ESLint、`git diff --check` 通过。
- 4 个定向 Vitest 文件、67 项测试通过，覆盖密码/SMS/2FA 契约、凭据排除、恢复/轮换、网络中断、失效/过期、退出、取消和 IPC 来源。旧登录与产品隐私测试保留且通过。没有运行完整测试套件或 GitHub CI。
- 原生 Electron + 本地 HTTP 契约服务验证了真实 Chromium 接收 HttpOnly Cookie、safeStorage 加密保存、带 Origin/SID 刷新、密码/SMS 登录和服务端退出。只使用无效测试凭据与本地模拟短信，没有向线上手机号发送验证码。
- 独立 Electron 预览进程与临时用户目录检查浅色/深色、中文/英文、800px 初始页与 440px 登录框、键盘焦点与水平溢出。截图及本地验证日志位于外层 `.starpath-audit/2026-10-12-maas/`。没有刷新用户活动实例。
- 实际平台 `/api/status`、`/sign-in` 可访问；线上开放密码/短信且关闭注册。无 Cookie 的 refresh 返回 `401 AUTH_UNAUTHORIZED`。没有使用用户真实密码或短信，真实账户登录和额度尚未真人验收。
