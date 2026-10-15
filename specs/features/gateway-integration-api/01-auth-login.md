# 01 登录与会话

## 总览

星途是桌面客户端,不是浏览器,但网关的登录会话模型为浏览器设计:

- **Access Token**:JWT,15 分钟有效,放在 `Authorization: Bearer` 里。
- **Refresh Token**:随机不透明值,最长 30 天,**只通过 `HttpOnly` Cookie 下发**。响应体里**没有** refresh token。Cookie 属性:

| 属性 | 值 |
| --- | --- |
| 名称 | `new_api_refresh` |
| 路径 | `/api/user/auth`(只随 refresh/logout 发送) |
| `HttpOnly` | 是 |
| `SameSite` | `Strict` |
| `Secure` | 取决于 `SESSION_COOKIE_SECURE` 环境变量 |
| 有效期 | 到会话 `expires_at` |

来源:`service/auth_session.go: WriteRefreshCookie`。
- 每次 refresh 都会**轮换** Refresh Token(服务端 `Set-Cookie` 新值)。
- 登录会话记录在 `user_sessions`,可被用户或管理员撤销。

桌面客户端因此必须自己维护一个 **cookie jar**,并在每次 refresh 时保存新 Cookie。星途的做法:Electron 隔离 session(非持久分区)+ 用 `safeStorage` 加密保存 Cookie 到本地文件。

来源:`docs/authentication.md`、`controller/auth_session.go: RefreshAuth`(已读源码)。

## 统一的登录成功响应(AuthBundle)

密码登录、2FA、短信登录、Passkey、OAuth 成功后都返回:

```json
{
  "success": true,
  "message": "",
  "data": {
    "access_token": "eyJ...",
    "token_type": "Bearer",
    "access_expires_at": 1730000000,
    "user": { "id": 1, "username": "demo", "display_name": "Demo", "role": 1, "status": 1, "group": "default", "quota": 0, "used_quota": 0, "request_count": 0 },
    "session": {
      "sid": "...",
      "current": true,
      "login_method": "password",
      "ip": "1.2.3.4",
      "user_agent": "...",
      "created_at": 1730000000,
      "last_active_at": 1730000000,
      "expires_at": 1732592000
    }
  }
}
```

同时 `Set-Cookie` 下发 Refresh Cookie。`user` 的完整字段见 `GET /api/user/self`。

来源:`controller/user.go: setupLoginAtAuthVersion`、`service/auth_session.go: AuthBundle / LoginSessionView`(已读源码)。

## 接口

### GET /api/status

鉴权:无。用途:登录前读取站点能力和额度展示配置。

关键字段(完整列表见 `controller/misc.go: GetStatus`):

| 字段 | 说明 |
| --- | --- |
| `password_login_enabled` | 是否允许密码登录 |
| `sms_login` | 是否启用短信登录 |
| `turnstile_check` / `turnstile_site_key` | 是否需要 Cloudflare Turnstile 人机验证 |
| `passkey_login` | 是否启用 Passkey |
| `github_oauth` / `wechat_login` / `oidc_enabled` / `telegram_oauth` 等 | 各第三方登录开关 |
| `register_enabled` / `password_register_enabled` / `email_verification` | 注册相关开关 |
| `quota_display_type` | `USD` / `CNY` / `TOKENS` / `CUSTOM`,见 05 |
| `custom_currency_symbol` / `custom_currency_exchange_rate` | `CUSTOM` 模式的符号和汇率 |
| `quota_per_unit` / `usd_exchange_rate` / `display_in_currency` | 额度换算 |
| `server_address` / `system_name` / `logo` | 站点信息 |
| `version` | 网关版本 |

可信度:已读源码。

### POST /api/user/login

鉴权:无。限流:`CriticalRateLimit`;如开启 Turnstile 则需要 Turnstile 校验。

请求体:

```json
{ "username": "demo", "password": "******" }
```

响应(三种):

1. 成功(未开 2FA):AuthBundle(见上)。
2. 需要 2FA:
```json
{ "success": true, "message": "...", "data": { "require_2fa": true, "flow_token": "...", "expires_at": 1730000300, "sms_available": false } }
```
`flow_token` 5 分钟有效,只能消费一次。
3. 失败:HTTP 200,`success: false`,`message` 为"用户名或密码错误"等。密码登录被关闭时同样是 `success:false`。

注意:本接口**没有**为桌面端提供"响应体返回 refresh token"的选项。

