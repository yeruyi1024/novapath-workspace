# 星途 × maas 对接接口文档

适用对象:maas 平台管理员与开发人员、星途客户端开发人员。
范围:登录与会话、套餐与订阅、分组与密钥、钱包与额度展示、管理员配置;客户端架构与工具控制(09、10);对话、图片、视频、用量调用接口(11)。

## 阅读顺序

### 平台接口(来自 maas-token 源码与平台文档)

| 文件 | 内容 | 谁要读 |
| --- | --- | --- |
| [01-auth-login.md](01-auth-login.md) | 登录、会话刷新、退出、当前用户 | 客户端、平台 |
| [02-subscription-user.md](02-subscription-user.md) | 套餐列表、我的订阅、扣费偏好、购买 | 客户端、平台 |
| [03-subscription-admin.md](03-subscription-admin.md) | 管理员配置套餐、绑定与失效订阅 | 平台管理员 |
| [04-groups-and-tokens.md](04-groups-and-tokens.md) | 分组列表、模型列表、API 密钥增删改 | 客户端、平台 |
| [05-wallet-billing-display.md](05-wallet-billing-display.md) | 钱包额度、充值信息、用量日志、额度展示配置 | 客户端、平台 |
| [06-admin-config.md](06-admin-config.md) | 分组倍率、可用分组、展示单位等配置键 | 平台管理员 |
| [11-platform-model-apis.md](11-platform-model-apis.md) | 对话、图片、视频、用量、密钥接口,及与旧客户端接口的对照 | 客户端、平台 |

### 缺口与联调

| 文件 | 内容 | 谁要读 |
| --- | --- | --- |
| [07-gaps-and-new-endpoints.md](07-gaps-and-new-endpoints.md) | 客户端引用但平台不存在的接口;建议新增的接口 | 平台开发 |
| [08-integration-checklist.md](08-integration-checklist.md) | 联调检查清单 | 联调双方 |

### 客户端(来自 shilijia-agent 源码)

| 文件 | 内容 | 谁要读 |
| --- | --- | --- |
| [09-client-architecture.md](09-client-architecture.md) | 客户端三条平台链路、OpenClaw、对话路径、插件/技能/MCP、维护约束 | 客户端维护 |
| [10-tool-control.md](10-tool-control.md) | 工具控制:禁用、审批、沙箱、浏览器、门禁及风险 | 客户端维护 |

### 管理员手册准备

| 文件 | 内容 | 谁要读 |
| --- | --- | --- |
| [12-admin-manual-outline.md](12-admin-manual-outline.md) | 聚合平台管理员手册的章节顺序、陷阱清单、资料缺口 | 手册作者 |

## 快速定位

- 接图片、视频生成:先读 11,再读 09 第 2.3 节(旧链路现状)。
- 接账户、余额、订阅展示:读 01、02、05,客户端现状见 09 第 2.1 节。
- 要收紧或排查工具权限:读 10。
- 平台接口不够用时:记入 07,不要改 maas-token(见 09 第 8 节)。

## 基础约定

### 基础地址

`https://gateway.ai.shilijia.xyz`。星途客户端当前把它写死为常量 `DEFAULT_MAAS_ORIGIN`(`src/shared/auth/maas.ts`),没有测试环境配置入口。

### 响应格式

绝大多数 `/api/*` 接口返回统一结构:

```json
{ "success": true, "message": "", "data": {} }
```

**业务错误也返回 HTTP 200,用 `success: false` 表示**:

```json
{ "success": false, "message": "套餐未启用" }
```

只有鉴权失败、限流、手机验证码等少数场景使用 4xx/5xx。客户端必须同时判断 HTTP 状态码和 `success`。

例外:订阅购买接口中,`epay/pay` 成功、`stripe/pay`、`creem/pay`、`waffo-pancake/pay` 的成功与失败响应都是 `{"message":"success"|"error","data":...}`,**没有 `success` 字段**,各自结构不同(见 02 的"响应格式差异汇总")。

### 分页

列表接口使用查询参数 `p`(页码,从 1 开始)和 `page_size`(也接受 `ps`、`size`),默认每页 10,单页最大 100。响应 `data` 为:

```json
{ "page": 1, "page_size": 10, "total": 0, "items": [] }
```

来源:`common.PageInfo`、`common.GetPageQuery`(已读源码)。

