# 公开扩展目录接入

## 问题与范围

用户要求先配置可获取的官方扩展。星途已有技能、插件与 MCP 的安装执行链路，但发行配置未指定技能和 MCP 目录。

仅配置上游 LobsterAI 的公开生产目录，复用现有获取、展示、安装与升级流程。npm、ClawHub 和 GitHub 来源已有支持，不替换其执行实现。不修改 gateway 平台、不修改用户配置、不自动安装或升级可执行扩展，不启用上游账户、遥测、付费、分享、套件商店或桌面安装包更新源。

## 来源与兼容

- 技能：`https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/prod/skill-store`
- MCP：`https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/prod/mcp-marketplace`

地址依据本仓库上游基线 `791a352d` 的 endpoints 和 MCP handler 核对。2026-10-14 无凭据 GET 成功，技能响应 `data.value` 包含 73 项 marketplace、22 项 localSkill 和 9 项 marketTags；MCP 响应包含 13 项 servers 和 7 项 categories，与当前消费者格式一致。数量为检查时快照，不是保证所有条目兼容。

公开目录不代表每项扩展已获发行许可或完成星途验收。第三方密钥、登录及服务收费按提供方要求由用户配置；随包技能仍使用星途维护版本，不恢复已替换的受限资源。官方应用专属迁移等条目不因出现在目录中就视为星途已支持。安装继续经过现有安全检查与用户选择。

## 验收与验证

- 两个公开目录可无凭据读取，字段与当前解析器匹配。
- 发行配置只开放这两个目录；其他上游服务和商业功能继续关闭。
- 相关测试、改动文件 lint、renderer 构建与 Electron 编译通过。
- 不重启用户正在使用的客户端；实际目录交互和第三方连接验证单独记录。

## 状态

已完成两个公开目录的配置。macOS 本地验证：无凭据读取及实时目录字段检查通过；`npm test -- src/shared/product/privacy.test.ts src/renderer/services/mcpRegistryPresentation.test.ts src/main/plugins/pluginManager.test.ts` 共 3 个文件、20 项测试通过；改动测试文件 ESLint、`npm run compile:electron`、`npm run build` 与限定文件 `git diff --check` 通过。构建仍有第三方 eval、重复 sourcemap、混合动态/静态导入和大包提示，未在本次修改中处理。

未重启活动客户端，未进行客户端目录交互截图、逐项扩展安装或真实第三方工具调用；Windows/Linux 原生验收和 GitHub CI 未执行。客户端自动更新服务、自建目录、全部扩展兼容认证、后台自动升级不属于本次范围。
