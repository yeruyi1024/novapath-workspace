# 旧测试替代与真实对话密集验收

## 范围与授权

2026-10-14 用户明确要求删除旧版测试并新开多组对话密集验收。仅清理上轮额外 Node 测试中失败、依赖旧编译路径或旧契约的七个测试文件，不改产品实现、数据库、凭据、活动运行时或另一个 gateway 平台。

## 清单、替代与恢复

正式入口为 `npm test`，直接测试 TypeScript 源码。旧文件不在正式入口和 CI 中，无执行脚本引用；历史 specs 中的路径作为历史记录保留。删除可从当前 Git HEAD 恢复。

| 删除文件 | 保留的正式覆盖 |
| --- | --- |
| tests/cronJobService.mapping.test.mjs | src/scheduledTask/cronJobService.test.ts |
| tests/scheduledTaskMigrate.test.mjs | src/scheduledTask/migrate.test.ts |
| tests/skillFrontmatter.test.mjs | src/main/skills/skillManager.test.ts |
| tests/imCoworkHandler.scheduledTask.test.mjs | src/main/im/imCoworkHandler.test.ts |
| tests/imStore.test.mjs | src/main/im/imStore.test.ts |
| tests/openclawMemoryFile.test.mjs | src/main/libs/openclawMemoryFile.test.ts |
| tests/openclawConfigSync.test.mjs | src/main/libs/openclawConfigSync.runtime.test.ts + src/main/libs/openclawConfigSync.test.ts |

技能解析的25个用例已迁移；存储、任务迁移、IM处理和记忆解析均有正式覆盖。旧记忆测试要求丢弃正文、折叠空格，与现行保留原文契约相反。旧配置同步的 Moonshot 路由、原生会话 exec 禁用及工作区模板假设已过时；正式配置测试覆盖当前公司模型适配、兼容映射、配置同步及 maxTokens。旧 IM 异步提醒用例在正式测试中已有跳过状态，本次不改变或宣称补足该跳过覆盖。

## 验收条件与方法

删除后完整 Vitest、剩余旧 Node 测试和构建脚本测试通过；不删除断言以掩盖正式测试失败。客户端新建至少10个独立对话，实际验证富文本、上下文、特殊字符、长回答、停止、文件生成与预览，保留测试记录。

## 当前状态

清单核对及本轮验证完成。首次旧测试结果为390通过、16失败，保留在本机 /tmp/novapath-extra-tests-20261014.log。最终结果后续更新。

## 最终本机结果（macOS）

- 完整 Vitest：561文件通过、16文件跳过；5937用例通过、148用例跳过，26.48秒。
- 剩余 Node 旧测试与构建脚本：353通过、0失败，7.13秒。
- `git diff --check` 通过。本次只删除旧测试和新增验收记录，不改TS实现，因此无新增TS lint范围；前轮生产构建、Electron编译和改动文件lint已通过。
- 实际客户端新建20个独立对话（密测01至20），发送22个请求：21个完成、1个主动停止；停止后追问成功。逐个切换检查历史和完成状态。
- 实测基础计算、Unicode、多层列表、表格、代码、公式、长回答、80项标记输入、上下文追问及会话隔离。密测04追问返回紫色海豚481，密测09未串入该暗号。
- 生成MD、JSON、CSV、中文含空格TXT；MD十行表格及代码正文预览通过，源码/正文交替6次无冻结，CSV中文表头及3条记录预览通过。不存在文件读取给出明确反馈且未创建该文件。
- 预览开启时侧栏收起/展开正常，最后恢复侧栏，客户端保持运行，测试对话及文件保留供查看。

## 验证边界

本轮验证当前已有登录和deepseek-v4.1-flash配置；未覆盖全部模型、IM真实发消息、邮件发送、网络断开故障注入、安装升级、Windows/Linux和持续数小时的耐久测试。富文本检查以实际客户端可访问界面状态为证据，不等同于逐像素截图验收或生产并发容量测试。正式测试中的148个跳过项保持原状。无提交或推送。