可信度:已读源码(`controller/user.go: Login`)。

### POST /api/user/login/2fa

请求体:

```json
{ "flow_token": "...", "code": "123456" }
```

`code` 必填。成功返回 AuthBundle;`flow_token` 过期时 `success:false`,`message` 为"会话已过期,请重新登录"。

可信度:已读源码(`controller/twofa.go: Verify2FALogin`、`Verify2FARequest`)。

### POST /api/user/login/sms/code

发送短信登录验证码。请求体:

```json
{ "phone": "13800000000" }
```

成功响应(`writePhoneChallenge`):

```json
{ "success": true, "data": { "challenge_token": "...", "expires_in": 300, "retry_after": 60 } }
```

`retry_after` 固定 60 秒;`expires_in` 取自 `model.SMSChallengeTTL`。号码未绑定任何账号时**响应与已绑定相同**(防账号枚举),但后续验证会失败。

错误使用 4xx + `code`:

| HTTP | `code` | 含义 |
| --- | --- | --- |
| 503 | `PHONE_SMS_UNAVAILABLE` | 短信未启用 |
| 429 | `PHONE_RATE_LIMITED` | 发送过频 |
| 400 | `PHONE_NUMBER_INVALID` | 号码无效 |
| 401 | `PHONE_VERIFICATION_INVALID` | 验证失败 |
| 409 | `PHONE_ALREADY_BOUND` / `PHONE_BINDING_PROTECTED` | 号码已被绑定/受保护 |
| 500 | `PHONE_OPERATION_FAILED` | 其他错误 |

此接口的 Turnstile 校验按 `middleware.TurnstileCheck` 配置执行。

可信度:已读源码(`controller/user_sms.go: SendSMSLoginCode / writePhoneChallenge / phoneError`、`model/sms_challenge.go: SMSChallengeTTL = 5 * time.Minute`)。

### POST /api/user/login/sms

请求体:

```json
{ "challenge_token": "...", "code": "123456" }
```

成功返回 AuthBundle。

可信度:已读源码(`SMSLogin`)。

### POST /api/user/login/sms/mfa/code 与 POST /api/user/login/sms/mfa

密码登录触发 2FA 后,用短信作为第二因素。请求体复用 `phoneVerificationRequest`(`flow_token`、`challenge_token`、`code` 等)。星途当前未使用。

可信度:路由与请求结构已读;流程细节推断。

### Passkey 与 OAuth

| 接口 | 说明 |
| --- | --- |
| `POST /api/user/passkey/login/begin` / `finish` | WebAuthn 登录。桌面端使用需要 Electron 对 WebAuthn 的支持,星途未接 |
| `POST /api/oauth/state` | 生成 OAuth state(返回的 `flow_token` 一次性) |
| `GET /api/oauth/:provider` | OAuth 回调(浏览器重定向流程) |
| `GET /api/oauth/wechat-web`、`POST /api/oauth/wechat-web/start` | 微信网页登录 |

星途对这些方式的处理:打开网关 `/sign-in` 网页,在隔离 session 中完成登录,主进程观察到 Refresh Cookie 出现后调用 refresh 换取 Access Token。这样不需要在客户端实现 Turnstile、Passkey、第三方 OAuth。

可信度:路由已读;客户端行为来自 `src/main/libs/maasAuth.ts`。

### POST /api/user/auth/refresh

用 Refresh Cookie 换新的 Access Token,并轮换 Cookie。

请求头:

| 头 | 必须 | 说明 |
| --- | --- | --- |
| `Cookie: new_api_refresh=...` | 是 | 由 cookie jar 自动带 |
| `X-Auth-Session: <sid>` | 内存中已有会话时应带;冷启动可省略 | 与 Cookie 内 SID 不一致返回 409 |
| `Origin` | 在 `SESSION_COOKIE_SECURE=true` 时必须是允许的 Origin | 缺失时只接受合法的单一 `Referer` |

请求体:无。

成功:AuthBundle(`session.current` 为 true)+ 新 `Set-Cookie`。

失败:

| HTTP | `code` | 处理 |
| --- | --- | --- |
| 401 | `AUTH_UNAUTHORIZED` / `AUTH_SESSION_REVOKED` | Refresh Token 无效或会话已撤销,**清除 Cookie**,要求重新登录 |
| 409 | `AUTH_SESSION_MISMATCH` | **不轮换、不撤销、不清除任何会话**。去掉 `X-Auth-Session` 后重试一次 |
| 429 / 5xx | | 视为网络故障,**保留本地登录状态**,稍后重试 |

