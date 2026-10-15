# 08 联调检查清单

每项给出**操作步骤**和**期望结果**。结果以实测为准,下面的"期望"来自源码推断,标 **待联调** 的尤其需要实测。联调环境应为获准的测试环境,**不要在线上账号做写操作测试**。

记号:`$GW` = 网关地址,`$JWT` = 登录 Access Token,`$SID` = 会话 ID。

## 一、登录与会话

### 1.1 桌面端 cookie 刷新闭环

1. `POST $GW/api/user/login` 账号密码登录,保存响应里的 `access_token`、`session.sid`,以及 `Set-Cookie: new_api_refresh`。
2. 带 `Cookie` 与 `X-Auth-Session: $SID`、`Origin` 调 `POST $GW/api/user/auth/refresh`。
3. 期望:200,返回新 `access_token`,`Set-Cookie` 下发**新的** `new_api_refresh`(旧值失效)。
4. 再用**旧 Cookie** 调一次 refresh。期望:在短容错窗口内返回同一个后继 Token;窗口外则 401 并撤销会话。

### 1.2 SID 不一致

1. 用正确 Cookie、错误的 `X-Auth-Session` 调 refresh。
2. 期望:409 `AUTH_SESSION_MISMATCH`,**不轮换**;去掉该头重试成功。

### 1.3 Origin 校验

1. 服务端设 `SESSION_COOKIE_SECURE=true` 时,不带 `Origin` 也不带合法 `Referer` 调 refresh。
2. 期望:被拒。带 `Origin` 为网关自身或 `SESSION_COOKIE_TRUSTED_URL` 中的值则通过。
3. 确认桌面端实际发送的 `Origin` 与服务端配置匹配(星途使用的是网关 origin)。**待联调**。

### 1.4 访问令牌过期

1. 等 15 分钟或用过期 JWT 调 `GET /api/user/self`。
2. 期望:401 `AUTH_TOKEN_EXPIRED`,refresh 后重试成功。

### 1.5 会话上限

1. 同一账号反复登录直到 50 个活跃会话。
2. 期望:409 `AUTH_SESSION_LIMIT`。在已登录设备 `POST /api/user/sessions/revoke-others` 后恢复。

## 二、JWT 能否调用用户级管理接口

登录 JWT 与面板 PAT 经同一个 `authHelper`,源码上两者都通过 `UserAuth`。需要实测确认:

| 接口 | 步骤 | 期望 |
| --- | --- | --- |
| `GET /api/user/self/groups` | 用 `$JWT` 调用 | 200,返回分组清单 |
| `GET /api/token/?p=1&page_size=10` | 同上 | 200,分页密钥列表 |
| `GET /api/subscription/plans`、`/self` | 同上 | 200(星途已在用) |
| `POST /api/token/` | 同上,创建一个名为 `ct-<随机>` 的测试密钥 | `{"success":true,"message":""}` |
| `POST /api/token/:id/key` | 同上 | 返回 `data.key`,**不带 `sk-`** |

**待联调**:`/api/token` 下的接口此前仅静态确认挂在 `UserAuth`,尚未用星途的 JWT 实际调用。

## 三、套餐与订阅

### 3.1 `plans` 为空的排查

1. `GET /api/subscription/plans` 返回 `[]`。
2. 读 `GET /api/user/topup/info`,看 `payment_compliance_confirmed`。
3. 为 false:合规未确认,先由 root 用**登录会话**(非 PAT)`POST /api/option/payment_compliance {"confirmed":true}`。为 true:是真的没有上架套餐,去管理端查 `enabled`。
4. 期望:两种情形可被区分。

### 3.2 创建带分组升级的套餐

