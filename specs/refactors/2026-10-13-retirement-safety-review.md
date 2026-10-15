# 清退安全复核与维护边界

日期：2026-10-13。状态：依赖复核、历史目录兼容修复和本地验证完成。

## 用户要求和本轮范围

用户要求现有清退不影响正常功能，并保证后续可维护性。暂停扩大清退；核对相对官方基线 `791a352d` 的删除、动态/打包引用、对话/扩展/历史数据入口及实际脚本。保留当前已确认产品入口，发现真实缺失依赖才恢复。公司 gateway 严格只读，不操作用户数据库、不重启当前客户端、不重建活动 OpenClaw runtime。

## 已核查的删除

- 当前基线差异中有 52 个 src 删除路径：48 个组件/测试、3 个服务/测试、1 个图片，包含移动到新目录的旧路径。没有 src/main、src/shared、src/scheduledTask 或 scripts 文件被该清退整体删除。
- 四项文档技能有 123 个已跟踪旧路径退出源码发行目录；另有旧说明/许可被替换。它们属于已确认受限材料替换，不能为回退功能重新混入安装包。保留独立的新脚本与本地审计备份。
- 旧模型/皮肤编辑、助手树、轮播、梦境展示页和无引用图标为已替代/明确关闭的 UI，不机械恢复。邮箱已恢复完整配置入口。
- 文字引用扫描没有找到现行技能/生产源码调用已退出的旧文档脚本；命中的许可阻止清单、历史测试文本及生成 launcher 的相对路径已逐项区分，不把它们误判为当前源文件缺失。TypeScript 检查作为生产模块解析验证。

## 保留链路与维护入口

| 能力 | 保留入口 | 维护约束 |
| --- | --- | --- |
| 对话发送和路由 | `src/renderer/services/cowork.ts`、`src/main/libs/agentEngine/coworkEngineRouter.ts` | 两者与官方基线无差异；不得随 UI 清理替换执行协议 |
| 回答/思考/历史 | MarkdownContent、AssistantMessageItem、messageDisplayUtils、openclawAssistantText、openclawHistory | 五个中央模块与官方基线逐字一致 |
| 插件和 MCP | `src/main/mcp/`、`src/main/plugins/`、openclawConfigSync | MCP 运行主体保留；变更来源/版本/安装协议必须专项验证 |
| 技能 | skillManager、skillServices、bundledSkillReplacement、`SKILLs/` | 随包升级先准备、旧目录备份、凭据保留，失败恢复；不按隐藏入口移除包和依赖 |
| 邮箱 | renderer skillService、技能 IPC/preload、SkillManager 账号存储、IMAP/SMTP 脚本 | 页面和后端均保留；运行前准备锁定 npm 依赖 |
| 账户和套餐 | maasAuth、maasSubscriptions、旧账户/套餐兼容结构 | 公司适配独立；不能开启旧 account 总开关恢复某一项功能 |
| 普通记忆 | memory-core、memory 文件和 IPC、旧 dreaming recovery | 梦境只禁用执行；保留普通记忆、历史字段和恢复实现 |
| 任务调度 | `src/scheduledTask/`、CronJobService | 调度主体未随清退修改 |
| 存储/备份 | sqliteStore、coworkStore、dataMigrationService | 旧字段和 DB 文件名保留，历史备份根兼容；禁止因改名丢失目录 |
| 可选渠道 | package.json 版本声明、openclawOptionalChannels | POPO/NIM/Bee 为分发默认排除，可显式选入；不删除原账户配置 |
| 发行 | build:skills、ensure-openclaw-plugins、版本化 patches、安装 hooks | 源码保留不等于安装包已包含依赖；不得在活动 runtime 上重建/裁剪 |

## 发现及修复

### 原仓库用户数据目录回退

原仓库基线以 `LobsterAI` 作为用户目录，当前品牌配置固定使用 `API Console`，原实现没有自动读取仅存在的旧数据库。本轮补只读目录选择：

