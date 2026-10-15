# 07 缺口与建议新增的接口

本文件分两部分:

- **A. 客户端代码引用、但 maas 源码中不存在的接口**:来自旧产品(上游 LobsterAI 服务端),星途目前已通过 `PRODUCT_FEATURES` 开关和空的 `apiBaseUrl` 关闭它们。列出来是为了避免有人误以为 maas 已提供。
- **B. 建议 maas 新增的管理接口**:用于由 maas 统一管理客户端的更新、公告、技能/MCP/插件目录。**这些不属于现有能力**,只是需求与数据结构说明。

约束:`maas-token` 严格只读,本文不修改网关。B 部分由网关团队决定是否实现。

## A. 客户端引用但 maas 不存在的接口

核对方法:在 `maas-token` 全部 `*.go` 中搜索路径关键字,均无命中(`client-updates`、`client-banners`、`enterprise`〔仅有无关匹配〕、`models/available`、`pricing-catalog`、`user/quota`、`subscription-trial`、`keyfrom`)。可信度:已读源码(搜索)。

这些调用都发往 `getServerApiBaseUrl()`(`src/main/libs/endpoints.ts`),其值取自 `PRODUCT_SERVICES.apiBaseUrl`,**当前为空字符串**;且 `PRODUCT_FEATURES.account / promotions / analytics / fileSharing / legacyPublishing` 全部为 `false`。因此这些调用目前**不会被触发**,但处理器仍在主进程注册。

| 客户端调用 | 位置 | 客户端期望 | maas 现状 |
| --- | --- | --- | --- |
| `GET /api/client-updates/check` | `src/main/libs/appUpdateGrayClient.ts` | 灰度更新,见 B1 | 不存在 |
| `GET /api/client-banners/active`、`/active-list`、`/snapshot` | `src/main/main.ts` | 侧栏横幅,见 B2 | 不存在 |
| `/api/enterprise/context`、`/identities`、`/{id}/quota-requests` | `src/main/enterpriseAccount/` | 企业成员、角色、额度 | 不存在 |
| `GET /api/models/available` | `src/main/main.ts` | 用户可用模型列表(旧信封 `{code:0,data}`) | 不存在。maas 对应能力是 `GET /api/user/models`(见 04)与 `GET /v1/models` |
| `GET /api/models/pricing-catalog` | `src/main/main.ts` | 模型价格目录 | 不存在。maas 对应能力是 `GET /api/pricing`(见下注) |
| `GET /api/user/quota`、`/profile`、`/profile-summary` | `src/main/main.ts` | 用户额度与资料(旧信封) | 不存在。maas 对应能力是 `GET /api/user/self` |
| `POST /api/auth/exchange`、`/refresh`、`/logout` | `src/main/main.ts`、`AuthSessionManager` | 旧的授权码换令牌登录 | 不存在。maas 登录见 01 |
| `GET /api/subscription-trial` | `src/main/ipcHandlers/subscriptionTrial.ts` | `{campaignCode, active, visible, eligible, reason, serverTimeEpochMs, endAtEpochMs}` | 不存在 |
| `POST /api/credits-reset-campaign/free-credits/claim`、`/api/purchase-offers/low-credit/activate` | `src/main/main.ts` | 活动类 | 不存在 |
| `/api/asr/realtime/sessions`、`/api/media/*`、`/api/sites*`、`/api/html-shares*` | 多处 | 语音转写、媒体、站点、分享 | 不存在 |

**旧信封**:这批接口统一返回 `{ "code": 0, "data": ... }`,与 maas 的 `{ "success": true, "data": ... }` 不同。`src/main/authQuota.ts`、`src/shared/auth/constants.ts` 按旧信封建模。若将来要把某项能力接到 maas,客户端需要新写解析,不能复用旧代码。

