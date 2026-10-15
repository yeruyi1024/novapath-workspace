# 根据 PR 反馈调整英文品牌为 NovaPath

状态：本地命名调整完成，自动检查与组件预览通过；PR 标题/说明已更新，源码未提交推送。

## 来源与范围

用户要求查看 PR 说明后更改。公司 PR #1 的反馈是英文名称调整为 novapath：https://github.com/yeruyi1024/novapath-workspace/pull/1#issuecomment-6138961791 。品牌展示采用 NovaPath，中文保留星途；不自行进行商标法律判断。

修改统一品牌配置、包与发行显示名、启动/恢复页面、当前 UI 和可见登录/授权说明、当前开发规范与计划；PR 描述按已推送内容与本地待同步改动分别记录。公司 README 和第三方许可证保持原样。原 application ID、数据目录、数据库、协议、IPC、历史标记、文件名/翻译 key 和签名环境变量保留，以避免纯名称调整改变认证、存储或升级身份。受保护对话/插件/MCP执行逻辑不做改造；涉及主进程只替换可见文案。

## 验收

当前中文/英文 UI、设置、账户、订阅、启动与恢复页面显示新英文名；打包显示名/可执行名一致。旧数据目录和协议等身份保持，历史发布草稿来源校验仍识别旧品牌但不能接受错误 commit。

改动 TS/TSX lint、名称兼容与相关单测、全库回归、脚本契约、隔离 renderer 构建与 Electron 编译、computer 预览。未重启用户客户端，不在 gateway 执行写操作。提交和推送未获授权，只更新本地文件及用户所指 PR 的说明。

## 结果

### 最终改动

- 产品配置：`星途 NovaPath`、`englishName=NovaPath`、`slug=novapath`；包名及锁文件根元数据为 novapath，依赖版本未变化。
- 安装程序/可执行程序/系统权限说明、启动和恢复页改为 NovaPath。构建入口从同一产品配置读取显示名与 executableName，appId 保留 com.starpath.desktop。
- Renderer 品牌文字使用统一配置；新增 `{englishName}` 文案占位符，账户登录、订阅和模型设置不再写死英文名；外观示例也读取 PRODUCT。
- Main 可见登录/授权网页、平台登录窗口、电脑操作介绍和保存凭据错误文字更新；认证校验、PKCE、凭据、请求路径与回调协议未改。
- 发布脚本的新标题和来源 stamp 读取产品配置，识别 NovaPath/StarPath/LobsterAI 旧草稿，但仍严格匹配版本和 commit、拒绝重复标记。
- 现有动态读取 PRODUCT 的上下文标题自动显示 NovaPath，相应品牌断言更新；保留历史 StarPath outbound-prompt fixture 与清退历史标记，未修改回复/流式或上下文算法。
- 当前 AGENTS、CONTRIBUTING、产品计划更新品牌；产品计划中已完成的历史实测回答/日志仍保留 StarPath，不改写历史证据。公司 README、第三方许可证/作者归属、内部协议标识/翻译 key/文件名/签名环境变量保留。

### 验证

- 首轮完整 Vitest 结果：5 个文件的 11 项品牌文字断言失败，5,898 通过、148 跳过。实际输出来自 PRODUCT 的新名称；只更新对应品牌期待值，未删除断言或放宽行为要求，首次日志 `.work/novapath-rename/tests.log` 保留。
- 改名断言修正后完整复跑：552 文件通过、16 跳过；5,909 测试通过、148 跳过，无失败；日志 `tests-rerun.log`。
- 改动的 18 个 TS/TSX 严格 ESLint 通过。首次 import 排序错误已修正，最终日志 `lint-rerun.log`。`git diff --check` 通过。
- 发行脚本全集首次 43 用例通过；补充旧品牌草稿兼容/错误 commit 拒绝后 draft-release 单文件 29 用例通过。没有把后者说成全套 44 项重新运行。
- Node 24 下隔离 `npm run build`（含 tsc）和 `npm run compile:electron` 通过。仅 staging 输出，未覆盖活动客户端；既有 Vite CJS/分包和 lottie eval 警告仍存在。
- 实际构建配置品牌/可执行名与产品配置一致，application ID 稳定身份契约检查通过；appConstants、数据目录和隐私/占位符覆盖均在完整测试中通过。
- computer 隔离组件预览：中文设置展示“星途 NovaPath”，英文模型设置展示“NovaPath connection”，英文登录与订阅分别展示“Sign in to NovaPath”“Choose your NovaPath plan”，无未解析品牌占位符。浏览器无 error 日志。
- 截图为本地模拟数据，不代表真实平台售价或联调：`docs/pr-screenshots/2026-10-13/novapath-settings-light.jpg`、`novapath-subscriptions-en.jpg`。静态启动/恢复源已检查，未重启客户端实测。

### PR 同步与未验收

PR #1 标题更新为 `feat(desktop): rebrand as NovaPath and redesign the workspace`，说明保留公司模板结构、反馈链接、历史截图，增加本地待同步修改/验证。明确当前已推送 head 2e9bda93 仍为旧品牌，近期 UI 和命名源码尚未提交推送，GitHub CI 没有当前 head 检查结果。PR 当前为开放而非草稿，未合并或发布；新增截图尚未同步 GitHub 附件。

未触及 gateway 或活动数据；没有重启用户客户端。真实 Electron/平台登录与对话、第三方 OAuth 联调、原生 Windows/Linux 安装/升级/凭据及签名、最终发布包均待验收。旧签名变量、内部 StarPath 技能作者/日志/诊断标记等兼容或历史归属保留，不批量替换受保护执行模块。


## 启动时发现的安全存储身份兼容问题

用户要求启动桌面端。先发现运行中的开发目录缺少 preload.js，退出后重新走 electron:dev 构建。新进程随后在读取原 app_config 时报告 Stored API keys could not be unlocked，说明仅保留 appId 和目录不足以保证钥匙串兼容。

Electron 43.5.0 在 PostCreateMainMessageLoop 中从内部 app name 配置 macOS Safe Storage 的 service/account 及 Linux crypt application/product name（[对应版本源码](https://github.com/electron/electron/blob/v43.5.0/shell/browser/electron_browser_main_parts.cc#L519)）。因此将公开名称与启动期加密身份分开：保留原名称“星途 StarPath”供系统初始化；ready 后恢复公开名称 NovaPath。Windows DPAPI 保持直接使用公开名称。

范围：共享产品配置增加稳定 storageName，小型启动 helper 加单测，main.ts 仅替换身份初始化调用，不调整 AppConfigSecrets/数据库/凭据格式或明文回退。现有密文直接用原安全存储解锁；不迁移、删除或输出凭据。验证主进程类型与 lint、定向兼容测试、实际启动/原配置读取与桌面截图；如失效仅回退此 helper，不覆盖已有改动。

启动修复结果：完成。新增 productAppIdentity.ts 在 macOS/Linux 启动期使用固定 storageName，ready 后恢复公开名称；Windows 继续使用公开名。14 个身份/数据路径/凭据兼容相关用例全部通过，改动的 main.ts 和 helper 严格 lint 通过。正常退出故障开发进程后重新运行 electron:dev，Electron 编译与五个 Vite 主进程/preload 输出就绪，读取原加密配置成功，原账号和项目/对话记录出现在实际桌面窗口。computer 已确认“星途 NovaPath”主界面与新版设置实际显示，用户正在查看。未删除/迁移密文、未使用明文回退、未重建 OpenClaw runtime。客户端保持运行（本轮工具会话 94120）。本次未重复全库测试；Windows/Linux 实机和发布包升级仍待验收。
