# 10 客户端工具控制

结论来自 2026-10-14 阅读源码，未做运行验证。工具都在 OpenClaw 里执行，shilijia-agent 控制工具的手段只有两种：写入 `openclaw.json` 的配置，以及接管运行时发出的审批和回调。

## 控制层一览

| 层 | 机制 | 位置 | 当前效果 |
| --- | --- | --- | --- |
| 1. 工具开关 | `tools.deny`、`tools.web` | `openclawConfigSync.ts:322`、`buildWebToolsConfig`（约 2023 行） | 禁用 `web_search`；`web_fetch` 按设置开关；开启工具循环检测 |
| 2. 命令审批 | `exec-approvals.json` | `ensureExecApprovalDefaults`（约 3542 行） | 强制 `security=full`、`ask=off`：**运行时不再对任何命令发起审批** |
| 3. 提示词约束 | `MANAGED_EXEC_SAFETY_PROMPT` 等 | `openclawConfigSync.ts:397` | 删除操作要求模型先调用 `AskUserQuestion` 确认；其余命令直接执行 |
| 4. 审批桥（保留） | `exec.approval.*`、`plugin.approval.*` 事件 | `agentEngine/openclawApprovalController.ts`、`openclawApprovalBridge.ts`、`commandSafety.ts` | 删除类命令弹窗，其余自动选 `allow-always`；IM 会话全部自动通过。因为第 2 层关闭了询问，exec 这一路基本不会触发 |
| 5. 沙箱 | `agents.defaults.sandbox.mode` | `mapExecutionModeToSandboxMode`（约 106 行） | 只有企业版生效：sandbox→`all`、auto→`non-main`；个人版固定为 `off`，命令直接在本机执行 |
| 6. 浏览器 | `browser.ssrfPolicy`、`profiles` | `buildBrowserConfig`（约 1971 行） | 严格模式按域名白名单或黑名单过滤，并禁止访问内网；提示词要求固定 `target="host"` |
| 7. 自有工具回调 | 本机 `mcpBridgeServer`，要求请求带 secret | `mcpBridgeServer.ts` | AskUser、媒体生成、决策、内置浏览器四类工具由主进程实际执行 |
| 8. 媒体工具门禁 | `resolveMediaGenerationGate` | `mediaGenerationPolicy.ts` | 本轮没有选择媒体模型时拒绝调用；图片和视频的类型不匹配时也拒绝。视频生成前还要弹窗确认费用 |
| 9. 会话类型 | 按 sessionKey 判断 | `openclaw-extensions/*/sessionKey.ts` | `AskUserQuestion` 和媒体工具只在桌面会话及其子会话中注册，IM 会话中不出现 |
| 10. Agent 作用域 | `agents.entries.<id>.skills` | `openclawAgentModels.ts:374` | 每个 Agent 可以限定能用的技能 |
| 11. 插件白名单 | `plugins.allow` / `entries` | `openclawConfigSync.ts` 约 2639–2683 行 | 只信任随包插件和用户已安装的插件 |
| 12. 技能安装扫描 | `scanMultipleSkillDirs` | `skillManager.ts:2052` | 安装前扫描技能文件；不是安全等级时暂停安装，等用户确认，5 分钟后过期。扫描本身出错时不阻断安装 |
| 13. 渠道访问 | `allowFrom`、`groupPolicy: allowlist` | 各 IM 渠道配置 | 限制谁能通过钉钉、飞书等渠道驱动 Agent |
| 14. 定时任务和 owner | `commands.ownerAllowFrom: ['gateway-client']`、`cron.allowChannelScheduling` | 约 2514、2536 行 | 桌面端是 owner，可以使用 owner 专属工具；渠道用户沿用自己的权限 |

## 风险与注意事项

- **个人版没有强制拦截**：第 2 层关闭了审批，第 5 层沙箱关闭，删除保护只靠第 3 层提示词，模型不遵守时 `rm -rf` 等命令会直接执行。只有 `AskUserQuestion` 可用时，模型才会被要求先确认；IM 会话中没有这个工具，提示词明确要求“直接执行”。
- `openclawApprovalController.ts:112`：`shouldAutoApprove` 分支调用了 `respondToPermission`，之后没有 `return`，会继续弹出审批框。和上游 `cada061c` 的写法一致，而且第 2 层关闭询问后不会走到这里，暂不处理。
- 要收紧控制，可选方向（都只在客户端改，需要另写 spec 并验证）：
  - 把 `ask` 改回需要确认，让第 4 层真正生效。
  - 个人版也允许开启沙箱。
  - 在 `tools.deny` 中加入不希望模型使用的工具。

  按 AGENTS.md 要求，这些改动属于运行时执行链路，必须单独提出需求、单独验证。
