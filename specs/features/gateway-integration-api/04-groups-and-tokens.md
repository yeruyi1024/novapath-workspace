# 04 分组与密钥

## 两层分组模型

平台里有两层"分组",客户端和管理员都必须分清:

| 层 | 存放位置 | 谁改 | 作用 |
| --- | --- | --- | --- |
| **用户分组** | `users.group` | 管理员手工改;订阅购买/到期自动改 | 决定该账户**能选哪些**密钥分组 |
| **密钥分组** | `tokens.group` | 用户建/改密钥时选 | 决定这把密钥**实际使用**哪个分组的模型渠道和倍率 |

```
订阅(upgrade_group) ──改──▶ 用户分组 ──决定──▶ 可用分组清单 ──用户从中选──▶ 密钥分组 ──决定──▶ 渠道 + 倍率
```

- 密钥分组**留空** = 跟随账户当前用户分组;**非空** = 锁定在该分组,账户升级后不会自动变。
- 一个分组下可有多个模型;分组到模型/渠道的对应关系在平台的渠道(Ability)配置里,不在本文档范围。
- 同一模型在不同分组下的价格**倍率**可以不同。

来源:`service/group.go`、`middleware/auth.go: TokenAuth`、`model/token.go`(已读源码)。

## 可用分组如何计算

`service.GetUserUsableGroups(userGroup)`(已读源码):

1. 取全局 `UserUsableGroups` 配置(分组名 → 描述)的副本。
2. 若该用户分组在 `group_ratio_setting.group_special_usable_group` 里有特殊规则,逐项应用:
   - 键以 `-:` 开头 → 从清单**移除**该分组;
   - 键以 `+:` 开头 → **添加**该分组(值为描述);
   - 其他 → 直接添加。
3. 若用户自己的分组不在清单里,**自动加入**,描述为「用户分组」。

结论:升级用户分组后,能选哪些密钥分组由"全局清单 + 该用户分组的特殊规则"共同决定。管理员要让某个套餐真正带来更多可选分组,需要同时配置**升级目标分组存在于倍率表**(03)和**该用户分组下的可用分组**(06),否则会出现升级成功但没有新分组可选。配置方法见 06。

## 分组校验发生在什么时候

**这是对接最容易误判的一点。**

| 时机 | 是否校验"该分组对当前用户是否可用" |
| --- | --- |
| `POST /api/token` 创建密钥 | **不校验**普通分组;仅当 `group=auto` 时,校验 `auto_groups` 里每个子分组 |
| `PUT /api/token` 更新密钥 | **不校验**普通分组;同上 |
| **用该密钥调用 `/v1/*`**(`TokenAuth`) | **校验**:不在可用清单 → HTTP 403「无权访问 %s 分组」;不在倍率表且不是 auto → 403「分组 %s 已被弃用」 |

因此:

- 用户可以建出一把锁定到"自己并不可用"的分组的密钥,**建的时候不会报错**,首次调用才失败。客户端应在建密钥前用 `GET /api/user/self/groups` 的结果自行限制可选项。
- **订阅到期降级后**,用户分组回落,锁定高档分组的旧密钥会在**使用时**返回 403,密钥本身不会被删除或自动改组;用户需要改密钥分组(或清空使其跟随账户分组)。可信度:已读源码(`TokenAuth` 的校验逻辑),降级后的实际表现**待联调**。

## 接口

### GET /api/user/self/groups(与 GET /api/user/groups 等价)

鉴权:`/api/user/self/groups` 在 `UserAuth` 下;`/api/user/groups` **路由未挂鉴权中间件**(`router/api-router.go`: `userRoute.GET("/groups", …)` 位于 `selfRoute.Use(UserAuth)` 之外),处理函数读 `c.GetInt("id")`,并用 `userGroup, _ = model.GetUserGroup(…)` **忽略错误**。未登录时 id 为 0,推断返回的是仅由全局配置决定的清单(`GetUserCache(0)` 的具体行为未运行验证)。**客户端应只使用 `/self/groups`**。

返回当前用户可用的分组,键为分组名:

```json
{
  "success": true,
  "message": "",
  "data": {
    "default": { "ratio": 1, "desc": "默认分组" },
    "vip":     { "ratio": 1.5, "desc": "vip分组" },
    "auto":    { "ratio": "自动", "desc": "自动选择" }
  }
}
```

- `ratio`:该用户使用该分组的倍率,先查 `group_group_ratio[用户分组][该分组]`,没有则用该分组的全局倍率。
- `auto` 项的 `ratio` 是字符串「自动」,**类型与其他项不同**(数字 vs 字符串),客户端需兼容。
- 只返回**同时**在倍率表和可用清单里的分组(`auto` 例外,只要可用清单里有)。
- 用户分组取自缓存(`GetUserGroup(id, false)`)。订阅升降级后平台会刷新分组缓存,但**生效延迟待联调**。