### 鉴权方式

| 凭证 | 请求头 | 获取方式 | 备注 |
| --- | --- | --- | --- |
| 登录 Access Token(JWT) | `Authorization: Bearer <token>` | 登录接口返回,有效期 15 分钟 | 星途使用此方式 |
| 面板 PAT | `Authorization: Bearer <pat>` 或单值 `Authorization: <pat>` | `GET /api/user/token` | 不能调用会话管理接口;**重新生成会覆盖旧值** |
| 模型 API Key | `Authorization: Bearer sk-...` | `POST /api/token` | 仅用于 `/v1/*` 模型调用,不能调用 `/api/*` 管理接口 |

`UserAuth` 与 `AdminAuth` 通过同一个 `authHelper` 同时接受 JWT 和 PAT(`middleware/auth.go: authHelper / classifyDashboardCredential`)。本文所有"用户鉴权"的接口都可以用登录 JWT 调用。

`New-Api-User` 请求头已不参与鉴权,不需要发送。

### 通用错误码(鉴权层)

| HTTP | `code` | 含义 | 客户端处理 |
| --- | --- | --- | --- |
| 401 | `AUTH_TOKEN_EXPIRED` | Access Token 已过期 | 调 refresh 后重试一次 |
| 401 | `AUTH_SESSION_REVOKED` | 登录会话被撤销 | 清除本地状态,重新登录 |
| 401 | `AUTH_UNAUTHORIZED` | 凭证无效 | 同上 |
| 401 | `AUTH_USER_DISABLED` | 账号被禁用 | 提示联系管理员 |
| 401 | `AUTH_USER_INVALID` | 用户信息不合法 | 同上 |
| 403 | `AUTH_INSUFFICIENT_PRIVILEGE` | 权限不足(例如普通用户调管理接口) | 提示无权限 |
| 409 | `AUTH_SESSION_MISMATCH` | 请求头 SID 与 Cookie 对应会话不一致 | 去掉 `X-Auth-Session` 重试 refresh |
| 409 | `AUTH_SESSION_LIMIT` | 活跃会话数达上限(默认 50) | 引导用户在其他设备撤销会话 |
| 429 | `AUTH_SESSION_ISSUANCE_LIMIT` | 签发窗口内会话数达上限(默认 100/24h) | 稍后再试 |
| 500 | `AUTH_INTERNAL_ERROR` | 服务端错误 | 稍后重试 |

来源:`middleware/auth.go: writeDashboardAuthError`、`docs/authentication.md`。

### 限流

| 中间件 | 作用接口 |
| --- | --- |
| `CriticalRateLimit` | 登录、注册、刷新、退出、购买、取密钥等敏感操作 |
| `SearchRateLimit` | 密钥搜索 |
| `EmailVerificationRateLimit` | 邮箱验证码 |
| `UserCriticalRateLimit(name)` | 按用户的敏感操作,例如生成 PAT |

具体阈值由平台配置决定,文档不写死。

### 可信度标注

每个接口和关键结论后标注:

- **已读源码**:直接读到的代码,函数名附后(行号随版本漂移,以函数名为准)。
- **推断**:由源码推出,未运行验证。
- **待联调**:必须实测后才能确认,见 [08](08-integration-checklist.md)。

01–08 与 11 来自对 `maas-token` 的只读阅读,未运行网关、未读线上配置与数据;11 中的请求示例取自平台文档,未向线上发送请求。09、10 来自对 shilijia-agent 的只读阅读,未运行客户端。

## 术语

| 术语 | 含义 |
| --- | --- |
| 用户分组 | 账户所属的分组(`users.group`)。订阅的 `upgrade_group` 修改的是这一层,到期后降回 |
| 密钥分组 | API 密钥上的 `group` 字段。留空表示跟随账户当前分组;非空表示锁定到该分组 |
| 可用分组 | 某个用户分组下允许选择的密钥分组集合,由 `UserUsableGroups` 配置加上该用户分组的特殊规则计算得出 |
| 额度 quota | 平台内部计量单位,钱包和订阅共用。`quota_per_unit` 个额度 = 1 美元(线上当前为 500000) |
| 钱包 | 用户账户上的 `quota`,来自充值、签到、兑换码等 |
| 订阅 | 用户购买套餐后产生的独立额度池,有有效期,可周期重置 |