并发刷新:同一 Refresh Token 并发使用时服务端做确定性轮换,会恢复同一个后继 Token,多个窗口不会因丢失响应而被踢下线。最近一代 Token 在短容错窗口之后再次出现会撤销该会话。

可信度:已读源码(`controller/auth_session.go: RefreshAuth`)与 `docs/authentication.md`。

### POST /api/user/auth/logout

撤销当前会话并清除 Cookie。

请求头同 refresh,可同时携带 `Authorization: Bearer`。SID 与 Cookie 不一致时返回 409 `AUTH_SESSION_MISMATCH`,不做任何撤销;客户端应先 refresh 恢复一致后再退出。

成功:`{"success":true,"message":"","data":{"revoked_sid":"...","cookie_cleared":true}}`。

没有 Cookie 时也返回 `success:true`(幂等)。

可信度:已读源码(`AuthLogout`)。

### GET /api/user/self

鉴权:UserAuth。返回当前用户信息,字段(`controller/user.go: buildSelfUserData`):

`id, username, display_name, role, status, email, phone, github_id, discord_id, oidc_id, wechat_id, telegram_id, group, quota, used_quota, request_count, aff_code, aff_count, aff_quota, aff_history_quota, inviter_id, linux_do_id, setting, stripe_customer, sidebar_modules, permissions`。

星途使用的:`id, username, display_name, quota, used_quota, request_count`。

`group` 是**用户分组**(见 README 术语)。订阅升级后这个值会变。`quota` 是钱包额度,**不含订阅额度**。

`setting` 是 JSON 字符串,其中含 `billing_preference`。

可信度:已读源码。

### 会话管理

| 接口 | 鉴权 | 说明 |
| --- | --- | --- |
| `GET /api/user/sessions` | Bearer(登录会话) | 当前鉴权版本的有效会话,最多 100 条 |
| `DELETE /api/user/sessions/:sid` | 同上 | 撤销指定会话 |
| `POST /api/user/sessions/revoke-others` | 同上 | 保留当前,撤销其他 |
| `GET /api/user/login-notice` | 同上 | 登录提示与公告(需要真实登录会话,PAT 返回 401) |

PAT 不能调用以上接口。

可信度:已读源码。

## 面板 PAT(不建议桌面端使用)

`GET /api/user/token`(鉴权:UserAuth + `CriticalRateLimit` + `UserCriticalRateLimit("access-token")`)生成一个面板 PAT 并**覆盖用户已有的 PAT**(`controller/user.go: GenerateAccessToken` → `model.UpdateUserAccessToken`)。响应 `data` 为 PAT 明文字符串。

**风险**:调用一次,用户此前保存在脚本里的 PAT 立刻失效。星途不应调用此接口。

## 小程序专用接口(`/api/mini/auth/*`)

与浏览器接口不同,**小程序接口把 refresh token 放在响应体里**(`miniAppRefreshRequest` 含 `refresh_token` 和 `sid`),并有独立的 `/api/mini/auth/refresh`。这是网关为非浏览器客户端提供的另一套契约。

是否把它用于桌面客户端:**平台尚无此决定**。它的登录方式(微信 code、小程序手机号)面向微信小程序,与桌面端场景不完全匹配。如桌面端希望改为响应体持有 refresh token,需要平台新增接口,见 [07](07-gaps-and-new-endpoints.md)。

可信度:路由和请求结构已读;未读完整响应结构。

## 桌面客户端实现要点

1. 使用独立的非持久 session 分区存放 Cookie,不与应用其他网络请求共享。
2. 只持久化 Refresh Cookie(加密存储);Access Token 与 SID 仅放主进程内存,**不要传给渲染进程**。
3. 每次调用受保护接口前,若 Access Token 不存在或已过期,先 refresh;遇 401 `AUTH_TOKEN_EXPIRED` 刷新一次后重试一次,并确认账号 id 未变化。
4. refresh 返回 401 → 清除所有本地登录状态;429/5xx → 保留状态,按网络错误处理。
5. 退出登录时,即使网关不可达也要清除本地状态。
6. 所有 maas 请求串行化,避免并发 refresh 使 Cookie 轮换冲突。
7. 请求带 `Origin` 头;不要发送 `New-Api-User`。

参考实现:星途 `src/main/libs/maasAuth.ts`。
