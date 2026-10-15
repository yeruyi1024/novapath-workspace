# 05 钱包、额度与展示

## 额度模型

- 平台内部用整数 **quota**(额度)计量。钱包 `users.quota`、订阅 `amount_total/amount_used`、密钥 `remain_quota` 都是 quota。
- `quota_per_unit`:多少 quota 折合 1 美元。代码默认 `500000`(`common.QuotaPerUnit = 500 * 1000.0`,注释 `$0.002 / 1K tokens`),`GET /api/status` 返回线上实际值。
- 所有"钱"最终都是 quota,展示层再换算成美元、人民币、自定义单位或原始 token 数。

## 展示配置

由 `general_setting` 控制(`setting/operation_setting/general_setting.go`),通过 `GET /api/status` 公开:

| `/api/status` 字段 | 配置键 | 说明 |
| --- | --- | --- |
| `quota_display_type` | `general_setting.quota_display_type` | `USD` / `CNY` / `TOKENS` / `CUSTOM` |
| `custom_currency_symbol` | `general_setting.custom_currency_symbol` | `CUSTOM` 模式的符号,默认 `¤` |
| `custom_currency_exchange_rate` | `general_setting.custom_currency_exchange_rate` | `CUSTOM` 模式:1 美元 = X 个自定义单位,默认 1.0 |
| `display_in_currency` | 派生 | `quota_display_type != TOKENS` |
| `quota_per_unit` | `QuotaPerUnit` | 见上 |
| `usd_exchange_rate` | `USDExchangeRate` | `CNY` 模式使用的美元兑人民币汇率,代码默认 7.3,线上值以接口返回为准 |

### 展示换算公式

```
美元金额  = quota ÷ quota_per_unit
USD 模式  : 显示 美元金额,符号 $
CNY 模式  : 显示 美元金额 × usd_exchange_rate,符号 ¥
CUSTOM 模式: 显示 美元金额 × custom_currency_exchange_rate,符号 custom_currency_symbol
TOKENS 模式: 直接显示 quota
```

依据 `GetCurrencySymbol` 与 `GetUsdToCurrencyRate`(已读源码)。汇率取值规则:`CUSTOM` 且汇率 `>0` 用该汇率,否则回落 1。

### 用"积分"做展示单位

平台已支持,**纯配置,无需改代码**:

1. 把 `general_setting.quota_display_type` 设为 `CUSTOM`;
2. `general_setting.custom_currency_symbol` 设为 `积分`;
3. `general_setting.custom_currency_exchange_rate` 设为 N。

此时 1 美元 = N 积分,**积分 = quota ÷ quota_per_unit × N**。例:`quota_per_unit=500000`、N=100 → 50000 quota 显示为 1 积分。

边界(重要):

- 这只是**展示换算**,账本里仍是 quota。客户端不得自建积分账本,也不得加减积分。
- N 是商业决定,改动会改变所有用户看到的数字,上线后慎改。
- 钱包、订阅额度、密钥额度、用量日志里的金额都用同一个换算,口径一致。
- 配置键的写入方式见 [06](06-admin-config.md)。星途客户端已解析 `CUSTOM` 并按此公式展示(`src/shared/auth/maasBilling.ts`)。

## 接口

### GET /api/user/self(钱包额度)

见 01。与钱包相关的字段:

| 字段 | 说明 |
| --- | --- |
| `quota` | 钱包剩余额度(quota),**不含订阅额度** |
| `used_quota` | 历史累计已用额度 |
| `request_count` | 累计请求数 |
| `aff_quota` / `aff_history_quota` | 邀请奖励待划转 / 历史累计 |

订阅剩余额度来自 `GET /api/subscription/self`,**两者不能相加**(见 02)。

### GET /api/user/topup/info

鉴权:UserAuth。返回充值能力(`controller/topup.go: GetTopUpInfo`,已读源码):

| 字段 | 说明 |
| --- | --- |
| `payment_compliance_confirmed` | **支付合规是否已确认**。为 false 时 `pay_methods` 被清空、`enable_redemption=false`,**同时 `/api/subscription/plans` 返回空数组**。用它区分"没配套餐"和"合规未确认" |
| `payment_compliance_terms_version` | 当前合规条款版本 |
| `enable_online_topup` / `enable_stripe_topup` / `enable_creem_topup` / `enable_waffo_topup` / `enable_waffo_pancake_topup` | 各渠道是否启用 |
| `enable_redemption` | 是否允许兑换码(取决于合规) |
| `pay_methods` | 可用支付方式数组 `[{name,type,color,min_topup}]`;启用 Stripe/Waffo/Waffo Pancake 时自动追加 |
| `min_topup` / `stripe_min_topup` / `waffo_min_topup` / `waffo_pancake_min_topup` | 各渠道最小充值额 |
| `amount_options` | 预设充值金额 |
| `discount` | **充值折扣**,JSON 为 `{ "100": 0.9 }`(`AmountDiscount map[int]float64`:充值金额 → 折扣系数)。只作用于钱包充值,**套餐没有折扣字段**。折扣仅在充值金额**精确等于**某个配置档位时生效(`AmountDiscount[int(amount)]`),不是区间折扣 |
| `creem_products` | Creem 商品列表 |
| `waffo_pay_methods` | Waffo 支付方式(未启用为 null) |
| `topup_link` | 外部充值链接 |

### GET /api/user/topup/self

分页(见 README)返回本人充值记录。支持 `keyword`。每项(`model.TopUp`):

`id, user_id, amount, money, trade_no, payment_method, payment_provider, create_time, complete_time, status`。

### POST /api/user/topup(兑换码)

