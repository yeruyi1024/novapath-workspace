# 启动、完整测试与 macOS 打包验证

状态：本地测试、隔离 macOS arm64 构建/打包与启动验证完成；主题/验证码及首页精简已纳入最新测试包。正式发行与其他系统验收仍待完成。

## 范围与验收

用户要求确认现有客户端能正常启动、正确测试和打包。本轮检查活动 macOS 桌面、完整 Vitest、发行脚本契约、renderer 构建、Electron 编译、随包技能构建及当前 macOS arm64 DMG 生成。若发现阻断，独立记录原因并修复客户端范围内的必要问题，不跳过失败或降低测试断言。

所有打包和可能修改依赖、资源、运行时的命令在 `.work/startup-package/checkout` 独立副本执行，不重建活动客户端的 dist/dist-electron/vendor。复制当前已准备的 mac-arm64 运行时作为打包输入，保留正式 beforePack/afterPack 检查，不因为构建测试绕过资源门槛。

启动验证区分活动开发桌面、产物完整性与生产包冷启动。生产包若需隔离用户数据，使用独立测试副本和启动引导；记录引导与原始包的差异，不宣称未验证的原始干净系统安装已通过。测试不使用或复制真实账户凭据，不连接只读 gateway 源码作任何写入。

不提交、推送或发布。签名/公证、Windows/Linux、真实付费与正式发行分别记录，不以 macOS 本地结果推断跨系统验收。

## 已完成结果

- macOS 26.7.1 arm64，Node 24.21.0，Electron 43.5.0，产品版本 2026.9.23。原有活动开发桌面正常，未重启或提交当前草稿。
- 初始完整测试 5,912 通过/148 跳过；修复首次安装 web-search 时间戳误判后 5,915 通过/148 跳过；加入主题/验证码与首页精简后最新完整测试两次均 5,922 通过/148 跳过。见 `2026-10-13-packaged-web-search-copy.md`，记录中间失败和修正。
- 发行 CI 脚本契约 44 用例与安装器补丁/契约门槛 52 用例通过；157 个已有改动 TS 文件严格 lint，以及 6 个复制修复 TS 文件、13 个启动/登录 TS 文件与 2 个首页 TS 文件严格 lint 通过。
- 独立副本 build、compile:electron、build:skills、electron-builder mac arm64 均通过；app.asar 的 9 个启动入口/恢复文件（含 startup.js）与构建输出逐字节一致，8 个关键随包资源存在。macOS 使用已验证裸 runtime，冗余 gateway.asar/gateway-bundle.mjs 按既有 payload 策略移除。
- 包内 OpenClaw --version/gateway --help、本地 whisper-cli --help 正常。随包 Python 与实际包内文档助手 10 项通过，1 项 LibreOffice 未配置而跳过。
- 独立生产副本首次启动和重启均通过，bridge HTTP 200，无误修复、加载失败或 renderer 退出；数据目录独立，主进程、预加载和生产 renderer 正常衔接。测试引导/临时签名/独立端口的差异如关联修复说明，不宣称原始干净系统安装验收完成。
- DMG 约 370 MiB，hdiutil verify 有效：`.work/startup-package/checkout/release/novapath-darwin-arm64-2026.9.23-official.dmg`，SHA256 `ac863e8d8de6ec75ab610531aeec9b4cac4b978ae521c111bba61f012ccc1f94`。原始产物缺发行签名和公证，只作为本地测试包；无发布。
- 截图：`docs/pr-screenshots/2026-10-13/packaged-cold-start.png`；测试生命周期/日志/产物清单保存在 `.work/startup-package/`。Windows/Linux 真机安装、正式签名公证、完整真实业务和已登录凭据的升级恢复未在本轮验收。

## 最终集成证据

- 最新 renderer build、Electron compile、macOS arm64 包生成与镜像校验均通过，日志带 `home-pr` 后缀；16 个相关源文件与隔离打包输入一致，9 个包内入口与该次构建逐字节一致、8 个关键资源存在。最终镜像记录 `artifact-home-pr.json` 与 `package-contents-home-pr.json`。
- 启动主题/验证码修复的生产副本首次启动及重启在 `smoke-login/`；最终首页精简产物使用全新的 `smoke-home/` 测试副本和数据目录再次检查。对原始 DMG 与 app.asar 不注入测试引导。
- 原生开发桌面实际首页已确认移除项目快捷入口；脱敏截图 `docs/pr-screenshots/2026-10-13/home-simplified-dark.jpg`，仅裁去私有侧栏历史。最新 UI 截图、模拟短信与测试边界见主题及首页 spec。
- PR #1 远端 head 仍为 `2e9bda93bf4066de15fd14148e82474f77174227`，检查列表为空；本轮未提交推送。PR 标题与完整中文说明准备在 `.work/home-pr/`，附件尚未上传。测试包未发行签名/公证，未发布。

## 用户要求的原始生产版本验收

Windows 加载窗口保护与 SSR 回归补充后，最终完整测试 5,926 通过、148 跳过，557 文件通过、16 跳过；隔离构建、Electron 编译、macOS 包与镜像校验重新通过。最终 DMG SHA256 为上方记录；`artifact-push-fixed.json`、`package-contents-push-fixed.json` 保存 9 个入口及完整 app.asar 验证。

按用户“不要开发状态”的要求正常退出开发版（含确认退出提示），Vite 5175 与原 bridge 8923 均退出后，启动 `.work/production-preview/2026-10-13/NovaPath.app`。该目录完整复制原始未注入的 app，app.asar 与包输出逐字节相同；未加测试 bootstrap/端口覆盖/临时签名，未复制任何账户凭据或会话。生产 renderer 的 file: URL 和品牌菜单确认脱离开发服务器，使用原有资料并完成真实平台登录恢复，历史项目与对话仍在。

原始生产 app 的真实模型验收已收到“生产版登录与模型调用成功”，任务状态已完成。见 `2026-10-13-login-model-pr-verification.md`；客户端保持正常生产运行，不依赖 Vite。此为当前账户恢复/调用验证，新账户首次密码输入与真实短信仍未在本轮验收。
