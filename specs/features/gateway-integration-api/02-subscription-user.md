# 02 套餐与订阅(用户端)

本文件的接口都在 `/api/subscription` 下,鉴权 `UserAuth`(登录 JWT 或 PAT 均可)。路由定义:`router/api-router.go`(`subscriptionRoute.Use(middleware.UserAuth())`)。

## 数据结构

### SubscriptionPlan(套餐)

`GET /api/subscription/plans` 的每一项形如 `{ "plan": { ... } }`,`plan` 字段如下(`model/subscription.go: SubscriptionPlan`,已读源码):

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | int | 套餐 ID |
| `title` | string | 标题,创建时必填 |
| `subtitle` | string | 副标题 |
| `price_amount` | number | 标价。**币种固定为 USD**(见 03),上限 9999 |
| `currency` | string | 恒为 `USD`(管理端创建/更新时强制写入);历史数据可能是其他值 |
| `duration_unit` | string | `year` / `month` / `day` / `hour` / `custom`(`DurationUnit` 常量,值以 `model` 常量为准) |
| `duration_value` | int | 时长数量;`custom` 时无效 |
| `custom_seconds` | int | `duration_unit=custom` 时的秒数 |
| `enabled` | bool | 是否上架;用户端接口只返回 `enabled=true` |
| `sort_order` | int | 排序,降序 |
| `allow_balance_pay` | bool | 是否允许钱包余额购买(空=true) |
| `allow_wallet_overflow` | bool | 订阅额度用完后是否允许回退扣钱包(空=true) |
| `stripe_price_id` / `creem_product_id` / `waffo_pancake_product_id` | string | 第三方支付商品标识 |
| `max_purchase_per_user` | int | 每用户购买上限,0=不限;**统计历史全部订阅含已过期** |
| `upgrade_group` | string | 购买后把**用户分组**升级为此分组;空=不变 |
| `downgrade_group` | string | 到期降级目标;空=回到购买前的分组 |
| `total_amount` | int | 订阅额度(quota 单位),**0=不限额** |
| `quota_reset_period` | string | `never` / `daily` / `weekly` / `monthly` / `custom` |
| `quota_reset_custom_seconds` | int | `custom` 周期的秒数 |
| `created_at` / `updated_at` | int | 秒级时间戳 |

**对外暴露面**:此接口把 `stripe_price_id`、`creem_product_id`、`upgrade_group`、`downgrade_group` 等内部标识返回给所有登录用户。它们不是密钥,但属于内部配置。是否收敛由平台决定。星途客户端只投影了展示所需字段。

`套餐表中没有面向用户的权益描述字段`(没有"包含哪些模型"之类的文案),对外说明需要另行维护。

### UserSubscription(订阅实例)

`GET /api/subscription/self` 里每一项形如 `{ "subscription": { ... } }`(`model/subscription.go: UserSubscription`,已读源码):

| 字段 | 说明 |
| --- | --- |
| `id`、`user_id`、`plan_id` | |
| `amount_total` | 订阅额度,**购买时从套餐快照**;0=不限额 |
| `amount_used` | 当期已用额度 |
| `start_time` / `end_time` | 有效期(秒) |
| `status` | `active` / `expired` / `cancelled` |
| `source` | `order`(用户购买)/ `admin`(管理员绑定) |
| `last_reset_time` / `next_reset_time` | 上次/下次重置时间 |
| `upgrade_group` | 购买时从套餐快照的升级分组 |
| `prev_user_group` | 购买前的用户分组,用于到期回退 |
| `downgrade_group` | 到期降级目标快照 |
| `allow_wallet_overflow` | 购买时从套餐快照的兜底开关 |

**快照范围**:只有 `amount_total`、`upgrade_group`、`downgrade_group`、`allow_wallet_overflow` 是购买时快照。**重置周期不在订阅上,而是每次读取当前套餐**(预扣与定时重置都会加载套餐,见下文"重置")。因此管理员事后修改套餐的重置规则会影响已售订阅。可信度:已读源码 + 推断。

## 接口

### GET /api/subscription/plans

返回已上架的套餐列表,按 `sort_order desc, id desc` 排序。

**合规开关**:`IsPaymentComplianceConfirmed()` 为 false 时,直接返回**空数组**(`"data": []`)而非报错。客户端无法区分"没配套餐"与"合规未确认"。区分办法:同时读 `GET /api/user/topup/info`,其 `payment_compliance_confirmed` 字段给出合规状态。

响应:

```json
{ "success": true, "message": "", "data": [ { "plan": { "id": 1, "title": "专业月包", "price_amount": 14, "currency": "USD", "...": "..." } } ] }
```

可信度:已读源码(`controller/subscription.go: GetSubscriptionPlans`)。

### GET /api/subscription/self

返回当前用户的订阅。

```json
{
  "success": true,
  "message": "",
  "data": {
    "billing_preference": "subscription_first",
    "subscriptions": [ { "subscription": { "...": "..." } } ],
    "all_subscriptions": [ { "subscription": { "...": "..." } } ]
  }
}
```