请求体 `{ "key": "兑换码" }`。要求合规已确认(否则 `MsgPaymentComplianceRequired`)。同一用户并发请求会被互斥锁拒绝(`MsgUserTopUpProcessing`)。

成功:`{"success":true,"message":"","data":<增加的quota>}`。**任何失败都返回同一个模糊文案**(`MsgRedeemFailed`),不暴露具体原因,防止探测兑换码状态。

### 钱包充值接口

| 接口 | 请求体 | 说明 |
| --- | --- | --- |
| `POST /api/user/amount` | `{ "amount": N }` | 计算易支付充值**应付金额** |
| `POST /api/user/pay` | `{ "amount": N, "payment_method": "..." }` | 发起易支付充值 |
| `POST /api/user/stripe/amount`、`/stripe/pay` | `amount`、`payment_method`、可选 `success_url` 等 | Stripe |
| `POST /api/user/creem/pay` | 未读 | Creem |
| `POST /api/user/waffo/amount`、`/waffo/pay` | 未读 | Waffo |
| `POST /api/user/waffo-pancake/amount`、`/waffo-pancake/pay` | 未读 | Waffo Pancake |

鉴权 `UserAuth`,`pay` 类接口加 `CriticalRateLimit`。**`amount` 接口的响应格式与订阅购买一样特殊**:成功 `{"message":"success","data":"<应付金额字符串>"}`,失败 `{"message":"error","data":"<原因>"}`,**无 `success` 字段**(`controller/topup.go: RequestAmount`)。

**充值应付金额公式**(`getPayMoney`,已读源码):

```
基础金额 = amount                                      (USD / CNY / CUSTOM 展示:amount 为金额)
         = amount ÷ quota_per_unit                     (TOKENS 展示:amount 为 token 数)
应付金额 = 基础金额 × Price × TopupGroupRatio[用户分组] × discount
```

- `Price`:`operation_setting.Price`,每单位的价格。
- `TopupGroupRatio`:**按用户分组的充值倍率**(配置键 `TopupGroupRatio`),取不到或为 0 时按 1。因此**同样的充值金额,不同用户分组实付不同**,订阅升级用户分组后充值价格也会变。
- `discount`:见上,只在金额精确匹配档位时才不为 1。
- 应付金额 ≤ 0.01 时报「充值金额过低」。

星途首版不接入充值支付,购买与充值跳转平台网页。其余渠道的请求体与响应**本次未读**,**待核**。

### GET /api/user/checkin 与 POST /api/user/checkin

- 功能由 `checkin_setting.enabled` 控制,**未启用时两个接口都返回 `success:false`「签到功能未启用」**。
- `GET`:查询参数 `month`(`YYYY-MM`,缺省当月),响应 `data` 为 `{ enabled, min_quota, max_quota, stats }`。
- `POST`:可能受 Turnstile 校验。成功:`{"success":true,"message":"签到成功","data":{"quota_awarded":N,"checkin_date":"..."}}`。奖励的是钱包额度,并写一条系统日志。

### GET /api/log/self(用量与流水日志)

鉴权:UserAuth。分页(见 README)。查询参数(`controller/log.go: GetUserLogs`):

| 参数 | 说明 |
| --- | --- |
| `type` | 日志类型:`1` 充值、`2` 消费、`3` 管理、`4` 系统、`5` 错误、`6` 退款、`7` 登录、`8` 账单修正 |
| `start_timestamp` / `end_timestamp` | 秒级时间范围 |
| `token_name` / `model_name` / `group` | 过滤 |
| `request_id` / `upstream_request_id` | 精确匹配 |

每条日志(`model.Log`)字段:`id, user_id, created_at, type, content, username, token_name, model_name, quota, prompt_tokens, completion_tokens, use_time, is_stream, channel, token_id, group, ip, request_id, upstream_request_id, other`。

`other` 是 JSON 字符串。消费日志里 `other.billing_source` 为 `wallet` 或 `subscription`,表示该次请求从哪个池扣费(`service/log_info_generate.go`,已读源码)。**未核实该字段是否覆盖所有消费路径**(例如任务类、违规扣费),只确认主路径写入。

`revenue_quota / cost_quota / profit_quota` 仅在用户具有财务查看权限时返回,**普通用户不会看到**。

> `GET /api/log/self/search` 已标注废弃,调用返回 `success:false`「该接口已废弃」。不要使用。

### GET /api/log/self/stat

返回 `{ quota, records, requests, rpm, tpm }`(过滤参数同日志)。具有财务权限时另含 `revenue_quota, cost_quota, profit_quota`。

### GET /api/data/self

鉴权:UserAuth。按日的额度用量数据。查询参数 `start_timestamp`、`end_timestamp`(秒);**时间跨度超过 2,592,000 秒(30 天)返回 `success:false`「时间跨度不能超过 1 个月」**。成功返回 `data` 为按日记录数组(`model.GetQuotaDataByUserId`,单条字段本次未读)。另有 `GET /api/data/flow/self`,结构未读。

## 客户端使用要点

1. 展示金额前先读 `/api/status` 的展示配置,**不要硬编码币种**。
2. 钱包与订阅分别展示,**不要相加**。多份订阅不显示合计(单次请求只能用一份订阅的余额)。
3. 订阅 `amount_total = 0` 表示不限额,不要展示成 0。
4. 读 `/api/subscription/self` 得到的 `amount_used` 可能是重置前的旧值(见 02),展示"剩余额度"需标注数据时点,首版建议不展示精确剩余。
5. 调用 `/api/subscription/plans` 返回空时,读 `/api/user/topup/info` 的 `payment_compliance_confirmed` 区分原因。
6. `topup/info` 的 `discount` 只对钱包充值生效,不要把它描述成套餐折扣。