**倍率会暴露给用户**。如果对外不想展示价格倍率(例如用"积分"掩盖上游成本),客户端不要显示 `ratio`,并由运营给每个分组写好对外说明(`desc` 来自 `UserUsableGroups` 配置)。可信度:已读源码(`controller/group.go: GetUserGroups`)。

### GET /api/user/models

鉴权:UserAuth(路由 `selfRoute.GET("/models", …)`,即 `/api/user/models`)。查询参数 `group` 可选:

| `group` | 行为 |
| --- | --- |
| 空 | 返回用户所有可用分组下的启用模型,去重 |
| `auto` | 仅当 `auto` 在可用清单里:返回 `GetUserAutoGroup` 的各分组模型 |
| 具体分组名 | 仅当在可用清单里:返回该分组的启用模型;**不在清单里返回空数组,不报错** |

响应 `data` 为模型名字符串数组。用途:用户选分组前预览"这个分组有哪些模型"。可信度:已读源码(`controller/user.go: GetUserModels`)。

> `GetUserModels` 内部会尝试读取路径参数 `id`,取不到则用当前登录用户。本次只确认存在 `selfRoute.GET("/models")`,即 `/api/user/models`(UserAuth 下),按"当前用户"使用。

### GET /api/token/auto-groups

返回 `{ "groups": [...], "max_count": N }`:当前用户分组下**可作为 auto 子分组的分组**(按全局 `AutoGroups` 顺序过滤)及每把密钥最多可选的 auto 子分组数(`MaxTokenAutoGroups`)。可信度:已读源码。

## 密钥接口(/api/token)