- `subscriptions`:仅 `status=active AND end_time>now` 的订阅。
- `all_subscriptions`:含已过期、已取消。
- `billing_preference` 取值见下。

**读取不会触发重置**:每日重置的订阅在零点之后、下一次请求触发惰性重置或定时任务扫到之前,`amount_used` 仍是旧值。客户端若据此展示"剩余额度"会短暂偏低。定时任务(仅主节点,启动时执行一次,之后每分钟一次)通常会很快刷新,但这不是严格的时效保证。可信度:已读源码 + 推断。

可信度:已读源码(`controller/subscription.go: GetSubscriptionSelf`)。

### PUT /api/subscription/self/preference

修改扣费偏好。

请求体:

```json
{ "billing_preference": "wallet_first" }
```

取值(非法值被归一为 `subscription_first`,**不报错**):

| 值 | 行为 |
| --- | --- |
| `subscription_first`(默认) | 先扣订阅;订阅额度不足时,仅当所有有效订阅都允许兜底才扣钱包 |
| `wallet_first` | 先扣钱包;钱包不足再试订阅 |
| `subscription_only` | 只扣订阅,不足就失败 |
| `wallet_only` | 只扣钱包 |

响应:`{"success":true,"data":{"billing_preference":"wallet_first"}}`。

可信度:已读源码(`UpdateSubscriptionPreference`、`common/str.go: NormalizeBillingPreference`)。

## 购买

所有购买接口:鉴权 UserAuth + `CriticalRateLimit`;都先要求**支付合规已确认**,否则返回 `success:false`(`requirePaymentCompliance`)。

### POST /api/subscription/balance/pay(钱包余额购买)

请求体:`{ "plan_id": 1 }`

响应:成功 `{"success":true,"message":"","data":null}`;失败 `success:false`,`message` 之一:

| `message` | 原因 |
| --- | --- |
| 参数错误 | `plan_id` 缺失或 ≤0 |
| 套餐未启用 | `enabled=false` |
| 该套餐不允许使用余额兑换 | `allow_balance_pay=false` |
| 余额不足 | 钱包额度小于所需额度 |
| 已达到该套餐购买上限 | `max_purchase_per_user` 已达(统计该用户该套餐的历史全部订阅,含已过期;设为 1 会阻止续买) |

**扣额公式**:`required_quota = ceil(price_amount × QuotaPerUnit)`(`calcSubscriptionBalanceQuota`)。**不读取 `currency`**。因新建套餐币种强制为 USD,新套餐的口径是自洽的:标价 14 美元扣 `14 × 500000 = 7,000,000` 额度。**历史上存在的非 USD 套餐**(例如 `currency=CNY`、`price_amount=99`)仍会按 99 美元扣,与标价不符。可信度:已读源码。

**无幂等号**:请求没有幂等键,超时后客户端无法判断是否已扣款。重试可能重复购买(受 `max_purchase_per_user` 限制)。订单号在服务端生成(`SUBBALUSR{userId}NO{random}{nanos}`),不由客户端传入。可信度:已读源码。

事务内完成:锁用户行 → 校验余额 → 扣钱包 → 创建订阅(含分组升级)→ 写订单。成功后刷新用户额度缓存,若发生了分组升级则刷新分组缓存。

### POST /api/subscription/epay/pay(易支付)

请求体:`{ "plan_id": 1, "payment_method": "alipay" }`

校验:套餐已启用;`price_amount ≥ 0.01`;`payment_method` 必须在已配置的支付方式列表中(`ContainsPayMethod`);购买上限;管理员已配置易支付。

成功响应:

```json
{ "message": "success", "data": { "...表单参数...": "..." }, "url": "https://pay.example.com/submit.php" }
```

客户端需要把 `data` 作为表单参数 POST/GET 到 `url`。注意**此响应没有 `success` 字段**。失败时用 `ApiErrorMsg`(有 `success:false`)。

### POST /api/subscription/stripe/pay

请求体:`{ "plan_id": 1 }`

成功:`{ "message": "success", "data": { "pay_link": "https://checkout.stripe.com/..." } }`

失败:`{ "message": "error", "data": "拉起支付失败" }`(**无 `success` 字段**,错误文案在 `data`)。

### POST /api/subscription/creem/pay

请求体:`{ "plan_id": 1 }`

成功:`{ "message": "success", "data": { "checkout_url": "...", "order_id": "..." } }`

失败:`{ "message": "error", "data": "..." }`。

### POST /api/subscription/waffo-pancake/pay

请求体:`{ "plan_id": 1 }`

成功:`{ "message": "success", "data": { "checkout_url": "...", "session_id": "...", "expires_at": ..., "order_id": "...", "token": "...", "token_expires_at": ... } }`

失败:`{ "message": "error", "data": "创建订单失败" | "拉起支付失败" }`。

### 响应格式差异汇总

