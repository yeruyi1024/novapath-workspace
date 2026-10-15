# 03 套餐与订阅(管理员端)

本文件的接口在 `/api/subscription/admin` 下,鉴权 `AdminAuth`(`router/api-router.go`: `subscriptionAdminRoute.Use(middleware.AdminAuth())`)。管理员写操作由 `authHelper` 自动写入审计记录(`beginAdminAudit / finishAdminAudit`)。

**合规前置**:创建/更新套餐、启停、绑定、创建用户订阅会先调用 `requirePaymentCompliance`;合规未确认时返回 `success:false`,`message` 为 i18n 键 `payment.compliance_required` 对应的文案(具体文字取决于语言包)。列表、查询、重置、失效、删除**不检查**合规。合规确认接口见 06。

## 接口总览

| 方法 | 路径 | 说明 | 合规前置 |
| --- | --- | --- | --- |
| GET | `/plans` | 全部套餐(含未上架) | 否 |
| POST | `/plans` | 创建套餐 | 是 |
| PUT | `/plans/:id` | 更新套餐 | 是 |
| PATCH | `/plans/:id` | 启用/停用 | 是 |
| POST | `/bind` | 给用户绑定套餐 | 是 |
| POST | `/plans/:id/subscriptions/reset` | 重置某套餐下全部订阅额度 | 否 |
| GET | `/users/:id/subscriptions` | 查某用户全部订阅 | 否 |
| POST | `/users/:id/subscriptions` | 给用户创建订阅(无支付) | 是 |
| POST | `/users/:id/subscriptions/reset` | 重置某用户某套餐的订阅额度 | 否 |
| POST | `/user_subscriptions/:id/invalidate` | 立即作废订阅 | 否 |
| DELETE | `/user_subscriptions/:id` | 硬删除订阅 | 否 |

均为已读源码(`controller/subscription.go`)。

## 套餐

### GET /api/subscription/admin/plans

返回全部套餐,`[{ "plan": {...} }]`,字段同 02 的 SubscriptionPlan。排序 `sort_order desc, id desc`。

### POST /api/subscription/admin/plans

请求体:

```json
{
  "plan": {
    "title": "专业月包",
    "subtitle": "每天做问答和文件工作",
    "price_amount": 14,
    "duration_unit": "month",
    "duration_value": 1,
    "enabled": true,
    "sort_order": 10,
    "allow_balance_pay": true,
    "allow_wallet_overflow": true,
    "max_purchase_per_user": 0,
    "upgrade_group": "vip",
    "downgrade_group": "",
    "total_amount": 7000000,
    "quota_reset_period": "never",
    "quota_reset_custom_seconds": 0
  }
}
```

注意请求体是 `{ "plan": { ... } }`,不是平铺字段。

服务端对字段的处理(`AdminCreateSubscriptionPlan`):

| 字段 | 规则 |
| --- | --- |
| `id` | 被强制置 0,由数据库生成 |
| `title` | 去空格后不能为空,否则「套餐标题不能为空」 |
| `price_amount` | `<0` 报「价格不能为负数」;`>9999` 报「价格不能超过9999」 |
| `currency` | **无论传什么都被强制写成 `USD`** |
| `allow_balance_pay` | 缺省(null)→ `true` |
| `allow_wallet_overflow` | 缺省(null)→ `true` |
| `duration_unit` | 缺省 → `month` |
| `duration_value` | `≤0` 且非 custom → 置 1 |
| `max_purchase_per_user` | `<0` 报「购买上限不能为负数」 |
| `total_amount` | `<0` 报「总额度不能为负数」;0=不限额 |
| `upgrade_group` | 去空格;非空时必须存在于**分组倍率表**(`ratio_setting.GetGroupRatioCopy()`),否则「升级分组不存在」 |
| `downgrade_group` | 同上,否则「降级分组不存在」 |
| `quota_reset_period` | 经 `NormalizeResetPeriod`,非法值归一为 `never`(不报错) |
| `quota_reset_custom_seconds` | `quota_reset_period=custom` 时必须 `>0`,否则「自定义重置周期需大于0秒」 |

成功返回创建后的套餐对象(含新 `id`)。创建后失效套餐缓存。

**币种强制 USD 的含义**:`price_amount` 的单位只能是美元。如需按人民币定价,要自行换算成美元标价。余额购买的扣额是 `ceil(price_amount × QuotaPerUnit)`,所以美元标价与扣额口径自洽。**这是对既有"余额购买忽略币种"风险的缓解**:新建/更新后的套餐不会再出现非 USD 币种;**更新接口也会把已有套餐的币种改写为 USD**,因此只要把历史套餐重新保存一次,就会被修正为 USD(但其 `price_amount` 数值不会随币种自动换算,需要管理员同时改成美元数值)。可信度:已读源码。