**`/api/pricing`**:maas 有 `GET /api/pricing`,挂 `HeaderNavModuleAuth("pricing")`:管理员把"pricing"导航模块关闭时返回 **403**(`pricing is disabled`);开启且不要求登录时**匿名也能访问**(`TryUserAuth`,匿名时 `group` 为空,可用分组只含全局清单),要求登录时走 `UserAuth`。返回 `data`(模型定价)、`vendors`、`group_ratio`、`usable_group`、`auto_groups`、`pricing_version` 等,登录后按用户的可用分组过滤(`controller/pricing.go: GetPricing`)。它**会暴露各分组倍率与模型单价**,与"用积分掩盖上游成本"的产品目标冲突,客户端接入前需决定展示策略;平台侧也要知道:只要 pricing 模块开着,这些价格任何人都能读到。本次未读其 `data` 内字段细节。

**`keyfrom`**:`src/shared/keyfrom/` 是渠道归因,构建时写入文件,作为请求体/查询字段拼进旧接口。**不存在 `/api/keyfrom` 接口**,maas 的调用不带该字段。

**非 maas 的第三方依赖**(不在 maas 范围,仅为完整):`skillStoreUrl`、`mcpMarketplaceUrl` 当前指向有道公开目录(见 B3);`TYPESAFE_SYSTEM_ONE_URL` 指向 `api.typesafe.ai`(决策模型)。

## B. 建议 maas 新增的管理接口(需求说明)

目标:让管理员在 maas 统一管理星途客户端的**版本更新、公告、扩展目录**。

**设计原则**:

1. 客户端是消费端,所有接口只读、Bearer 登录 JWT 鉴权,失败静默回退本地默认(参考 `AppUpdateGrayClient`:2 秒超时、严格字段校验、任何异常返回 null、`redirect:'error'`、`credentials:'omit'`)。
2. 管理端是写操作,沿用 `AdminAuth` / `RootAuth` 与自动审计。
3. 凡是"下发后会在用户机器上执行"的内容(MCP 命令、插件、技能包),必须带**签名与哈希**,客户端验证通过才使用。

### B1. 客户端版本与灰度更新

**消费端**(星途已按此契约实现客户端,见 `appUpdateGrayClient.ts`;服务端不存在):

```
GET /api/client-updates/check?source=auto|manual&version=<当前版本>&platform=win32|darwin&arch=x64|arm64
Authorization: Bearer <登录JWT>
```

响应(客户端的严格校验规则一并列出,服务端必须满足,否则客户端静默忽略):

```json
{
  "code": 0,
  "data": {
    "updateAvailable": true,
    "channel": "gray",
    "rolloutId": "r-20261101-a",
    "policyRevision": 3,
    "release": {
      "version": "2026.10.1",
      "date": "2026-11-01",
      "url": "https://cdn.example.com/starpath-2026.10.1.exe",
      "changeLog": {
        "ch": { "title": "...", "content": ["...", "..."] },
        "en": { "title": "...", "content": ["...", "..."] }
      }
    }
  }
}
```

客户端校验(`AppUpdateGrayClient.query`,已读源码):

- 顶层 `code === 0`(**旧信封**,不是 `success`);`data.updateAvailable === true`;`data.channel === "gray"`。
- `rolloutId`:字符串,匹配 `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`。
- `policyRevision`:安全整数且 `> 0`。
- `release.version`:匹配 `^\d+(\.\d+)*$`,长度 ≤ 64,每段 ≤ 2147483647,且**严格大于当前版本**。
- `release.date`:非空字符串。
- `release.url`:`https`,有主机名,无用户名/密码/端口/hash,路径以 `.exe`(win32)或 `.dmg`(darwin)结尾。
- `release.changeLog.ch` 与 `.en`:都必须存在,各含字符串 `title` 与字符串数组 `content`。
- 仅 `win32` 与 `darwin`、`x64` 与 `arm64`;Linux 不走此接口。
- 若灰度版本高于稳定版本,灰度版本胜出。

> 注:信封用 `code:0` 是客户端既有契约。若网关新增此接口,要么沿用 `code:0` 信封,要么同步改客户端解析。**这是需要决定的契约问题**,本文不替网关团队决定。