1. 当前 `API Console/lobsterai.sqlite` 存在时继续使用它。
2. 当前数据库不存在、旧 `LobsterAI/lobsterai.sqlite` 存在时，在原位置使用旧目录，回退目录也与所选用户目录对应。
3. 两个数据库都存在不自动合并/覆盖；都不存在按当前目录新建。

这不是数据库搬迁，不复制或删除用户文件。入口在主进程初始化且 logger/SQLite/恢复前执行。用临时路径覆盖上述组合、重启重复选择及品牌显示名变化，编译与全量回归后交付；不在真实用户资料上试验。

### 本地邮件技能依赖

首次非默认邮件脚本测试因缺少 `nodemailer` 失败。package.json、锁文件、`build:skill:email` 和发行 `build:skills` 仍存在，属于开发环境依赖未准备，不是被清退。执行已有 `npm run build:skill:email` 按锁文件安装，仅写本仓库忽略的 node_modules，不改 manifest/lock，不修改用户技能或活动 runtime；同批 52 项脚本测试最终全部通过。

## 暂不能据此承诺的功能

真实邮件收发、真实账户/模型密钥归属、购买支付、旧云分享/媒体服务、隐藏实验后台策略、远程渠道与第三方扩展端到端、Windows/Linux 和签名安装验收仍需专项工作。已经确认的公司登录门禁、固定网关、梦境关闭和正文系统打开行为不在本轮回退。

## 开发约束

AGENTS.md、CONTRIBUTING.md 与汇报文档已注明默认暂停扩大清退。后续优先禁用/适配，删除前需具体依赖清单、替代和恢复方案及用户确认范围。原有测试不因隐藏页面随意删除；保护数据库/迁移/凭据、运行时/扩展和安装链路。受限发行材料保持许可边界。

## 最终验证

- AST 核对 src/scripts 中 4,984 个静态本地模块引用，未发现缺失。原粗略字符串扫描命中的是注释、测试文本或生成代码，不作为误删结论。
- 五个回答中央模块逐字一致；对话路由、renderer cowork 服务、MCP runtime 和任务调度主体未随清退修改。邮箱 IPC/preload/存储接口、普通记忆与旧恢复代码仍在。
- 修复前完整测试 5,886 通过；目录兼容新增 6 项后最终完整测试 5,892 通过、148 原有跳过，551 文件通过、16 跳过，0 失败。
- 目录/应用常量/SQLite/备份/凭据 5 个相关测试文件共 42 项通过；3 个改动 TS 文件 lint、前端与主进程类型检查、Electron 编译通过，差异检查通过。
- 真实隔离 Electron 使用临时数据库和实际 SqliteStore，验证仅旧资料时读取原 marker、两份资料时选当前且旧 marker 保留，无文件搬迁或数据库合并；退出码 0，临时资料清理。此检查覆盖目录选择和存储初始化，不等于完整客户端或 Windows/Linux 验收。
- CI 脚本与非默认邮件配置脚本共 52 项最终通过。首次 1 项因本地缺少 nodemailer 失败；执行已有锁定依赖准备命令后同范围完整复验，无修改断言或跳过。
- 随包 Python 实际执行四项文档脚本测试：11 项中 10 通过、1 跳过（当前环境未提供重算所需 LibreOffice）。不能将公式重算写成本轮通过。
- 本轮未修改 gateway、用户数据库、活动 runtime、公司 README 或原有对话核心；没有提交、推送或重启用户客户端。代码只修改资料目录选择，另更新维护规则与记录，未新增删除项。

## 结论及仍需处理

目前未发现上述清退破坏已覆盖的对话/扩展/存储链路；发现的原版本资料目录兼容缺口已修复，本地邮件依赖已按现有流程补齐。保留现有已替代 UI 的删除结果，不继续扩大删除；后续用禁用与独立适配控制产品范围。

两个资料目录都已有数据库时不自动合并，避免覆盖当前使用的数据；如果用户要取回另一份资料，通过备份/导入流程单独处理。真实服务、复杂文档、扩展端到端和跨系统仍按专项验收，不承诺全部功能无回归。
