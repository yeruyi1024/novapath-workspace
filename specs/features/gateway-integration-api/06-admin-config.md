# 06 管理员配置

本文件说明管理员如何配置与套餐、分组、额度展示相关的平台参数。**星途客户端不调用本文件的任何接口**,这些是平台管理员(或平台的管理后台)使用的。

## 配置接口:/api/option

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/option/` | 读取全部配置(**敏感键被过滤**) |
| PUT | `/api/option/` | 修改单个配置项 |
| POST | `/api/option/payment_compliance` | 确认支付合规 |

**鉴权:`RootAuth`**(`optionRoute.Use(middleware.RootAuth())`)。只有超级管理员(root 角色)能调用,**普通管理员(admin 角色)不能**。这意味着:分组倍率、可用分组、额度展示单位等配置,**普通管理员改不了**,需要 root 账号。

### GET /api/option/

返回 `[{ "key": "...", "value": "..." }]`,`value` 一律是**字符串**(复杂值是 JSON 字符串)。以 `Token`、`Secret`、`Key`、`secret`、`api_key` 结尾的键,以及 `sms.access_key_id`、`sms.security_token` 被过滤,不会返回。

### PUT /api/option/

请求体:

```json
{ "key": "UserUsableGroups", "value": "{\"default\":\"默认分组\",\"vip\":\"进阶分组\"}" }
```

- `value` 可以是字符串、布尔、数字;服务端统一转成字符串存储。**复杂配置的 `value` 必须是 JSON 字符串**(不是嵌套对象,嵌套对象会被 `fmt.Sprintf("%v")` 破坏)。
- 以 `sms.` 开头的键被拒绝(400,`SMS_CONFIG_ATOMIC_UPDATE_REQUIRED`),必须走 `PUT /api/option/sms`。
- `payment_setting.compliance_*` 键被拒绝(「合规确认字段不允许通过通用设置接口修改」),必须走 `POST /api/option/payment_compliance`。
- `QuotaForInviter` / `QuotaForInvitee` 设为正数时要求合规已确认。

可信度:已读源码(`controller/option.go: GetOptions / UpdateOption`)。其余键各自的校验在 `UpdateOption` 的 `switch option.Key` 里,本次只读了与分组、展示相关的部分。

### POST /api/option/payment_compliance

**必须使用登录会话鉴权,面板 PAT 被拒绝**(HTTP 403,「This operation requires dashboard session authentication. API access token is not allowed.」)。

请求体:`{ "confirmed": true }`,`confirmed` 必须为 true,否则「请确认合规声明」。

成功响应:

```json
{ "success": true, "message": "", "data": { "confirmed": true, "terms_version": "...", "confirmed_at": 1730000000, "confirmed_by": 1 } }
```

写入 `payment_setting.compliance_confirmed / terms_version / confirmed_at / confirmed_by / confirmed_ip`,并记日志。**确认之前**:`/api/subscription/plans` 返回空数组,订阅与充值相关的管理写接口全部拒绝(见 02、03、05)。

## 配置键一览(与本对接相关)

配置有两种键风格:

1. **平铺旧键**:键名即配置名,值是 JSON 字符串或标量,例如 `GroupRatio`、`UserUsableGroups`。
2. **分层新键**:`模块名.字段名`,例如 `general_setting.quota_display_type`。`UpdateOption` 遇到含 `.` 且模块已注册的键,调用 `handleConfigUpdate` 更新(`model/option.go`)。

### 分组相关

| 键 | 类型/格式 | 说明 |
| --- | --- | --- |
| `GroupRatio` | JSON 对象 `{"default":1,"vip":1.5}` | **分组倍率表**。分组名 → 全局倍率。**一个分组必须先在这里存在,才能被套餐设为 `upgrade_group` / `downgrade_group`**(03),也才能出现在用户的可选清单里(`/api/user/self/groups` 只返回同时在倍率表和可用清单里的分组)。代码默认 `{"default":1,"vip":1,"svip":1}` |
| `GroupGroupRatio` | JSON 对象 `{"vip":{"edit_this":0.9}}` | **按用户分组覆盖倍率**:`[用户分组][使用的分组]` → 倍率。查不到时回落 `GroupRatio`。代码默认含一个 `vip → edit_this` 的占位项,**上线前应清理** |
| `UserUsableGroups` | JSON 对象 `{"default":"默认分组","vip":"vip分组"}` | **全局可用分组清单**:分组名 → 面向用户的描述(出现在 `/api/user/self/groups` 的 `desc`)。代码默认 `default`、`vip`。**只有这里的分组(加上特殊规则)才可被用户选来建密钥** |
| `group_ratio_setting.group_special_usable_group` | JSON 对象 `{"vip":{"+:svip":"高级分组","-:default":""}}` | **按用户分组增减可用分组**:`[用户分组]` → `{ "+:分组": 描述 }` 添加、`{ "-:分组": "" }` 移除、无前缀的键直接添加。这是让"升级后能选更多分组"最直接的配置。代码默认空。**该键只有分层形式,没有平铺旧键**(`GroupSpecialUsableGroup` 在 `group_ratio_setting` 内) |
| `AutoGroups` | JSON 数组 `["default","vip"]` | **`auto` 分组的候选顺序**:用 `auto` 分组的密钥按此顺序尝试各分组渠道。代码默认 `["default"]` |
| `MaxTokenAutoGroups` | 整数字符串 | 每把密钥最多可选的 auto 子分组数 |
| `TopupGroupRatio` | JSON 对象 | **按用户分组的充值倍率**(05 的应付金额公式) |
| `token_setting.max_user_tokens` | 整数 | **每用户最大密钥数**,代码默认 1000 |

`group_ratio_setting.group_special_usable_group` 只有分层形式。其余分组键中,**平铺键 `GroupRatio` / `GroupGroupRatio` / `UserUsableGroups` / `AutoGroups` / `TopupGroupRatio`** 在 `UpdateOption` 里各有专门的 `case` 处理(`model/option.go`),管理后台前端(`web/src/features/system-settings/types.ts`)对 `group_special_usable_group` 使用的就是 `group_ratio_setting.group_special_usable_group` 这个分层键。写入 `GroupRatio` 时统一使用平铺键;`group_ratio_setting.group_ratio` 这类分层写法本次**未确认是否被接受**,请不要混用。

### 额度展示

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `general_setting.quota_display_type` | `USD` / `CNY` / `TOKENS` / `CUSTOM` | 展示类型 |
| `DisplayInCurrencyEnabled`(旧键) | `true` / `false` | 兼容旧字段:`true` 同步为 `USD`,`false` 同步为 `TOKENS`。**旧键只能设这两种值,设不出 `CNY`/`CUSTOM`**(`model/option.go: updateOptionMap`);要用"积分"必须写分层键 `general_setting.quota_display_type` |
| `general_setting.custom_currency_symbol` | 字符串 | `CUSTOM` 的符号,例如 `积分` |
| `general_setting.custom_currency_exchange_rate` | 数字字符串 | `CUSTOM` 的汇率:1 美元 = X 单位 |
| `QuotaPerUnit` | 数字 | 每美元对应的 quota,默认 500000 |
| `USDExchangeRate` | 数字 | `CNY` 展示用的美元兑人民币汇率,代码默认 7.3 |

### 其他

| 键 | 说明 |
| --- | --- |
| `checkin_setting.enabled` / `min_quota` / `max_quota` | 签到 |
| `payment_setting.amount_options` / `amount_discount` | 充值预设金额与折扣(JSON `{"100":0.9}`) |
| `Notice` / `About` / `HomePageContent` | 公告、关于、首页内容,经 `GET /api/notice`、`/api/about`、`/api/home_page_content` **无需登录**读取 |

## 让订阅真正带来更多可选分组:配置顺序

假设要做一个套餐,购买后能选更高档的分组 `pro`。必须同时满足:

1. `GroupRatio` 里有 `pro`(倍率可按需设置);
2. 要让用户能用 `pro` 建密钥,`pro` 必须出现在**该用户升级后的用户分组**的可用清单里:
   - 要么在全局 `UserUsableGroups` 里(所有用户都可选,**这样套餐就没有区分度**);
   - 要么在 `group_ratio_setting.group_special_usable_group[升级后用户分组]` 里用 `+:pro` 单独加给升级后的用户分组(**推荐**);
   - 并且默认用户分组不应拿到 `pro`(必要时用 `-:pro` 排除);
3. 创建套餐时 `upgrade_group` 设为升级后的**用户分组**(这个分组也必须在 `GroupRatio` 里)。注意 `upgrade_group` 是**用户分组**,`pro` 是**密钥分组**,二者可以是同一个名字,也可以不同,取决于你怎么设计分组体系;
4. `pro` 分组下要有渠道和模型(Ability 配置,不在本文档范围),否则选了也没有模型可调用。

`/api/user/self/groups` 与 `/api/user/models?group=pro` 可用来验证配置结果。

## 管理员修改用户分组

`PUT /api/user/`(`adminRoute`,AdminAuth 以上)可以改用户分组。`EditWithTx` 的更新字段为 `username, display_name, phone, group, remark`(及可选 `password`),**确认 `group` 在其中**(`model/user.go: EditWithTx`,已读源码)。请求体用 `model.User` 字段加 `id`;`username` 必填(空则「参数错误」);`role` 不能借此修改(与原值不同则拒绝);只能管理角色不高于自己的用户。

**副作用(与订阅改分组相反)**:`EditWithTx` 在 `group` 变化时判定 `authChanged`,**递增 `auth_version`**。`UpdateUser` 控制器随后在 `updatedUser.AuthVersion > originUser.AuthVersion` 时调用 `model.RevokeAllUserSessions(id, "admin_user_update")`(`controller/user.go: UpdateUser`),**撤销该用户全部登录会话,用户被踢下线**;`ValidateLoginSession` 也会因 `user.AuthVersion != identity.UserAuthVersion` 拒绝旧 JWT。手机号变化同样会触发。而订阅购买/到期改分组只刷新授权缓存,**不踢人**(`docs/authentication.md`)。可信度:已读源码。

对星途的含义:管理员手工改某用户的分组,该用户在星途里会收到 401 `AUTH_SESSION_REVOKED`,需重新登录。

- `POST /api/user/manage`(`ManageUser`)的动作里本次只确认存在 `promote`,没有"改分组"动作。
- 通过订阅改分组(`/api/subscription/admin/bind` 等)是更可审计、不踢人的方式,会记录 `prev_user_group` 并在到期时回退。
- 改动前建议先 `GET /api/user/:id` 取完整对象再整体提交,避免零值覆盖。

## 管理员写操作审计

经 `AdminAuth` / `RootAuth` 的写接口由 `authHelper` 自动写入审计(`beginAdminAudit / finishAdminAudit`),handler 内手动埋点的会设置 `ContextKeyAuditLogged` 跳过兜底。因此在管理后台里改配置、改套餐、绑订阅,都会留下操作记录。可信度:已读源码。
