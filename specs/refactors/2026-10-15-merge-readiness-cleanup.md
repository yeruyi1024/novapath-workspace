# 合并前改动收敛与交接

> 最新状态：下方归档及许可核查是阶段记录。用户随后要求“恢复能用”，原办公工具已接回正常技能目录并完成实际执行验证；功能减少或替换须老板确认，当前 PR 暂缓合并。已在 [PR 评审留言](https://github.com/yeruyi1024/novapath-workspace/pull/1#issuecomment-6187318493)提出具体确认问题，尚未获答复。以[功能恢复记录](../bugfixes/2026-10-15-document-capability-restore.md)为准，不再把“仅归档”当作最终交付。

## 问题、范围与验收

2026-10-15 用户要求核查星途改动是否冗余、删除本次产生的多余文件，并为老板合并 PR 说明完整改动。公司 PR #1 当前 head 为 `98347c0f`，base 为 `fc63ba54`；10 月 14 日实现仍在本地，不能把本地验证或清理写成已进入 PR。

仅整理 `shilijia-agent`。验收为：无关格式改动撤销、重复样式收敛后效果等价、无引用截图清理、既有总说明更新；完整 Vitest、改动 TS/TSX ESLint、renderer 构建、Electron 编译及引用/差异检查通过。代码与文档的提交、推送和 PR 合并另按用户授权执行。

## 清理清单与依据

- 撤销 47 个原本不在 PR 差异内、仅调整 import/export 排序的文件。通过 TypeScript AST 对比导入/导出集合和剩余源码，确认不含业务变化；不扩大 IM、定时任务、插件/技能/MCP 内部改动。
- 合并 `settings.css` 的相同断点与分散的浏览器控件约束，保持规则顺序、选择器优先级和最终属性值。
- 删除下列本次新增的旧截图。全仓文本及当前 PR 正文均无引用，已有相同场景的保留证据；不删除源代码、测试、许可文件或活动运行时。

| 删除文件 | 替代与恢复 |
| --- | --- |
| `docs/pr-screenshots/2026-10-12/settings-layout-narrow.png` | 保留 `settings-layout-narrow-light.png` 及后续窄窗证据；原图可从 `98347c0f` 恢复 |
| `docs/pr-screenshots/2026-10-13/model-call-success.jpg` | 保留 PR 使用的 `production-login-model-success.jpg`；原图可从 `98347c0f` 恢复 |
| `docs/pr-screenshots/2026-10-13/unified-account-menu-dark.jpg` | 保留账户及个人资料验收截图；原图可从 `98347c0f` 恢复 |
| `docs/pr-screenshots/remote-connections.png` | 保留 `2026-10-12/settings-layout-remote-light.png`；原图可从 `98347c0f` 恢复 |

保留有用途的修复 spec、接口文档、设计研究和验收记录。套餐研究和接口建议明确为未实施方案；空的套餐宣传配置是有意保留的展示接缝，不在本轮重构。7 个旧 Node 测试的删除属于已有工作区改动，替代覆盖见 [旧测试替代清单](2026-10-14-legacy-test-retirement-and-chat-stress.md)，本轮不扩大测试删除。

## 交接方式

更新既有 [总改动说明](../../docs/星途改名清退与功能改造说明-2026-10-13.md)，保留文件路径，修正过时口径，并分别说明当前 PR、后续本地实现、验证结果和未完成能力。公司 README 保留，另一个 gateway 平台全程只读。

## 验证状态

清理已完成，未提交推送。Node 24.21.0 / macOS 验证：

- 清理前及最终完整 Vitest 均为 568 文件、5,958 用例通过，16 文件、148 用例原有跳过，无失败。
- 所有 PR 已提交、本地修改及新增的现存 TS/TSX 合并执行严格 ESLint，最终范围 302 个文件；首次发现新增 Markdown 链接回归测试的导入排序错误，已修正。
- `npm run build`、`npm run compile:electron` 在当前源码隔离副本通过，生产/构建源码与最终工作区逐字核对一致；未覆盖活动客户端或运行时。构建保留第三方 eval、混合导入和大包等既有提示。
- 其余 Node 旧测试及 `scripts/ci-tests/*.test.cjs`：最终 353 通过、0 失败、0 跳过。首次隔离副本 352 通过、1 失败，原因是未带邮箱技能独立依赖而缺少 `nodemailer`；在隔离副本按锁文件执行 `npm run build:skill:email` 后完整复跑通过，没有修改实现、断言或跳过条件。
- 重新读取 `791a352d` Git 对象核对：20/20 核心回答、发送、附件、技能路由、插件和 MCP 生产模块逐字一致。
- PostCSS 比较设置样式，707 组选择器/断点/属性值不变。总说明及本 spec 本地链接、公司 README/LICENSE 保留和 `git diff --check` 通过。
- PR 检查工具返回 HTTP 404，未重新核实历史 CI；本地未推送版本无新增 CI。本轮没有真实模型请求、短信/邮件发送、支付、安装升级或 Windows/Linux 原生验收。

隔离构建副本已在验证后清理，仅保留日志及回退备份。过程日志保存于本机 `/tmp/novapath-merge-*-20261015.log`；初次失败及最终结果分别保留。清理备份为 `/tmp/novapath-merge-cleanup-backup-20261015.tar.gz` 和补充的 `/tmp/novapath-merge-cleanup-extra-backup-20261015.tar.gz`，不进入 PR。

## 交付状态

既有总说明已更新，公司 PR #1 正文同步完整模块概览，显式区分当前 head 与本地待同步内容，沿用原 GitHub 截图附件。仅更新 PR 说明，不修改其代码 head、不提交、不推送、不合并。若合并必须包含本地最新成果，需要后续授权提交个人仓库并重新确认新 head 的 CI。


## 71,519 行删除专项复核（用户追加要求）

用户要求核实累计删除不能误伤核心对话和功能。本轮停止进一步清理，只执行源码/接口对照、专项测试及记录，没有新增删除或修改生产源码，没有提交推送、重启客户端或操作真实用户数据。

### 删除行数来源

统计口径为公司 `fc63ba54` 到 PR `98347c0f` 的 Git numstat 删除列，包含修改文件被替换的旧行，不等于 71,519 行都对应整文件删除。新增 16,052 行，净减少 55,467 行。

| 范围 | 删除行 | 占比 | 具体内容 |
| --- | ---: | ---: | --- |
| 四项旧办公技能及技能创建说明 | 54,721 | 76.5% | 旧 schema、OOXML/文档辅助脚本、说明与依赖锁文件；不是对话引擎 |
| 前端（含旧 UI 及测试） | 15,611 | 21.8% | 旧厂商模型设置、皮肤/梦境页面、旧侧栏、轮播及专用资源/文案；Settings、Sidebar 的旧行也计入 |
| 主进程修改 | 565 | 0.8% | 品牌文字、窗口恢复替换、梦境展示 IPC、凭据及配置适配等；没有整体删除主进程文件 |
| 其余配置与资源修改 | 622 | 0.9% | 启动 HTML、发行配置、其他技能文案等 |
| 合计 | 71,519 | 100% | 本轮上一阶段的 4 张截图删除不产生文本删行，不属于以上 PR head |

### 核心链路证据

- PR 没有完整删除 `src/main/`、`src/shared/`、`src/scheduledTask/` 或 `scripts/` 文件；当前工作区也没有删除这些目录下的生产源码。
- 重新对照官方 `791a352d`：20/20 个中央回答、历史/思考、发送协议、附件、技能路由、插件 manager/install publisher 及 MCP runtime/store/resolver 生产模块逐字相同。
- 逐个比较 `main.ts` 的 IPC 注册：45 个非梦境对话处理器与公司基线连回调正文都完全相同，涵盖会话、发送/继续/停止、历史、权限和工具关联入口。总注册从 258 到 257：只移除 2 个已确定退役的梦境展示接口，新增 1 个窗口重试接口；其他新能力通过独立注册器接入。
- preload 从 435 个叶子接口到 445 个，移除项仅 `electron.cowork.getDreamingStatus`、`getDreamDiary`；普通记忆、会话与工具接口没有移除。
- CoworkStore、SqliteStore、运行时 adapter/router、引擎/config sync、MCP、插件/技能及 CronJobService 共 12 个关键文件的类公开成员没有被移除。CoworkStore 仅增元数据字段；SqliteStore 增模型密钥加密适配，没有删除表/会话字段。
- 子任务独立旧页退出，但执行、跟踪、历史和当前会话右侧 `SubagentPanelContent`/相关 IPC 仍在；不能把删除旧独立视图理解为删除子任务能力。
- AST 检查 5,081 个本地静态模块引用，无缺失；16 个动态加载点另核对，涉及 package 元信息、运行时生成模块及 DSH 兼容，不引用已退出的 UI/文档脚本。生产 source/scripts/SKILLs 中旧文档脚本名只命中发行禁止名单。
- 七个旧 Node 测试均有保留的正式源码测试入口；本轮没有再删除测试或降低断言。是否达到旧版所有高级文档功能的等价覆盖是另一问题，见下节。

### 不能称为纯冗余的办公能力边界

旧文档材料退出发行目录包含真实高级工具，不能用“旧代码/无引用”推断所有旧功能已等价替换：

| 原能力 | 当前替代/缺口 |
| --- | --- |
| 完整 OOXML XSD 校验、通用 pack/unpack 与旧 document.py 编辑框架 | 新脚本提供常用读取、纯文本批注/修订及安全检查，不等价于完整旧校验/编辑框架 |
| HTML 转 PPT、旧缩略图批处理 | 当前提供 python-pptx 生成、读取、文本编辑、排序和应用内预览；没有等价 html2pptx CLI 或旧批处理脚本 |
| PDF 非交互表单标注、边界框/校验图辅助 | 当前覆盖读取、拆页、合并及已有 AcroForm 字段填写，未等价覆盖旧标注流程 |
| Excel 公式重算 | 新脚本仍提供入口，但依赖外部 LibreOffice；本机未配置，不能记为通过 |

这些是既有替换的范围限制，不是本轮新删除。受限旧材料不能直接放回发行目录；若将这些高级操作列为必须保留功能，需要用允许分发的实现单独补齐并验收。合并评审应明确接受范围，不能把整个 5.47 万行归为无用文件。

### 专项验证

- 核心对话、引擎、插件/MCP/技能、调度、会话与数据库、凭据/迁移和回答展示：67 文件、1,000 用例通过，无失败或跳过。
- 使用当前随包 macOS Python 实际执行四类文档助手：11 项中 10 通过、1 跳过（未配置 LibreOffice）。没有发送邮件、短信或真实模型请求，没有操作用户数据库。
- 当前源码完整测试 5,958/148、302 文件 lint 和前后端隔离构建的前轮结果保留，本轮专项测试不冒充重新完成原生端到端或所有高级文档验收。
- 明细日志与 AST 证据位于 `/tmp/novapath-core-deletion-audit-*-20261015.*`。结论：已覆盖范围未发现核心对话/执行/存储链路被误删；办公高级辅助能力存在明确非等价替换范围，不能承诺所有旧功能完全不变。

## 用户决定：保留原始文档技能（2026-10-15）

用户在核查后要求保留。范围是完整保留原件、原许可证和可恢复路径；保持现有产品及运行时，避免在未核对授权时将旧材料重新混入发行包。

- 从公司固定基线 `fc63ba54` 原样保留四项技能共 132 个原文件至 `archive/legacy-document-skills/`，包括已删除及被替换的原说明、许可证、辅助脚本和 schema；没有覆盖当前 `SKILLs/` 实现。
- 归档 README 说明来源、使用边界和未恢复的高级能力；manifest 记录原路径、字节数及 SHA-256，每个归档文件与原 Git 对象核对一致。
- `electron-builder.json` 添加明确排除项 `!archive/legacy-document-skills/**`；原技能许可门槛保留，技能加载器及核心对话没有改动。
- 验收：132 个原件哈希一致，归档不在任何当前 extraResources 源目录内，打包文件模式明确排除，现有随包技能许可测试通过；仅归档、配置与文档改动，无需重复完整编译/全库测试。
- 保留原件不等于启用旧功能，不代表已确认再分发权利。本轮不提交、推送或发布归档，旧高级办公功能未自动恢复。

保留归档最终验证：132 个文件共 2,525,674 字节与固定公司基线逐字/哈希一致；现有随包技能许可测试 7/7 通过；读取实际合成后的 electron-builder 配置，macOS/Windows/Linux extraResources/extraFiles 均不包含归档，app.asar 文件排除项存在；`git diff --check` 通过。没有新增 TS/TSX 或生产业务逻辑，未重复全库编译和测试。

## 进一步澄清：保留功能与许可核查

用户强调需要保留实际办公功能，要求理解“对外分发许可声明”。本轮重新核对公司基线原始 LICENSE 与官方现行来源；本轮未变更业务实现，原件归档不算功能恢复完成。

- 项目根 MIT 与四项第三方文档技能的独立许可应分别处理。Anthropic 官方 README 明确把 docx/pdf/pptx/xlsx 归为 source-available、非开源；四项原目录的 LICENSE 包含禁止向第三方分发、转授权、转移材料，以及复制、派生等限制。保留版权文字本身不能替代分发授权；当前没有公司另行授权的证据，不能假定获得许可，也不据此断言公司一定没有授权。
- “分发”在本任务中的具体场景是向客户交付含这些材料的安装包，或把材料提供给第三方；不是简单指是否收费。仅做本地归档也不产生额外使用许可；归档只保留原件和证据。
- 这些条款不能被推导为必须删除 Word/Excel/PPT/PDF 的产品能力。可复用许可相适应的底层库，并对受限具体实现另取得授权或独立替代；复杂能力需要用等价任务验收。
- 重新拆解 54,721 删除行：39,460 为 schema；9,849 为旧助手脚本；5,412 为说明/许可/元信息。schema 涉及 ECMA/ISO/Microsoft 标准来源，不能仅因位于旧技能目录就认定每个文件只能适用 Anthropic 独立许可，也不能反过来假定现有副本都可自由分发。应从标准原发布者取得明确版本及对应许可/声明；微软 Open Specification Promise 是专利范围承诺，不能代替对具体 schema 副本版权许可的核查。
- 现有 python-docx（MIT）、python-pptx（MIT）、pypdf（BSD）等基础库与旧技能包是不同对象，应保留各自许可并核对实际锁定版本。功能保留不需要从零重写数万行 schema。
- 当前未恢复的高级能力仍是完整 OOXML 校验、旧 HTML 转 PPT 和 PDF 标注辅助等，不把归档、基础助手测试或保留声明写成这些能力已完整恢复。后续交付以“可用且经验证的功能”为条件，不能再以删功能代替处理具体材料的许可。

核查来源（2026-10-15）：

- Anthropic 官方范围说明：https://github.com/anthropics/skills#about-this-repository
- 原文档技能许可：https://github.com/anthropics/skills/blob/main/skills/docx/LICENSE.txt
- ECMA-376 官方标准及附件：https://ecma-international.org/publications-and-standards/standards/ecma-376/
- Ecma 软件许可政策：https://ecma-international.org/policies/by-ipr/ecma-international-policy-on-submission-inclusion-and-licensing-of-software/
- Microsoft OSP：https://learn.microsoft.com/en-us/openspecs/dev_center/ms-devcentlp/1c24c7c8-28b0-4ce1-a47d-95fe1ff504bc
- python-docx 许可：https://github.com/python-openxml/python-docx/blob/master/LICENSE
- python-pptx 许可：https://github.com/scanny/python-pptx/blob/master/LICENSE
- pypdf 许可：https://github.com/py-pdf/pypdf/blob/main/LICENSE

实际随包 macOS 环境元数据核对：python-docx 1.2.0 / MIT、python-pptx 1.0.2 / MIT、pypdf 6.20.0 / BSD-3-Clause。它们的许可与旧 Anthropic 技能包独立，不应因为旧包受限就一并移除。