全部在 `UserAuth` 下。`tokenRoute.Use(middleware.UserAuth())`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/token/` | 分页列出本人密钥(密钥已脱敏) |
| GET | `/api/token/search` | 搜索(`keyword`、`token` 参数),限流 `SearchRateLimit` |
| GET | `/api/token/auto-groups` | 见上 |
| GET | `/api/token/:id` | 单个密钥(脱敏) |
| POST | `/api/token/:id/key` | **取完整密钥明文**,限流 `CriticalRateLimit`,禁缓存 |
| POST | `/api/token/` | 创建 |
| PUT | `/api/token/` | 更新 |
| DELETE | `/api/token/:id` | 删除 |
| POST | `/api/token/batch` | 批量删除,请求体 `{ "ids": [1,2] }` |
| POST | `/api/token/batch/keys` | 批量取完整密钥,限流 |

### 密钥对象(Token)

`model/token.go: Token` 的 JSON 字段(已读源码):

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | int | |
| `user_id` | int | |
| `key` | string | 列表/详情里是**脱敏**值(`GetMaskedKey`);完整值只能通过 `POST /:id/key` 取 |
| `status` | int | `1` 启用、`2` 禁用、`3` 已过期、`4` 额度耗尽(`common.TokenStatus*`) |
| `name` | string | **最长 50 字符**,超出返回「令牌名称过长」 |
| `created_time` / `accessed_time` | int | 秒 |
| `expired_time` | int | **-1 表示永不过期** |
| `remain_quota` | int | 剩余额度;`unlimited_quota=true` 时忽略 |
| `unlimited_quota` | bool | |
| `model_limits_enabled` | bool | 是否限制可用模型 |
| `model_limits` | string | 逗号分隔的模型名(`text` 字段) |
| `allow_ips` | string\|null | 允许的 IP 列表 |
| `used_quota` | int | 已用额度 |
| `group` | string | **密钥分组**,空=跟随账户 |
| `cross_group_retry` | bool | 跨分组重试,**仅 `group=auto` 有效** |
| `auto_groups` | string[] | 列表/详情响应里作为数组返回(DB 里是 JSON 文本,模型层 `json:"-"`,由 `tokenResponse` 单独输出) |

### GET /api/token/

查询参数:`p`、`page_size`(见 README 分页)。响应 `data` 为分页对象,`items` 里每项是密钥对象(脱敏)。可信度:已读源码。

### POST /api/token/(创建)

请求体是 Token 字段平铺 + `auto_groups`(`tokenRequest` 内嵌 `model.Token`):

```json
{
  "name": "xingtu-main",
  "expired_time": -1,
  "remain_quota": 0,
  "unlimited_quota": true,
  "model_limits_enabled": false,
  "model_limits": "",
  "allow_ips": "",
  "group": "vip",
  "cross_group_retry": false
}
```

规则(`AddToken`):

- `name` ≤ 50 字符。
- `unlimited_quota=false` 时,`remain_quota` 必须在 `[0, maxTokenQuota]`,其中 `maxTokenQuota = 1,000,000,000 × QuotaPerUnit`。
- **密钥数量上限**:`token_setting.max_user_tokens`,**默认 1000**;已达上限时返回 HTTP 200、`success:false`,`message` 为「已达到最大令牌数量限制 (N)」。
- `group == "auto"`:`auto_groups` 子分组必须各自 `IsUserSelectableGroup`(在可用清单、有倍率、非 auto、非空),否则报错;数量超过 `MaxTokenAutoGroups` 报错;不得重复。
- `group != "auto"`:`cross_group_retry` 被强制置 false,`auto_groups` 被清空。
- 服务端生成密钥,`status`、`created_time`、`accessed_time`、`used_quota` 由服务端填,客户端传入的这些字段**被忽略**(创建时只复制白名单字段到 `cleanToken`)。

**响应不返回新密钥的 id 和 key**:

```json
{ "success": true, "message": "" }
```

可信度:已读源码(`controller/token.go: AddToken`)。

### 创建 → 取密钥的三步流程

因为创建不返回 id 和 key,客户端必须:

1. `POST /api/token/` 创建;
2. `GET /api/token/?p=1&page_size=10` 取新密钥的 `id`。**列表按 `id desc` 排序**(`model.GetAllUserTokens`),刚创建的密钥在第一页第一条。为防并发创建造成误判,仍建议核对 `name`;也可用 `GET /api/token/search?keyword=<name>`(精确匹配;含 `%` 的模糊搜索在密钥数超过上限的用户上被禁用,且去掉 `%` 后关键词须 ≥2 字符);
3. `POST /api/token/:id/key` 取完整密钥。响应 `{"success":true,"data":{"key":"<48位随机串>"}}`。

**密钥格式**:服务端生成 48 位随机字符(`common.GenerateKey → GenerateRandomCharsKey(48)`),存储和接口返回的 `key` **都不带 `sk-` 前缀**(`GetFullKey` 直接返回 `token.Key`)。调用 `/v1/*` 时 `TokenAuth` 会对传入密钥做 `TrimPrefix("sk-")`,所以**带不带 `sk-` 都能认证**。展示给用户或填入第三方工具时,按 OpenAI 习惯加 `sk-` 前缀即可。可信度:已读源码。

**竞态**:两次连续创建同名密钥无法区分。客户端应使用唯一名称(例如带时间戳或随机后缀)。可信度:已读源码。

### PUT /api/token/(更新)

请求体同创建,**必须带 `id`**。

**更新是整体覆盖**:`token.Update()` 的 `Select` 列表为 `name, status, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits, allow_ips, group, cross_group_retry, auto_groups`(`model/token.go`),这些字段会被请求值覆盖,**包括零值**。所以只想改分组时,也必须把其余字段按原值回填,否则:

- 不传 `name` → 名称被改成空串;
- 不传 `unlimited_quota` / `remain_quota` → 可能变成"有限额度且剩余 0",密钥立刻不可用;
- 不传 `expired_time` → 变成 0(过期时间 1970),密钥立即过期。

安全做法:先 `GET /api/token/:id` 取当前对象,改 `group`,整体回传。

特例:查询参数 `status_only=1` 时只更新 `status`,忽略其他字段。

启用校验:把 `status` 置为启用时,已过期(且过期时间未到-1)或额度已耗尽的密钥不能直接启用,返回对应错误。

响应:`{"success":true,"message":"","data":{...脱敏的密钥对象...}}`。

**改分组不需要重建密钥**,密钥字符串不变。更新前会失效该密钥的缓存(`invalidateTokenCacheForMutation`),下一次请求即用新分组。可信度:已读源码。

**更新时 `auto_groups` 的语义**:请求里出现 `auto_groups`(包括 `null`)才会触发 `setTokenAutoGroups`(`tokenAutoGroupsInput.Set`);完全不带该字段则保持原值。`group != "auto"` 时无论如何都会清空 `auto_groups`。

### DELETE /api/token/:id

删除密钥(`model.DeleteTokenById`,按 id + 用户)。响应 `{"success":true,"message":""}`。

### POST /api/token/:id/key 与 POST /api/token/batch/keys

取完整密钥。**敏感操作**,`CriticalRateLimit` + 禁缓存。

- 单个:`POST /api/token/:id/key`,无请求体,响应 `{"success":true,"data":{"key":"..."}}`。
- 批量:`POST /api/token/batch/keys`,请求体 `{ "ids": [1, 2, 3] }`,`ids` 不能为空,**最多 100 个**;响应 `{"success":true,"data":{"keys":{"1":"...","2":"..."}}}`,键为密钥 id。只返回属于当前用户的密钥,不属于本人的 id 静默忽略。

可信度:已读源码(`GetTokenKey`、`GetTokenKeysBatch`)。

## 星途的使用建议(仅陈述事实,不做产品决策)

1. 读取可选分组:`GET /api/user/self/groups`,用其结果限制可选项。纯读取,无副作用。
2. 预览分组内模型:`GET /api/user/models?group=<name>`。
3. 创建密钥属于**写操作**,会在用户账户下新增数据,并需要经过取密钥接口拿到明文。星途此前决定"不擅自签发密钥",要自动代建需要先改这条决定。
4. 星途登录用的是 JWT。静态上它与 `/api/token` 走同一个 `UserAuth`,**应当可用**,**待联调确认**。
5. 密钥属于登录账户。套餐、分组、钱包都挂在账户上,别的账户的密钥享受不到。星途目前的模型密钥是用户手填的,与登录账户没有绑定校验。
