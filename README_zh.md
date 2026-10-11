# 星途 StarPath

面向聚合模型平台的桌面工作空间。支持对话任务、本地文件、模型配置、工具连接、自动化与内容预览。

开发范围、当前状态、执行顺序与验收标准见[桌面客户端开发与验收计划](specs/product/2026-10-11-desktop-client-plan.md)。

本仓库以 `2026.9.23` 发布版为基线。[源码来源](UPSTREAM.md)和[本地构建、打包及 GitHub CI 方案](docs/BUILD_AND_CI_zh.md)记录公司仓库此前的构建结果、校验和及构建边界。这些结果早于本次星途改造，不代表当前版本的安装包已完成验收。

## 第一阶段

- 以“项目 + 对话”为中心的界面：新建项目、项目内对话、无项目对话和输入框项目切换。
- 项目可关联本地文件夹，支持改名、修改路径和移除分组；对话可归入项目或“无项目”。这些信息保存在本机，重启后保留。
- 项目路径保存及新对话启动前检查文件夹是否存在；调整分组不会改变已有对话的工作目录。移除项目不删除对话或本地文件。
- 对话回复中的文件链接和成果卡片可点击，在当前对话右侧预览。支持 PPTX、PDF、DOCX、表格和图片，并使用这段对话的工作目录解析相对路径。旧版 .ppt 或不支持的格式通过系统应用打开；预览不承诺 PowerPoint 动画兼容。
- 简洁的新对话页、可收起侧栏；技能、工作流、自动化和助手管理放在“更多”中。
- 产品名称、公共服务地址及商业功能开关统一在 `src/shared/product/product.json` 管理。
- 默认关闭平台登录、营销活动与统计上报；原平台登录、更新、商店、充值、文档与统计地址不作为默认值。
- 首次启动可直接进入模型配置，使用聚合平台的 OpenAI-compatible Base URL、API Key 和模型名称。
- 应用、窗口、托盘、安装包图标与会话导出使用统一视觉标识。

## 本地开发

要求 Node.js `>=24.15.0 <25`、npm `>=11.17.0 <12`。

```bash
npm ci
npm run electron:dev
```

运行任务需要 OpenClaw runtime；首次准备运行时：

```bash
npm run openclaw:runtime:host
```

校验：

```bash
npm test
npm run build
npm run compile:electron
```

## 产品配置

编辑 `src/shared/product/product.json` 后重新构建。配置中只能放公共信息，不要保存 API Key、签名密码或客户凭据。

`services.apiBaseUrl` 是桌面客户端的账户服务协议，包含 `/api/auth/*`、用户、配额、商店和托管服务接口。**它不是 New API 的 OpenAI-compatible 推理地址**。第一阶段请通过设置中的自定义模型填写 New API 地址；账户、充值、托管发布等商业能力需要后续适配你们的后台协议，不能只替换域名就启用。

`features.analytics` 与 `services.analyticsUrl` 默认关闭 / 留空；即使未来配置统计服务，也必须由用户在设置中显式开启统计。`features.account`、`features.promotions` 应在相应后台完成适配后启用。

未配置的支持邮箱、文档、社区、服务条款和更新入口不显示。产品名称仍是占位名，发布前请同步检查 `package.json`、`electron-builder.json` 与启动页；程序运行与安装包名称读取集中配置。

图标为独立的终端符号，源文件 `public/logo.svg`。macOS 上可运行 `swift scripts/generate-product-icons.swift` 生成各平台应用图标。

## 兼容性与来源

本项目基于 LobsterAI，底层运行时为 OpenClaw。上游 MIT 许可证保留在 `LICENSE`，安装包包含 `licenses/LobsterAI-LICENSE.txt`。第三方组件继续遵循各自许可证。

数据库文件名、IPC、模型提供商标识、旧导入格式和旧链接协议中的历史标识保留，以避免破坏现有数据和运行时契约。它们不作为新的产品展示名称。历史文档、测试夹具和补丁中的上游名称用于溯源与兼容性维护。

当前阶段尚未完成：你们的账户/计费协议接入、生产域名配置、签名安装包和真实网关端到端验收。
