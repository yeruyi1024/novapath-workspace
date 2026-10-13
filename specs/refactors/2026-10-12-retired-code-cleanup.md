# 已替代代码清退与侧栏逻辑整理

## 问题和范围

当前项目/对话侧栏已经替代旧的 Agent 树，但旧树的组件、分页/筛选状态及专用测试仍留在源码中。梦境、独立邮箱设置删除后，也留下了展示接口、类型和前端封装。

本次只清退已经确认没有生产调用的链路，不改当前界面布局，不迁移用户数据库，不变更插件安装协议。

## 实施边界

- 删除旧侧栏树及其专用组件、状态、类型和四份测试；保留仍用于当前搜索、Windows 标题栏的按钮与相对时间显示，将它们和测试移到 `components/sidebar/`。
- 删除废弃广告轮播容器及专用轮播工具/测试；保留账户、套餐、额度及营销接口，作为公司平台接入边界。
- 删除梦境状态/日记的主进程 IPC、preload 方法和四个展示类型。保留启动修复、恢复备份、历史配置字段和普通记忆接口；运行配置继续禁用旧梦境任务。
- 删除独立邮箱设置的 renderer 服务封装与重复类型。保留主进程技能接口、preload 合同和既有凭据/账户迁移，供插件兼容使用。
- 删除确认无调用的旧 SVG 组件，以及上述已退役页面专用且无其他引用的中英文文案。

删除依据包括 TypeScript 模块引用图、全仓调用/符号搜索、动态加载/配置/打包入口核对。快速操作已使用文件类型图标，不加载配置中历史图标名称对应的 TSX 模块。

## 验收条件

- 旧侧栏树及梦境展示链路无残留调用；实际使用的共享按钮、时间格式与测试正常。
- 普通记忆、插件邮箱兼容、账户/套餐模块及历史数据处理保留。
- 完整测试、改动文件 lint、renderer 构建、Electron 编译和 diff 检查通过。
- 实际客户端设置、项目/对话侧栏、办公入口保持正常。Windows/Linux 原生验收仍单独标为待验收。
- 本次删除数量以本节修改前的工作区为基准，不混入先前功能清退或用户未提交改动。

## 状态

已完成。以本节修改前的工作区为基准，删除 23 个文件（3783 行），移动 5 个仍在使用的文件，源码净减少 4257 行。没有包含此前删除梦境/邮箱页面、文档技能替换等改动。清理 116 个专用翻译键的中英文条目，另将 7 个仍使用的运行状态/时间键改为对话语义。

## 实际删除清单

下列路径相对 `src/renderer/components/`：

| 范围 | 已删除文件 |
| --- | --- |
| 旧树及专用展示 | `agentSidebar/MyAgentSidebarTree.tsx`、`AgentTreeNode.tsx`、`AgentTaskRow.tsx`、`AgentSidebarActivityView.tsx`、`MyAgentSidebarHeader.tsx`、`ExpandAgentTasksRow.tsx` |
| 旧树专用逻辑/合同 | `agentSidebar/useAgentSidebarState.ts`、`taskFilter.ts`、`scheduledTaskSession.ts`、`batchSelection.ts`、`constants.ts`、`types.ts` |
| 旧树专用测试 | `agentSidebar/AgentTaskRow.test.ts`、`taskFilter.test.ts`、`scheduledTaskSession.test.ts`、`useAgentSidebarState.test.ts` |
| 无调用轮播 | `SidebarExperienceSlot.tsx`、`sidebarExperienceCarouselState.ts`、`sidebarExperienceCarouselState.test.ts` |
| 无调用旧 SVG | `icons/AcademicCapIcon.tsx`、`DevicePhoneMobileIcon.tsx`、`PlugIcon.tsx`、`PresentationChartBarIcon.tsx` |

侧栏搜索/筛选按钮、相对时间工具及两份测试已移至 `components/sidebar/`，所有实际调用同步更新；相对时间函数现在为 `formatConversationRelativeTime`，原有中英文显示和边界测试保留。原 `agentSidebar/` 目录已清空，当前项目/对话导航继续由 `Sidebar.tsx` 承担。

同时删除 `main.ts` 的两个梦境展示 IPC handler、preload 的两个对应方法、`types/cowork.ts` 的四个展示类型，以及 `services/skill.ts` 四个邮箱专用方法与重复类型。

## 保留代码的职责

| 代码边界 | 保留原因 |
| --- | --- |
| `openclawDreamingRecovery`、历史配置字段、存储迁移 | 恢复旧用户数据及修复启动异常；不是重新开放梦境功能 |
| 普通记忆 IPC、记忆页、memory-core 配置 | 当前正常使用的能力；旧梦境任务仍明确关闭 |
| 邮箱主进程技能接口、preload/electron 合同 | 插件兼容及已有账户凭据恢复；renderer 已不提供独立邮箱设置 |
| 账户/额度/套餐卡片与营销接口 | 公司平台后续接入边界；不随旧广告轮播容器删除 |
| 项目、对话流式状态、文件预览、办公技能、插件/MCP、四个远程渠道 | 当前产品能力，本轮不修改协议或数据 |

## 验证结果

- 最终完整 `npm test`：538 个测试文件通过、16 个跳过；5774 项通过、148 项跳过、0 项失败。相较上一轮减少 31 项：上述五份退役模块测试一并清退，未跳过或降低现存功能的测试断言。
- 13 个本轮修改/移动的 TS/TSX 文件 ESLint 通过；初次出现的三处 import 排序问题已自动修正。
- `npm run build`、`npm run compile:electron`、最终 `tsc --noEmit` 和 `git diff --check` 通过。Vite 既有 CommonJS/大分包提示仍存在，构建成功。
- 全仓源码/脚本/资源调用检查确认旧树、轮播及梦境展示接口无残留。邮箱类型仍在主进程及 preload 类型合同中，这是保留的兼容边界，不属于 renderer 重复封装。
- macOS arm64 空配置独立生产客户端：正常进入首页，设置只显示四个有效高级入口，普通记忆可打开；四个办公入口切换保留已输入草稿；搜索能正常打开。没有复制用户凭据，也没有发送验收草稿。
- [普通记忆截图](../../docs/pr-screenshots/2026-10-12/code-cleanup-memory.png)、[办公入口与草稿截图](../../docs/pr-screenshots/2026-10-12/code-cleanup-workspace.png)均来自本轮真实客户端。原生菜单正常退出，应用清理 1127ms、退出码 0；临时实例已清理，用户原客户端未重启。

Windows/Linux 原生验收、邮箱插件端到端、公司账户/套餐接入及 GitHub CI 本轮未执行。不创建提交或推送；公司 README 和用户数据保持原样。