**稳定通道**:客户端 `appUpdateCoordinator.ts` 另有一个由 `product.json` 的 `updateUrl` 指定的稳定更新源,当前为空(`updateUrl` 为空时 `App.tsx` 关闭更新检查)。预期响应:

```json
{ "code": 0, "data": { "value": {
  "version": "2026.10.1", "date": "2026-11-01",
  "changeLog": { "ch": { "title": "", "content": [] }, "en": { "title": "", "content": [] } },
  "macArm": { "url": "..." }, "macIntel": { "url": "..." }, "windowsX64": { "url": "..." }
} } }
```

可信度:字段名来自 `appUpdateCoordinator.ts` 第 57–63、732–753 行的读取代码;未读其完整校验。**Windows 安装包 URL** 由 `appUpdateUrlPolicy.ts` 校验 HTTPS 与 `.exe`;安装包哈希与代码签名校验在 `UPSTREAM.md` 中标注为"另行工作",**当前没有签名元数据**。

**管理端建议**(新增,不存在):

| 接口 | 说明 |
| --- | --- |
| `GET/POST/PUT/DELETE /api/admin/client-releases` | 版本记录:版本号、平台、架构、安装包 URL、SHA-256、更新日志(中/英)、状态 |
| `PUT /api/admin/client-releases/:id/rollout` | 灰度策略:比例或名单、`rolloutId`、`policyRevision`(每次修改递增,客户端据此判定策略是否变更) |

### B2. 公告与侧栏横幅

**消费端契约**(客户端既有,见 `docs/server-integration/2026-07-01-client-sidebar-banner.md`、`2026-08-27-client-banner-schedule.md`):

```
GET /api/client-banners/active-list?placement=desktop_sidebar     (匿名,不发送用户身份)
```

```json
{ "code": 0, "message": "success", "data": [ {
  "id": 1, "placement": "desktop_sidebar", "activityDescription": "...", "weight": 1, "status": 1,
  "linkUrl": "https://...", "imageUrl": "https://...", "imageWidth": 800, "imageHeight": 250,
  "updatedAt": "2026-07-01T10:00:00"
} ] }
```

要点:匿名可调、不得因登录状态改变返回;图片建议 800×250,**不支持 SVG**;客户端按"位置 + 所有横幅 id 与 `updatedAt`"生成版本键,用户关闭后同版本不再显示,任何横幅新增或更新则重新显示。当前 `PRODUCT_FEATURES.promotions=false`,此功能被关闭。

**maas 现有可替代能力**:`GET /api/notice`、`/api/about`、`/api/home_page_content`(无需登录,返回管理员配置的文本/HTML,键 `Notice` / `About` / `HomePageContent`);`GET /api/user/login-notice`(需登录会话,含 `announcements` 与违规提示统计,受 `console_setting` 的公告开关控制);`GET /api/status` 里的 `announcements_enabled`。这些是**文本公告**,没有图片横幅、投放位置、权重、起止时间。

### B3. 技能 / MCP / 插件目录(可见性与升级控制)

**现状**(客户端侧,已读源码):

- 技能目录 `services.skillStoreUrl`、MCP 目录 `services.mcpMarketplaceUrl` 都是**无认证 HTTPS GET**,当前指向有道 `api-overmind.youdao.com`。技能目录响应(`skills:fetchMarketplace`)结构:`{ data: { value: { localSkill: [...], marketplace: [...], marketTags: [...] } } }`,`marketplace` 项含 `id, name, description, url(zip), version, source{from,url,author}, displayName, icon`。客户端用 `version` 与已装版本比较显示"可更新"。
- **没有签名、没有哈希**,下载的技能只经静态安全扫描(`skillSecurityScanner`),风险结果需用户确认。MCP 目录条目含 `command` 与 `defaultArgs`,**会被拼成在用户机器上启动的命令**——目录来源等于代码执行来源。
- 插件可见性是**编译期硬编码**(`INTERNAL_PLUGIN_IDS`),没有远程开关。
- 已有一个类似"管理员下发"的模型:企业 `manifest.json`(`ui: {id: hide|disable|readonly}`、`sync: {skills, mcp, plugins: bool|merge|overwrite}`、`disableUpdate`),但它是**本地文件**,没有远程传输。

