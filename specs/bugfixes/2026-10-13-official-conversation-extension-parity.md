# 普通问答、输入输出与扩展官方一致性

状态：官方源码对照、表格恢复、定向回归、隔离构建与随包插件验收完成；代码已推送个人仓库，公司 PR #1 已更新，GitHub CI 通过。

## 问题、范围与基线

用户要求普通问答、插件和输入输出与官方一致。沿用已确认的 LobsterAI 2026.9.23 提交 `791a352dee3b3d8c6f64edcaf229ce474a68f6c5`，不升级到上游主分支。保持当前星途 UI、项目组织、公司登录/模型入口和已确认的退役策略；核心发送、消息协议、附件参数、流式/思考/历史、工具调用与返回沿用官方。另一个 gateway 平台只读，不重启用户活动生产版、不修改其数据或运行时。

本轮读取 Git 官方基线对照 20 个生产模块，审查输入组件、首页提交、运行时 adapter、preload、配置同步、技能同步和版本化补丁的剩余差异；用已有测试验证输入、附件、普通回答、流式、工具事件、插件/技能/MCP。验收要求为核心模块无非必要产品定制、原有协议参数和工具结果完整保留、范围内回归无失败；不能把代码一致或模拟测试写成所有第三方服务端到端通过。

## 发现与修复

- 首次对照 19/20 模块逐字一致；唯一差异为 `MarkdownContent.tsx` 的表格展示，后续 UI 优化改了字号、表头换行、垂直对齐和分隔线。本轮恢复官方七处 className，使中央回答模块再次逐字一致。表格文本、Markdown URL、安全净化及点击处理不改写。
- 问答发送服务、引擎路由、OpenAI 兼容代理、格式转换、技能路由/计划提示、图片附件及用户消息渲染与官方一致。输入组件的 payload 组装仍使用官方实现，差异主要为项目展示、草稿恢复、语音适配和公司模型权限反馈。
- 插件 manager/install publisher、MCP runtime/store/launch resolver 与官方逐字一致；其他差异包括品牌展示、空市场来源回退、已有随包技能替换/凭据保留、目录 watcher 修复、web-search 时间戳保留和 Intel macOS 插件解包超时修复。它们已有独立 spec 和回归，不在 UI 优化中继续改造执行协议。
- 回答 adapter 的剩余品牌说明不定义回答风格、不修改用户文本或工具参数；普通记忆、已安装扩展状态和历史记录保留。公司认证、语音服务、已确认的功能开关及独立编写的文档技能属于产品差异，不能描述为整个安装包与官方逐字相同。
- 显式启用随包微信插件修复集成测试后，首次因备份未生成而失败。隔离诊断确认 repair 返回成功但不接纳夹具中的旧路径：macOS `os.tmpdir()` 返回 `/var/...`，`/var` 是系统符号链接，官方 `isMissingUnaliasedPluginPath` 正确拒绝带链接祖先的路径。测试夹具改用 `fs.realpathSync` 的实际临时目录；生产修复器、路径保护和原断言不变，不将被拒绝的测试路径说成真实用户修复成功。

## 验证

- 修复前问答、附件/草稿、流式/历史、工具事件、插件/技能/MCP/SDK 等 31 文件定向测试：30 文件通过、1 文件跳过；599 项通过、1 项跳过。跳过为环境条件未满足的既有测试，未修改断言或增加跳过。
- 表格恢复后复查中央模块与官方一致，执行 Markdown/消息显示回归、改动文件严格 lint 和隔离 renderer build。
- 最终 20/20 核心生产模块逐字一致；AST 对照确认输入载荷组装、键盘、粘贴、拖放处理与官方一致。`handleSubmit` 剩余差异为现有语音忙状态和公司模型权限入口，发送数据组装及工具路由保留。

| 逐字对照组 | 生产模块 |
| --- | --- |
| 回答与历史（5） | MarkdownContent、AssistantMessageItem、messageDisplayUtils、openclawAssistantText、openclawHistory |
| 发送与协议（5） | renderer/services/cowork、coworkCapabilitySelection、coworkEngineRouter、coworkOpenAICompatProxy、coworkFormatTransform |
| 输入与技能路由（5） | selectedSkillRoutingPrompt、skillSystemPrompt、clipboardAttachments、UserMessageContent、shared/cowork/imageAttachments |
| 插件和 MCP（5） | pluginManager、pluginInstallPublisher、mcpRuntime、mcpStore、mcpLaunchResolverManager |

- 表格恢复后的 3 文件 62 项回归及两个改动 TS 文件严格 lint 通过；Git HEAD 的隔离 checkout 仅叠加恢复的 Markdown 源码，renderer build 与 Electron compile 通过。完整测试 557 文件通过、16 文件跳过；5,911 项通过、163 项跳过，无失败。该隔离目录未带开发 runtime，与此前开发目录 5,926/148 的环境不同，分别记录。
- 显式指定已有隔离 macOS 测试包的运行时后，修正夹具的真实微信插件修复集成测试通过：先启动、旧记录修复、原始 SQLite 备份、包内 SDK 握手、启用后连续两次启动；临时 gateway/资料已正常退出和清理。没有修改或重建活动生产 runtime、安装外部扩展或连接真实微信账号。
- 真实 MarkdownContent 的隔离静态渲染样例已检查浅深色、480px 窄窗、中文/英文表格、左右居中对齐、代码、公式、引用和原始文件链接；无页面横向溢出。样例首次缺少 DOM 主题环境导致 CodeBlock SSR 失败，补齐样例 DOM 后通过，未改生产组件。截图 `docs/pr-screenshots/2026-10-13/official-conversation-output.jpg` 是组件样例，不冒充真实模型端到端。
- 原始生产包的当前账户登录恢复及真实模型回答已在上一轮验证；本轮自动测试不安装真实第三方插件、不替用户登录外部服务、不发送邮件或真实短信。远程插件的具体账号/服务、Windows/Linux 原生安装仍需按对应服务验收。
- 本轮代码提交 `677b0714cf10ecbc9986bbaf804293e0223ddd2e` 已推送个人 `origin/main`；[公司 PR #1](https://github.com/yeruyi1024/novapath-workspace/pull/1) 同步正文与 GitHub 截图附件。[GitHub CI #3](https://github.com/lelinhomafx4021-creator/shilijia-agent/actions/runs/38410120611) 全部通过，总耗时 5 分 1 秒；Ubuntu 完整测试 557 文件/5,911 项通过、163 项跳过，lint、编译、技能依赖、发行契约和输出门槛通过。最后仅补记验收文档，不改已验证代码、不重复全库测试。

## 后续约束

UI、品牌、订阅和设置优化只改外围展示；不得自行替换普通发送/停止/重试、输入和附件协议、Markdown/代码/表格/文件链接、流式合并/收尾、插件/技能/MCP 的发现、执行或结果回传。确有官方缺陷时独立记录基线、原因、最小修复及回归结果。保护现有账号、配置、数据和许可证边界，不通过恢复官方云账户或受限材料来实现兼容。