| 接口 | 成功判断 | 失败判断 |
| --- | --- | --- |
| `balance/pay` | `success:true` | `success:false` + `message` |
| `epay/pay` | `message==="success"` | `success:false` + `message`(失败路径用 `ApiErrorMsg`) |
| `stripe/pay`、`creem/pay`、`waffo-pancake/pay` | `message==="success"` | `message==="error"`,原因在 `data` |

客户端若要统一处理,必须按接口分别解析。可信度:已读源码。

### 支付回调(平台内部,客户端不调用)

| 接口 | 说明 |
| --- | --- |
| `GET/POST /api/subscription/epay/notify` | 易支付异步通知 |
| `GET/POST /api/subscription/epay/return` | 易支付同步跳转 |
| `POST /api/stripe/webhook`、`/api/creem/webhook`、`/api/waffo/webhook`、`/api/waffo-pancake/webhook/:env` | 第三方 webhook |

**回调幂等与签名校验未读**,不在本文档范围。可信度:未验证。

## 额度池与扣费规则

以下规则来自 `model/subscription.go` 与 `service/billing_session.go`(已读源码):

1. **钱包与订阅是两个独立的池**,单位同为 quota,但**不能相加成"可用额度"**。
2. **一次请求只从一个池扣费**。订阅用完后,*下一次*请求才可能改扣钱包。
3. **多份订阅**:按 `end_time asc, id asc` 依次尝试(先到期先扣);某份订阅剩余额度小于本次预扣则跳到下一份;**不会把一次请求拆到两份订阅上**。全部不足返回 `subscription quota insufficient`。
4. **钱包兜底**:`subscription_first` 模式下,订阅额度不足时是否回退钱包,取决于 `UserActiveSubscriptionsAllowWalletOverflow`:**只要有一份有效订阅 `allow_wallet_overflow=false`,整体禁止兜底**,即使用户同时持有允许兜底的订阅。
5. `total_amount=0` 表示不限额,展示成"0"会严重误导。
6. 预扣与退款按 `request_id` 幂等(`SubscriptionPreConsumeRecord`)。

结算超额(实际用量超过预扣且超出订阅剩余)时,补扣可能失败但请求仍成功,造成统计与实际扣额不一致。该问题属于平台侧计费验收项,见 [08](08-integration-checklist.md)。可信度:已读源码 + 推断。

## 重置与到期

- 周期:`never` / `daily` / `weekly` / `monthly` / `custom`。每日=次日零点;每周=下周一零点;每月=下月一号零点;自定义=基准时间+N 秒。若下次重置晚于订阅结束则不再重置。
- 重置把 `amount_used` 置 0,**不结转**。
- **惰性 + 定时**:请求预扣时检查并重置;主节点定时任务启动时执行一次、之后每分钟执行,批量调用 `ExpireDueSubscriptions` / `ResetDueSubscriptions`。
- **零点用服务器进程 Local 时区**,不是用户时区。
- **有效期与重置不是同一时钟**:月期限为 `start.AddDate(0, N, 0)`,而 monthly 重置对齐自然月 1 日。一个 10 月 30 日购买的月套餐,11 月 1 日就会重置一次,同一份订阅可经历"购买后一份额度 + 重置后一份额度"。以返回的 `end_time` 为准。若只想"一次购买一份额度",配置 `quota_reset_period=never`。
- 到期:`ExpireDueSubscriptions` 置 `expired`,并处理分组降级(目标为 `downgrade_group`,空则回到 `prev_user_group`)。

可信度:已读源码 + 静态推断,未运行验证。

## 分组升降级

`upgrade_group` 非空且与用户当前分组不同时,购买事务内修改用户分组并记录 `prev_user_group`。到期、取消(`AdminInvalidate`)或删除时执行降级,规则(`model/subscription.go: downgradeUserGroupForSubscriptionTx`,已读源码):

1. 订阅上 `downgrade_group` 与 `upgrade_group` 都为空 → 不做任何事。
2. **用户还持有另一份有效、且带 `upgrade_group` 的订阅 → 不降级**,保持当前分组。
3. 目标分组:订阅上 `downgrade_group` 非空则用它;否则**仅当用户当前分组仍等于该订阅的 `upgrade_group`** 才回到 `prev_user_group`(用户分组已被管理员手工改过时不回退)。
4. 目标为空或等于当前分组 → 不变。

**自然到期**走 `ExpireDueSubscriptions`(定时任务,每次最多处理 200 条,按用户批量),与手工作废略有不同:同一用户同时到期的多份订阅一起置 `expired`,降级只参考其中**最近到期的一份**;没有显式 `downgrade_group` 时,还要求该订阅的 `prev_user_group` 非空才回退。可信度:已读源码。

升降级只刷新授权缓存(`refreshSubscriptionUserGroupCache`),**不会使任何登录会话失效**(`docs/authentication.md`)。分组变更对已发出请求的生效时机(缓存刷新延迟)**待联调**。

**对已建密钥的影响**:降级后用户分组不再包含原高档分组时,锁定该分组的密钥在**使用时**被拒绝(403「无权访问 %s 分组」),密钥本身不会被删除或自动改组。见 [04](04-groups-and-tokens.md)。
