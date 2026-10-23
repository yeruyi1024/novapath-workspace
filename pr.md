## Summary
<!-- Provide a brief summary of the changes in this PR -->

修复对话在结构化思考、正文流式交付和结束对账之间的内容一致性问题，并优化长回答的阅读体验。用户能够逐步看到正文，完整内容在历史回看与重启后保持一致；长正文默认展开，仍可手动收起。

| 场景 | 修复前 | 本次行为 |
| --- | --- | --- |
| 模型先返回结构化思考 | 正文可能等待结束事件才显示 | 思考与正文分别交付，正文按增量显示 |
| 长回答进入结束对账 | 历史接口的裁剪投影可能覆盖完整正文 | 保留可信完整内容，必要时校验后补取 |
| 正文超过原 8 KB 阈值 | 自动切换为轻量预览 | 默认完整展开，保留手动收起与展开 |

范围限定为第一分支的会话可靠性修复、模型能力适配、长正文展示及对应回归测试。

## Related Issue
<!-- Link to the related issue(s) if applicable -->
无关联 Issue。

## Changes Made
<!-- Describe the changes you've made -->
- **修复正文实时交付**：在固定 OpenClaw v2026.8.1 上提供可重放补丁，处理结构化思考之后正文延迟交付的情况，保留思考与正文的独立边界。
- **保护完整回答与历史一致性**：仅依据历史接口的结构化截断标记触发保护，普通文本中的截断字样不会误触发。优先复用已完整交付的正文；必要时调用 `chat.message.get`，限制为最多 4 条、单条 500,000 字符，并校验消息身份、角色、正文前缀及当前 turn/run。补取失败时保留可信内容，合法短修订仍可应用。
- **补齐经验证的思考能力配置**：按平台来源和模型 ID 应用能力映射，用户已保存的选择优先。当前明确确认范围为本地平台 3303 的 `deepseek-flash`，其他来源与模型继续使用已有能力信息。
- **优化长回答阅读**：在助手正文启用默认展开，流式增长和历史打开均使用完整正文视图，保留手动收起和再展开；思考及工具结果沿用各自的展示规则。
- **补充回归与交付保护**：覆盖截断识别、补取校验及失败、停止与会话隔离、模型能力和默认展开；将本地验收产物 `.local-tests/` 排除出版本管理。

## Type of Change
<!-- Mark the relevant option with an [x] -->
- [x] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Code refactoring
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Other (please describe):

## Testing
<!-- Describe the tests you've performed -->
- [x] Tested locally
- [x] Added new tests
- [x] Updated existing tests
- [x] Manual testing performed

**自动验证**

| 检查 | 结果 |
| --- | --- |
| 会话、运行时补丁及模型能力定向测试 | 26 文件，546 通过、12 跳过；跳过项不计为通过 |
| Markdown、消息分组、思考与展示相关测试 | 4 文件，38 项通过 |
| 改动文件 ESLint、差异格式检查 | 通过 |
| renderer 构建与 Electron 编译 | 通过；展示调整后重新构建 renderer 并验证相关测试 |

**原生客户端实测（macOS arm64 + 本地 MaaS 5183/3303）**

| 验证目标 | 实测证据 |
| --- | --- |
| 流式交付与内容保存 | 正文 16,745 字符、152 个不同增长长度；最大流式正文与 SQLite 摘要一致，真实思考独立显示和保存 |
| 中途停止 | 分别在思考和正文阶段停止；正文停止后保留 10,978 字符，界面显示“已停止” |
| 历史及重启恢复 | 4 个会话、18 条消息在正常退出重启前后的正文摘要与状态一致，重启未自动重发对话 |
| 默认展开及手动控制 | 新回答 13,273 字符、129 个不同增长长度，无需点击展开即可阅读结尾；历史长回答默认展开，手动收起及再展开通过 |
| 现有功能回归 | 项目、附件、文件工具写入与读回、结果链接打开完成实际操作 |

验收产物由第一分支独立构建，使用隔离用户数据目录；本地平台地址仅在验收副本覆盖。复用运行时的补丁与构建脚本摘要均与分支源码一致。

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

已准备两张原生验收截图，发布 PR 时上传为 GitHub 附件：

1. 正常重启后，完整长回答的最终结尾仍可阅读。
2. 新生成长回答默认完整展开，无需点击“展开”即可阅读结束标记。

截图与本地日志不作为源码文件提交。

## Checklist
<!-- Mark the completed items with [x] -->
- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [x] I have commented my code, particularly in hard-to-understand areas
- [x] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [x] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

上述定向测试和本机实测已通过。全量单元测试及无新增警告的全面核验尚未完成，对应检查项保留未勾选。

## Electron-Specific Changes
<!-- If your PR includes Electron-specific changes, describe them here -->
- [x] Changes to main process (src/main/)
- [ ] Changes to preload script (src/main/preload.ts)
- [ ] Changes to IPC communication
- [ ] Changes to window management
- [ ] None

主进程修改运行时适配和模型配置同步；renderer 修改模型能力应用与长正文初始展开状态。preload、IPC 协议及窗口管理不变，无数据库迁移或旧历史回填。

## Additional Notes
<!-- Any additional information that reviewers should know -->

**评审基线与交付**：目标为 `company/main@fe0332af`（2026-10-23 已核对远端），来源为 `split/pr1-conversation-recovery`，已有核心修复提交为 `f460f675`。本次交付同时纳入已验收的正文默认展开 3 文件；最终范围为 14 个代码、测试及忽略规则路径和本说明。过程文档及其他阶段改动不进入本 PR。

**合入与回退规划**：本分支可独立评审；运行时按固定版本及版本化补丁构建。后续组合分支时保留默认展开增量。需要回退时按运行时补丁和客户端增量分别处理，保留用户历史数据；展示调整可单独撤回。

**验证边界**：Windows/Linux 原生运行、最终签名安装包和远端 CI 待验。本轮真实请求未触发 `chat.message.get` 补取路径，其边界由定向测试覆盖；本轮未重新采集上游原始 SSE。

**已知独立事项**：本地观察到账户刷新 429 被误报为不兼容，相关账户实现与目标基线一致，未列为本 PR 已解决项，需随账户改造独立验收。

本次按用户授权提交并推送 PR1 分支至个人仓库 `origin`（`lelinhomafx4021-creator/shilijia-agent`）；公司仓库保持只读。尚未创建远程 PR、合并或部署。