1. root 先确认 `GroupRatio` 含目标用户分组;`group_ratio_setting.group_special_usable_group` 给该用户分组加 `+:<高档密钥分组>`。
2. `POST /api/subscription/admin/plans`,`upgrade_group` 设为目标用户分组,`price_amount` 用美元,`quota_reset_period=never`。
3. 期望:创建成功;返回对象里 `currency` 为 `USD`(无论请求传什么)。
4. 传一个不存在的 `upgrade_group`,期望「升级分组不存在」。

### 3.3 更新套餐的 `enabled` 陷阱

1. `PUT /api/subscription/admin/plans/:id`,请求体里**不带** `enabled`。
2. 期望(源码推断):套餐被下架。**待联调**确认,并确认管理后台前端是否总是回传完整对象。

### 3.4 余额购买

1. 给测试用户加足够钱包额度。
2. `POST /api/subscription/balance/pay {"plan_id":N}`。
3. 期望:`success:true`;钱包额度减少 `ceil(price_amount × quota_per_unit)`;`GET /api/subscription/self` 出现 `active` 订阅;`GET /api/user/self` 的 `group` 变为 `upgrade_group`。
4. 对 `allow_balance_pay=false` 的套餐,期望「该套餐不允许使用余额兑换」。
5. 对 `max_purchase_per_user=1` 的套餐再买一次,期望「已达到该套餐购买上限」。

### 3.5 历史非 USD 套餐核对

1. `GET /api/subscription/admin/plans`,筛 `currency != "USD"` 的套餐。
2. 对每个这样的套餐,计算余额购买实扣额度 `ceil(price_amount × quota_per_unit)`,与其面向用户的标价对比。
3. 期望:没有非 USD 套餐;若有,重新保存一次(币种会被改写为 USD),并**同步把 `price_amount` 改为美元数值**。

### 3.6 扣费顺序

1. 用户同时有一份订阅和钱包额度,`billing_preference=subscription_first`。
2. 发一次模型请求,查 `GET /api/log/self?type=2`,看最新日志 `other.billing_source`。
3. 期望:`subscription`。把偏好改成 `wallet_first` 再发,期望 `wallet`。
4. 把订阅用到不够,且 `allow_wallet_overflow=false`,期望请求失败而不是扣钱包。

### 3.7 多份订阅

1. 同一用户有两份订阅(不同 `end_time`)。
2. 发请求。期望:先扣 `end_time` 较早的一份;某份剩余不足本次预扣时跳到下一份。

### 3.8 读取不触发重置

1. 每日重置的订阅,在零点后、无请求时读 `GET /api/subscription/self`。
2. 期望:`amount_used` 仍是旧值,直到下一分钟定时任务或下一次请求后才刷新。**待联调**,并记录实际刷新延迟。

### 3.9 结算超额

1. 让一次请求的实际用量大于预扣且超出订阅剩余。
2. 期望(静态推断):请求成功,但补扣失败被记录,账实不一致。**待联调**,属平台计费验收项。

## 四、分组与密钥

### 4.1 创建时不校验分组

1. 用**默认用户分组**的账号,`POST /api/token/` 创建一把 `group` 为高档分组的密钥。
2. 期望:创建**成功**(不报错)。
3. 用这把密钥调 `POST /v1/chat/completions`,期望 403「无权访问 %s 分组」。

### 4.2 改分组不重建

1. 对上述密钥 `GET /api/token/:id` 取完整对象,把 `group` 改成可用分组,`PUT /api/token/` 整体回传。
2. 期望:成功;密钥字符串不变;再次调用 `/v1/chat/completions` 通过。

### 4.3 更新漏字段的后果

1. `PUT /api/token/` 只带 `id` 和 `group`。
2. 期望(源码推断):`name` 被清空、`expired_time` 变成 0、`unlimited_quota` 变 false 且额度 0,密钥立即不可用。**在一次性测试密钥上验证**。

### 4.4 订阅到期降级后的锁定密钥