**建议的目录接口**(新增,不存在):

```
GET /api/client-catalog/skills       (或 mcp / plugins)
Authorization: Bearer <登录JWT>
```

建议响应结构:

```json
{
  "success": true,
  "data": {
    "revision": 12,
    "generated_at": 1730000000,
    "items": [{
      "id": "docx",
      "kind": "skill",
      "version": "2.0.0",
      "visible": true,
      "enforce": "none|recommended|required|blocked",
      "min_client_version": "2026.9.23",
      "url": "https://cdn.example.com/skills/docx-2.0.0.zip",
      "sha256": "<64位十六进制>",
      "size": 123456,
      "display_name": { "zh": "...", "en": "..." },
      "description": { "zh": "...", "en": "..." },
      "tags": ["office"]
    }],
    "signature": "<对 items 规范化 JSON 的 ed25519 签名,base64>"
  }
}
```

要点:

1. **`signature` 必须有**:客户端内置公钥,验签失败则丢弃整份目录并回退本地默认。否则目录被劫持就是远程代码执行。
2. **`sha256` 必须有**:下载后校验再解压/安装。
3. **MCP 条目**不应允许任意 `command`:建议只允许"包名 + 版本 + 固定启动方式",或由客户端侧白名单决定可启动的命令。
4. `enforce` 语义:`blocked` 客户端隐藏并禁用;`required` 提示并锁定启用;`recommended` 仅推荐;`none` 普通。
5. `revision` 用于客户端缓存与变更判断。
6. 客户端失败静默:接口不可用时沿用本地缓存或内置默认。

**管理端建议**:`/api/admin/client-catalog/*` 增删改条目、设置可见性与强制策略、签名由服务端私钥完成(私钥不进数据库明文,建议环境变量或密钥管理)。

**与客户端既有约束的关系**:`AGENTS.md` 规定技能/MCP/插件的执行链路须与上游官方行为一致,属于受保护路径,不得为界面或品牌工作去重构。目录接口只改变"能看到什么、可更新到什么版本",不改变执行链路;但要让客户端消费它,必须在客户端新增一个获取与验签层并替换 `skillStoreUrl` / `mcpMarketplaceUrl` 的来源,**需要单独规格并经审核**,不在本对接文档范围。

### B4. 客户端配置下发(可选)

当前 `featureFlags.ts` 只有一个常量,`PRODUCT_FEATURES` 是编译期布尔,没有远程开关。若需要在不发版的情况下开关功能,可新增:

```
GET /api/client-config      (Bearer;或匿名只读公共部分)
```

返回 `{ revision, flags: { <name>: bool }, ui: { <id>: "hide"|"disable"|"readonly" } }`,字段与企业 `manifest.json` 的 `ui` 语义对齐,便于复用现有同步链路。失败静默回退本地默认。

## C. 现有可复用的平台能力(无需新增)

| 需求 | 现有接口 | 局限 |
| --- | --- | --- |
| 文本公告 | `GET /api/notice`、`/api/about`、`/api/home_page_content`,配置键 `Notice` / `About` / `HomePageContent` | 纯文本/HTML,无投放、权重、起止时间 |
| 登录后公告 | `GET /api/user/login-notice` | 需登录会话(PAT 不可);含违规提示统计 |
| 站点开关 | `GET /api/status` | 只读,字段固定 |
| 用户级偏好 | `PUT /api/user/setting`(`UpdateUserSetting`) | 通知与告警类设置,不是客户端功能开关 |
| 管理员审计 | `AdminAuth` 兜底审计 | 无需新增 |

可信度:已读源码(路由与处理器);`login-notice` 的 `announcements` 结构只读了开头。
