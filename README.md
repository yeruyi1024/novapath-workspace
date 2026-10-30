<div align="center">

<h1>星途 NovaPath</h1>

<p><strong>对话、文件与工具，一个工作空间。</strong></p>
<p>围绕项目开展工作，从资料整理到文档交付。</p>

<p>
  <a href="#功能概览">功能概览</a> ·
  <a href="#开始使用">开始使用</a> ·
  <a href="#从源码运行">源码运行</a> ·
  <a href="#开发说明">开发说明</a> ·
  <a href="#文档导航">文档导航</a>
</p>

</div>

---

星途 NovaPath 是面向日常工作的 AI 桌面工作空间。将对话、工作目录与生成成果组织在项目中，让资料整理、调研、文档制作与任务跟进形成连续的工作过程。按需连接模型、技能和外部工具，从一个具体问题开始，逐步完成可查看、可继续处理的工作成果。

## 功能概览

### 围绕项目，整理对话与成果

按项目组织工作，关联本地文件夹，保留对话历史与工作上下文。生成的文档、表格、PPT、PDF 和常见文本文件可以在右侧预览，让讨论与成果放在一起。

### 用量清楚，账户与套餐集中管理

连接公司的 MaaS 平台，管理个人资料与安全状态，查看可用积分、钱包余额及近 7 天或 30 天的 Token 用量。套餐页展示当前套餐、额度和权益说明，购买能力以平台开放情况及确认页面为准。

### 按需组合工具，让常用流程可复用

按需使用连接器、技能和 MCP，将常用任务与工具组织成工作流；通过定时任务安排重复性工作并查看执行记录。微信、钉钉、飞书、企业微信及邮件连接按工作需要配置。

模型、套餐和外部服务取决于平台配置与用户授权。公司下发的技能或 MCP 推荐由用户确认添加，隐藏推荐不会自动卸载用户已有内容。

客户端在本机保存对话、项目和应用配置；模型请求通过所配置的服务处理。账户、余额、套餐及平台用量以 MaaS 返回的数据为准。

### 从一项具体工作开始

| 想完成的工作 | 可以这样描述 |
| --- | --- |
| 整理资料 | “阅读这个文件夹里的资料，归纳关键结论，并列出待确认的问题。” |
| 准备汇报 | “根据这些资料整理汇报大纲，再生成一份演示文稿。” |
| 跟进会议 | “把会议记录整理成行动清单，区分已明确和待确认的负责人、截止时间。” |

## 开始使用

1. 使用维护者提供的星途安装包，在对应操作系统安装并启动。
2. 按部署环境完成平台登录，确认账户拥有可用模型和额度。
3. 新建对话或项目；需要处理本地资料时关联工作文件夹。
4. 按工作需要添加技能、MCP 或工作流，再开始具体任务。

当前仓库处于上线前收尾阶段。正式下载、签名与更新地址以发行配置为准；本地构建或界面预览不代表已经完成正式发布。

## 从源码运行

环境要求：

- Node.js `>=24.15.0 <25`，优先采用 [`.nvmrc`](.nvmrc) 指定版本。
- npm `>=11.17.0 <12`；固定构建工具链见[构建与 CI 说明](docs/BUILD_AND_CI_zh.md)。
- Git 和 pnpm，用于准备固定版本的 OpenClaw 运行时及相关依赖。
- Windows 开发环境还需满足项目的 Git Bash 与原生依赖要求。

```bash
git clone https://github.com/yeruyi1024/novapath-workspace.git
cd novapath-workspace
npm ci
```

首次运行，准备固定版本运行时并启动客户端：

```bash
npm run electron:dev:openclaw
```

运行时已准备完成且版本、补丁未变化时，日常启动使用：

```bash
npm run electron:dev
```

开发服务器默认使用 `http://localhost:5175`。平台地址、模型与账户配置使用实际部署环境，不从其他项目复制密钥，也不将本地凭据提交到仓库。

## 开发说明

### 技术结构

桌面端使用 Electron、React、TypeScript 和 Tailwind；本地数据保存在 SQLite，任务执行使用固定版本的 OpenClaw。账户与公司扩展通过独立适配层接入 MaaS。

| 模块 | 职责 |
| --- | --- |
| 界面层 | 项目与对话、文件预览、账户页面、设置及扩展管理，通过预加载接口调用本地能力 |
| 本地服务 | 应用生命周期、本地数据、文件访问、平台认证与运行时管理 |
| 任务执行 | OpenClaw 负责模型和工具执行，桌面端展示过程与结果 |
| 平台接入 | MaaS 提供账户、密钥、积分、套餐和公司扩展接口，模型请求按平台配置接入 |

### 目录入口

```text
src/renderer/          桌面界面、交互与状态
src/main/              Electron 主进程、本地服务与平台适配
src/shared/            跨进程类型、协议和产品配置
scripts/               运行时准备、构建与打包脚本
SKILLs/                内置技能及相关资源
docs/                  开发、构建与验收文档
```

品牌与产品入口见[产品配置](src/shared/product/product.json)。开始修改前阅读[开发规范](CONTRIBUTING.md)和[项目约定](AGENTS.md)，按[验收清单](docs/development/acceptance.md)选择与本次改动对应的检查。

### 常用命令

```bash
# 检查并构建界面
npm run build

# 编译 Electron 主进程与预加载脚本
npm run compile:electron

# 运行项目测试
npm test

# 对本次改动的 TypeScript 文件执行检查
npx eslint --ext ts,tsx --report-unused-disable-directives --max-warnings 0 <files>
```

安装包在目标系统与架构上按既有发行流程构建，具体命令、运行时资源及 Windows 安装门槛见[构建与 CI 说明](docs/BUILD_AND_CI_zh.md)。macOS 与 Windows 的安装、升级、签名及真实模型验收分别记录，不能用编译结果替代。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [开发规范](CONTRIBUTING.md) | 范围控制、架构边界与协作规则 |
| [项目约定](AGENTS.md) | 开发入口、固定运行时与受保护能力 |
| [界面规范](docs/development/ui-guidelines.md) | 工作空间、账户与公共控件的展示约定 |
| [验收清单](docs/development/acceptance.md) | 按改动选择检查与发行验收 |
| [扩展能力](docs/development/extensions.md) | 连接器、技能、MCP 与文档能力边界 |
| [构建与 CI](docs/BUILD_AND_CI_zh.md) | 工具链、安装包、自动检查和平台差异 |
| [源码来源](UPSTREAM.md) | 上游基线、来源提交与构建沿革 |

当前产品标识与服务入口以[产品配置](src/shared/product/product.json)及程序实现为准，具体检查结果以对应版本的验收记录为准。

---

## 来源与许可

星途 NovaPath 基于 [NetEase Youdao / LobsterAI](https://github.com/netease-youdao/LobsterAI) 的开源桌面应用基础进行定制开发，并由本项目独立维护。应用基线为发布版 `2026.9.23`、提交 `791a352dee3b3d8c6f64edcaf229ce474a68f6c5`。感谢网易有道和上游作者、贡献者提供的开源基础。来源记录见 [UPSTREAM.md](UPSTREAM.md)。

保留上游 [MIT License](LICENSE) 与版权声明：`Copyright (c) 2026 NetEase Youdao`。OpenClaw、办公技能及其他第三方组件按各自许可与来源说明使用，详见[第三方声明](resources/THIRD_PARTY_NOTICES.md)。