**`upgrade_group` 校验的是"分组倍率表"而不是"可用分组表"**:一个分组即使没有出现在 `UserUsableGroups` 里,只要有倍率就能被设为升级目标。用户升级后能选哪些密钥分组由 `UserUsableGroups` 与该用户分组的特殊规则决定(见 04、06),两者要同时配置,否则会出现"升级成功但没有任何新分组可选"。可信度:已读源码 + 推断。

### PUT /api/subscription/admin/plans/:id

请求体同创建。校验规则与创建相同(含币种强制 USD)。

更新采用 map 更新,允许零值覆盖:`title, subtitle, price_amount, currency, duration_unit, duration_value, custom_seconds, enabled, sort_order, stripe_price_id, creem_product_id, waffo_pancake_product_id, max_purchase_per_user, total_amount, upgrade_group, downgrade_group, quota_reset_period, quota_reset_custom_seconds, updated_at`。`allow_balance_pay`、`allow_wallet_overflow` **仅在请求中不为 null 时才更新**。

**注意:`enabled` 在 map 更新里无条件写入**。如果更新请求体省略 `enabled`(Go 零值 false),**套餐会被下架**。更新时应回传完整对象。可信度:已读源码。

**修改套餐对已售订阅的影响**:

- 已售订阅的 `amount_total`、`upgrade_group`、`downgrade_group`、`allow_wallet_overflow` 是购买时的快照,不受影响。
- 但**重置周期读取当前套餐**:改 `quota_reset_period` / `quota_reset_custom_seconds` 会改变已售订阅的重置行为;**删除套餐**可能使预扣阻塞或定时重置跳过该订阅(静态推断,未运行验证)。
- 建议:权益或重置规则变化时**新建套餐并停售旧套餐**,保留已有订阅引用的旧套餐。

成功响应 `{"success":true,"message":"","data":null}`。

### PATCH /api/subscription/admin/plans/:id

请求体:`{ "enabled": false }`。`enabled` 必填(指针判空,缺失报「参数错误」)。只改上架状态。

## 绑定与用户订阅

### POST /api/subscription/admin/bind

请求体:`{ "user_id": 1, "plan_id": 2 }`。两者都必须 `>0`。

行为:`model.AdminBindSubscription`,在事务内锁用户行,调用 `CreateUserSubscriptionFromPlanTx(…, source="admin")`。**不检查套餐 `enabled`**,管理员可以给用户绑定已下架套餐。**不收款**,订阅 `source=admin`。受 `max_purchase_per_user` 限制。

响应:发生分组升级时 `{"success":true,"data":{"message":"用户分组将升级到 vip"}}`;否则 `data:null`。

### POST /api/subscription/admin/users/:id/subscriptions

请求体:`{ "plan_id": 2 }`。与 `/bind` 等价,用户 ID 取自路径。同样要求合规确认。

### GET /api/subscription/admin/users/:id/subscriptions

返回该用户全部订阅(含过期),`[{ "subscription": {...} }]`。

### POST /api/subscription/admin/user_subscriptions/:id/invalidate

立即作废:状态置 `cancelled`,`end_time` 置当前时间,随后执行分组降级(规则见 02)。响应:发生降级时 `data.message` 说明目标分组。

### DELETE /api/subscription/admin/user_subscriptions/:id

先执行分组降级,再**硬删除**订阅行(`UserSubscription` 模型没有 `DeletedAt` 字段,`gorm Delete` 即物理删除)。**不可恢复**,订单记录保留。

## 额度重置

### POST /api/subscription/admin/plans/:id/subscriptions/reset

请求体:`{ "advance_reset_time": true }`(可选,缺省 true)。把该套餐下所有有效订阅的 `amount_used` 置 0。

响应 `data`:

```json
{ "plan_id": 2, "matched_count": 10, "reset_count": 10, "user_count": 8, "advance_reset_time": true }
```

重置会给每个受影响用户写一条「管理员重置订阅套餐 … 额度」的日志,并写管理审计。

### POST /api/subscription/admin/users/:id/subscriptions/reset

请求体:`{ "plan_id": 2, "advance_reset_time": true }`,`plan_id` 必填。只重置该用户在该套餐下的订阅。响应同上。

`advance_reset_time`(缺省 true)的语义(`model/subscription.go: resetUserSubscriptionTx`,已读源码):

- 始终把 `amount_used` 置 0。
- 为 `true`:按**当前套餐**重新计算 `next_reset_time`(基准为当前时间,不晚于订阅结束),并把 `last_reset_time` 设为当前时间;若算出不再重置则 `last_reset_time` 置 0。
- 为 `false`:只清零已用额度,**不改**重置时间。

重置只作用于 `status=active AND end_time>now` 的订阅;已过期/已取消的不受影响。`matched_count` 与 `reset_count` 总是相等。

## 管理员配置分组的前置条件

给套餐设置 `upgrade_group` 之前,该分组必须已存在于**分组倍率表**。配置方法见 [06](06-admin-config.md):`group_ratio_setting.group_ratio`(或旧键 `GroupRatio`)。