1. 用户购买升级订阅,建一把锁定高档分组的密钥,确认可用。
2. 管理员 `POST /api/subscription/admin/user_subscriptions/:id/invalidate`。
3. 期望:用户分组回落;`GET /api/user/self/groups` 不再含高档分组;用该密钥调用返回 403「无权访问 %s 分组」;密钥仍在列表里。**待联调**。
4. 若用户同时持有另一份带升级分组的有效订阅,期望**不降级**。

### 4.5 分组变更的生效时机

1. 订阅购买或作废后,**立刻**调 `GET /api/user/self/groups` 与用旧/新密钥发请求。
2. 期望:平台刷新了分组缓存(`refreshSubscriptionUserGroupCache`)。记录是否有可观察的延迟(Redis 与否的差异)。**待联调**。

### 4.6 密钥数量上限

1. 把 `token_setting.max_user_tokens` 在测试环境调小(例如 3),创建到上限。
2. 期望:HTTP 200,`success:false`,「已达到最大令牌数量限制 (3)」。

### 4.7 创建后的密钥定位

1. 连续创建两把不同名字的密钥。
2. 期望:`GET /api/token/` 第一页按 `id desc`,新建的在最前;`GET /api/token/search?keyword=<name>` 能精确找到。

### 4.8 可用分组配置

1. 默认用户分组账号:`GET /api/user/self/groups`,期望不含高档分组。
2. 升级后的账号:期望含高档分组;`GET /api/user/models?group=<高档分组>` 返回非空模型列表。
3. 对一个**无渠道**的分组,期望模型列表为空(选得到但调不了)。

## 五、钱包与展示

### 5.1 积分展示

1. root 设 `general_setting.quota_display_type=CUSTOM`,`custom_currency_symbol=积分`,`custom_currency_exchange_rate=N`。
2. `GET /api/status`,期望三个字段返回设置值。
3. 星途客户端显示的余额应等于 `quota ÷ quota_per_unit × N`。
4. 误用旧键 `DisplayInCurrencyEnabled` 设不出 CUSTOM,期望只能得到 USD 或 TOKENS。

### 5.2 `pricing` 暴露面

1. 匿名(无 Authorization)`GET /api/pricing`。
2. 若 200 且含 `group_ratio`,说明倍率与模型单价对匿名可见。若不希望暴露,由平台管理员关闭"pricing"导航模块(此时返回 403)。**待联调**。

### 5.3 充值折扣

1. 配置 `payment_setting.amount_discount={"100":0.9}`。
2. `POST /api/user/amount {"amount":100}` 与 `{"amount":101}`。
3. 期望:100 享 9 折,101 无折扣(精确匹配档位)。

## 六、管理员操作的副作用

### 6.1 管理员改用户分组会踢人

1. 用户已登录并持有有效 JWT。
2. 管理员 `PUT /api/user/` 修改该用户 `group`。
3. 期望:用户下一次请求返回 401 `AUTH_SESSION_REVOKED`;通过订阅改分组则**不会**踢人。

### 6.2 管理员写操作审计

1. 做一次套餐创建或配置修改。
2. 期望:管理审计中有对应记录。

## 七、星途客户端侧自检(客户端开发使用)

| 项 | 检查 |
| --- | --- |
| 响应判断 | 同时判断 HTTP 状态与 `success`;订阅购买类接口按各自格式解析 |
| 分组展示 | `ratio` 可能是数字或字符串「自动」;不展示倍率时只显示 `desc` |
| 额度展示 | 钱包与订阅分开;`amount_total=0` 显示"不限" |
| 令牌 | 只在主进程内存持有 Access Token 与 SID,不进入渲染进程 |
| 刷新 | refresh 401 清状态,429/5xx 保状态 |
| 密钥 | 不调用 `GET /api/user/token`(会覆盖 PAT) |
| 密钥创建 | 名称唯一;创建→取 id→取 key 三步;更新整体回传 |
| 网关地址 | 目前写死,联调前需要可配置的测试环境入口 |
