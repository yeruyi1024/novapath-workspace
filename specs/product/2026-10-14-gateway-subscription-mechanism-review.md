# Gateway 订阅机制核查报告(供审阅)

状态:**已按协作审核修订,待平台运行验证与业务定档**。2026-10-14,仅源码只读核查;本轮仅修改 `shilijia-agent` 内的三份方案文档,无 Gateway 写入、运行验证或线上数据核验。
范围:`maas-token` 的订阅、额度、重置、到期、购买链路,以及星途客户端当前接入程度。
不在范围:前端实现、正式定价结论、支付渠道细节。
约束:`maas-token` 及其配置、数据库严格只读;本报告未修改其任何文件,也未在其目录执行写入类命令。

## 0. 审阅须知

- 所有结论都标了源码位置(相对 `maas-token/`)。**行号是 2026-10-14 当时的值**,gateway 变动后会漂移,以函数名为准。
- 每条结论后标注置信度:**已读源码**(直接读到)/ **推断**(由源码推出、未验证)/ **未验证**。审阅时请优先攻击"推断"和"未验证"。
- 本报告与两份已有文档配套,不重复其内容:
  - [套餐研究与首版定价草案](2026-10-14-subscription-plan-research-draft.md)(定价与毛利)
  - [钱包、积分展示与套餐对接方案](../features/2026-10-14-platform-wallet-subscription-integration-design.md)(客户端对接设计)
- 与这两份文档的**一致点与出入见第 7 节**;本轮已与同步修订的两份方案对齐。

## 1. 结论摘要

1. gateway 已有套餐与订阅的主要机制:套餐、订阅实例、订单、额度池、周期重置、到期降级、用户分组升降级、多种支付渠道;支付回调、边界计费和线上配置尚未完整验证,不能据此认定已具备上线验收结论。客户端只接了其中只读的两个接口,界面只展示了价格、周期和状态。
2. 订阅额度是**独立于钱包的额度池**,但单位同为 quota。余额购买也扣 quota,但计算忽略套餐币种;后续核查发现管理端保存套餐时币种被强制写成 USD,因此该风险仅剩历史非 USD 套餐(见 R1)。
3. **钱包和订阅不能相加显示为"可用额度"**:是否能兜底到钱包取决于订阅实例上的 `allow_wallet_overflow`,且任一有效订阅禁止兜底就会整体禁止。
4. **多订阅额度不是简单相加**:一次请求只从一个订阅扣,单个订阅余额不足就跳下一个,不拆分。
5. 套餐的另一项真实权益是 **`upgrade_group`**(购买后升级用户分组,到期降级),客户端完全不可见,而套餐表没有任何面向用户的权益描述字段。
6. `GET /api/subscription/plans` 在"支付合规未确认"时**返回空列表而非报错**,与"没配套餐"不可区分。
7. 关键待确认项是余额购买币种口径(R1)、超额补扣失败后的账实差异(R4)、已售订阅仍依赖当前套餐重置规则(R8)。月期限叠加自然月重置会影响总赠送额度与定价(R9)。接口字段收敛、空列表解释、重置时间与旧链路兼容另列第 6 节。

## 2. 数据模型(已读源码)

| 实体 | 位置 | 关键字段与语义 |
| --- | --- | --- |
| 套餐 `SubscriptionPlan` | `model/subscription.go:146` | `price_amount`、`currency`、`duration_unit/value/custom_seconds`、`total_amount`(**0=不限额**)、`quota_reset_period/custom_seconds`、`allow_balance_pay`、`allow_wallet_overflow`(空=true)、`max_purchase_per_user`(0=不限)、`upgrade_group`、`downgrade_group`、`stripe_price_id`、`creem_product_id`、`waffo_pancake_product_id` |
| 订阅 `UserSubscription` | `:253` | 购买时从套餐**快照**:`amount_total`、`upgrade_group`、`downgrade_group`、`allow_wallet_overflow`;另有 `amount_used`、`start/end_time`、`status`(active/expired/cancelled)、`source`(order/admin)、`last/next_reset_time`、`prev_user_group` |
| 订单 `SubscriptionOrder` | `:214` | 每次购买一条:金额、支付渠道、状态、`trade_no` |

**要点**:订阅仅部分字段是购买时的快照。后台事后修改套餐额度/兜底开关,不回写已售订阅对应字段;但重置周期与自定义重置秒数仍读取当前套餐。预扣会加载套餐并调用重置函数(`:1346`-`:1350`),定时重置同样加载当前套餐(`:1444`-`:1457`)。因此修改重置规则可能影响已售订阅,删除套餐可能阻断预扣或使定时重置跳过该订阅(静态推断,实际受套餐缓存与删除流程影响,未运行验证)。客户端的"套餐含 X"与"我的订阅含 X"分别取 `plans` 与 `self`,不能把当前套餐规则当作完整历史合同。快照赋值见 `CreateUserSubscriptionFromPlanTx`(`:484`-`:558`),风险见 R8。

## 3. 运行机制

### 3.1 购买与开通

- `CreateUserSubscriptionFromPlanTx`(`:484`):校验 `max_purchase_per_user`(统计该用户该套餐的**历史全部订阅**含已过期,故设为 1 会阻止续买);计算 `end_time`;计算首个 `next_reset_time`;若有 `upgrade_group` 且与当前分组不同,**在同一事务内改用户分组**并记 `prev_user_group`。(已读源码)
- 余额购买 `PurchaseSubscriptionWithBalance`(`:755`):事务内锁用户行、校验余额、扣钱包 quota、建订阅、建订单。扣额公式 `calcSubscriptionBalanceQuota`(`:742`)= `ceil(price_amount × QuotaPerUnit)`。(已读源码)
- 第三方支付:路由 `router/api-router.go:248`-`:258` 有余额、易支付、Stripe、Creem、Waffo Pancake 的 `/pay`;易支付另有 notify/return 回调(`:279`-`:282`)。**回调幂等、签名校验本次未读**。(未验证)
- 管理员绑定:`AdminBindSubscription`(`:711`),`source=admin`。(已读源码)

### 3.2 扣费顺序

- 用户计费偏好 `billing_preference`:`subscription_first`(默认)、`wallet_first`、`subscription_only`、`wallet_only`,非法值归一为 `subscription_first`(`common/str.go:114`)。(已读源码)
- `service/billing_session.go:370` 起 `NewBillingSession`,分支见 `:434`-`:470`:
  - `subscription_first`/默认:无有效订阅 → 走钱包;有 → 先订阅;订阅额度不足时,**仅当 `UserActiveSubscriptionsAllowWalletOverflow` 为真才回退钱包**,否则直接返回额度不足。
  - `wallet_first`:钱包余额不足才尝试订阅。
- `UserActiveSubscriptionsAllowWalletOverflow`(`:879`):**只要存在一个有效订阅 `allow_wallet_overflow=false`,整体禁止兜底**,哪怕用户同时持有允许兜底的订阅。(已读源码)
- 多订阅选择:`PreConsumeUserSubscription`(`:1298`)按 `end_time asc, id asc`(**先到期的先扣**)依次尝试;`amount_total>0` 且剩余 < 本次预扣则 `continue` 到下一个;全部不足则报 `subscription quota insufficient`。**不会把一次请求拆到两个订阅上**。(已读源码)
- 预扣与退款:`SubscriptionPreConsumeRecord` 按 `request_id` 幂等;`RefundSubscriptionPreConsume`(`:1402`)回滚。(已读源码)

### 3.3 重置与到期

- 周期取值:`never/daily/weekly/monthly/custom`(`:29`-`:33`)。`calcNextResetTime`(`:344`):每日=次日零点;每周=下周一零点;每月=下月一号零点;自定义=基准+N 秒;**若下次重置晚于订阅结束则不再重置**。(已读源码)
- 重置语义:`maybeResetUserSubscriptionWithPlanTx`(`:1261`)把 `amount_used` 置 0,**不结转**。(已读源码)
- 重置是**惰性 + 定时双保险**:请求预扣时检查并重置(`:1261` 被 `:1298` 调用);定时任务仅在主节点启动,启动时执行一次,随后每分钟执行(`service/subscription_reset_task.go:17,29`-`:43`),批量调用 `ExpireDueSubscriptions` / `ResetDueSubscriptions`。(已读源码)
- 到期:`ExpireDueSubscriptions`(`:1140`)按用户批处理置 `expired`,并处理分组降级(目标为 `downgrade_group`,空则回到 `prev_user_group`)。(已读源码,降级细节仅读了开头)
- **有效期与重置不是同一时钟**:`calcPlanEndTime`(`:308`-`:337`)的月期限采用 `start.AddDate(0,N,0)`,而 monthly 重置对齐自然月 1 日零点。一月期限不等于固定 30 天,目标月份不存在原日期时按 Go 日期规范化,结束日可能落入再下个月。实际到期时间以返回的 `end_time` 为准,见 R9。(已读源码 + 静态推断)
- **时区**:每日/每周/每月零点用 `base.Location()`,即 **Go 进程的 Local 时区**(`maybeResetUserSubscriptionWithPlanTx` 以 `time.Unix` 构造基准;[官方 Unix 文档](https://pkg.go.dev/time#Unix)确认返回 Local Time),并非用户时区。对海外用户或服务器时区非东八区时,"每日刷新"的体感时间会偏。(推断)

### 3.4 `GET /api/subscription/self` 的读取行为

`controller/subscription.go:53`:返回 `billing_preference`、`subscriptions`(有效)、`all_subscriptions`(含过期)。`GetAllActiveUserSubscriptions`(`:848`)只按 `status=active AND end_time>now` 过滤,**读取时不触发重置**。
因此:一个"每日重置"的订阅在零点之后、用户下次请求之前,`/self` 返回的 `amount_used` 仍是**昨天的值**,直到有请求触发惰性重置或定时任务扫到它。客户端若据此展示"剩余额度",会出现短暂偏低。(已读源码 + 静态推断)。定时任务正常运行时通常在下一分钟批处理扫到后刷新;这不是严格的一分钟时效保证,还取决于主节点任务状态、批量处理耗时与错误。

## 4. 客户端现状(已读源码)

- 调用:`src/main/libs/maasAuth.ts:17` 定义端点;`:214`-`:229` 只读取 `plans` 与 `subscriptions`,经 `parseMaasSubscriptions` 投影后进 renderer。
- 解析保留:套餐 `id/title/subtitle/price/currency/duration*/totalAmount/resetPeriod/resetSeconds`;订阅 `id/planId/status/start/end/amountTotal/amountUsed/nextResetTime`;`billingPreference`。(`src/shared/auth/maasSubscriptions.ts`)
- **未解析**:`allow_wallet_overflow`、`upgrade_group`、`downgrade_group`、`max_purchase_per_user`、`allow_balance_pay`、`source`。其中前两个对额度展示与权益解释都关键。
- 展示:界面目前只显示名称、副标题、价格、币种、周期、状态;`totalAmount/amountUsed/resetPeriod` 解析后**未展示**(此前规格明确"先隐藏额度")。
- 只读:客户端**不调用**任何购买、偏好修改接口。
- 旧链路:`src/main/ipcHandlers/subscriptionTrial.ts` 请求 `/api/subscription-trial`,服务器取自 `getServerApiBaseUrl`。**在 `maas-token` 内搜索不到 `subscription-trial` 或 `subscription_trial`**,说明它指向另一个服务。与 gateway 钱包 quota 的关系未读通。当前 `src/shared/product/product.json:23` 配置 `promotions=false`,`src/renderer/App.tsx:2135` 用该开关隐藏旧试用活动入口,故列为后续兼容核查,不作为首批套餐定档阻塞项。(已读源码;服务归属为推断,不代表底层接口已删除)

## 5. 对"以积分展示额度"的含义

1. 技术上可行:订阅额度和钱包额度同属 quota,可按已确认的平台展示规则换算;套餐余额购买价还需单独核对币种,不能靠展示换算修正服务端扣额。这与对接方案文档"只在平台配置 `CUSTOM` 符号为积分时才显示积分"的做法一致。
2. **不能合并两池显示**。原因见 3.2:兜底资格由订阅实例级别开关与"任一禁止即整体禁止"决定;合并数字在禁止兜底时会误导。
3. **多订阅不显示合计剩余**:合计不代表单次请求可用上限,单次请求只能用一个订阅的余额,且一份订阅的剩余不足时才会换下一份。首版按订阅分别展示,不提供合计数字(与对接方案、定价草案一致)。
4. 套餐 `total_amount=0` 是不限额,展示成"0"会严重误导。
5. 周期额度不结转,宣传"每月 X"必须同时说明当期不累计。
6. 套餐间的真实差异可能在 `upgrade_group`(模型范围/倍率),只写额度会漏卖点;但分组名是内部标识,**不应原样展示**,需要一份面向用户的映射,而 gateway 没有这个字段。

## 6. 风险与待平台方评估的问题

以下均为**记录接口缺口,不是客户端可修复项**(工作区规则禁止修改 gateway)。

**R1 — 余额购买套餐忽略套餐币种(已读源码;2026-10-14 后续核查已收窄范围)**
`calcSubscriptionBalanceQuota`(`:742`)只用 `price_amount × QuotaPerUnit`,**不读取 `currency`**(已验证函数体内无 currency 引用)。`QuotaPerUnit` 的定义是美元口径(`common/constants.go:24`,注释 `$0.002 / 1K tokens`)。若套餐 `currency=CNY` 且 `price_amount=99`,余额购买会扣 `99 × 500000` quota,即**按 99 美元扣**,而线上展示单位是 CNY、汇率 7,用户钱包页显示的是人民币。展示价与实扣可能相差汇率倍数。

**后续核查(已读源码)**:`AdminCreateSubscriptionPlan` 与 `AdminUpdateSubscriptionPlan`(`controller/subscription.go`)都在落库前执行 `req.Plan.Currency = "USD"`,**无论请求传什么币种都被改写为 USD**。因此:

- 通过当前管理接口**新建或再保存**的套餐,币种恒为 USD,`price_amount` 的单位只能是美元,扣额公式与标价口径自洽。
- **风险只剩历史上已存在、币种非 USD 的套餐**(此前版本或直接改库产生的)。这些套餐重新保存一次会被改写为 USD,但 `price_amount` 数值不会随币种自动换算,需同时改成美元数值。
- 对定价草案的影响:**套餐标价只能是美元**。草案里的"¥39 / ¥99 / ¥299"不能直接作为 `price_amount` 录入,须换算成美元或另议。展示给用户的币种与平台钱包展示单位(CNY/CUSTOM)是另一回事,由 `general_setting` 决定。
- 仍未核对线上现有套餐的实际币种(见 8)。核对方法见 [对接文档 08 的 3.5](../features/gateway-integration-api/08-integration-checklist.md)。

定价草案里"人民币计划先设置 `allow_balance_pay=false`"的保守做法,对**新建套餐**已不再需要;对**历史非 USD 套餐**仍然成立。

**R2 — 套餐接口向所有登录用户暴露内部字段(已读源码)**
`GetSubscriptionPlans`(`controller/subscription.go:32`)返回完整 `SubscriptionPlan`,含 `stripe_price_id`、`creem_product_id`、`upgrade_group`、`downgrade_group`。客户端已做白名单投影,未向界面透传,但接口本身对任何登录用户可见。这些标识不等同于密钥,本报告不将其直接判定为漏洞;建议告知平台方评估接口契约是否应收敛。

**R3 — 支付合规开关让空列表歧义(已读源码)**
`controller/subscription.go:33`:未确认合规时直接返回 `[]`。客户端无法区分"没配置套餐"与"合规未开启"。对接方案已建议结合 `GET /api/user/topup/info` 区分,**但该接口客户端尚未接入**。

**R4 — 超额补扣失败可能产生账实差异(已读源码 + 静态推断,高关注)**
`PostConsumeUserSubscriptionDelta`(`model/subscription.go:1510`-`:1533`)在 `amount_used + delta > amount_total` 且限额非零时返回错误。该错误经 `BillingSession.Settle`(`service/billing_session.go:42`-`:54`)与 `SettleBilling`(`service/billing.go:54`-`:89`)向上返回。常规文本(`service/text_quota.go:451`-`:453`)与音频相关结算(`service/quota.go:240`-`:242`,`:369`-`:371`)只记录错误并继续;用量统计在结算前已更新。普通 Relay 的退款条件是 `newAPIError != nil`(`controller/relay.go:200`-`:209`),这类被记录的结算错误不会自行设置该错误,正常成功路径因此不会触发失败退款。
**静态推断**:若实际用量超过预扣且超出该订阅剩余,可能响应成功、原预扣保留、额外补扣失败,使统计/消费日志与订阅实际扣额不一致;客户端不能自行补扣或重建账本。触发概率、流式/非流式差异、任务与特殊路径覆盖仍需平台方在其获准测试环境运行验证,不能把静态阅读描述成线上已发生。该问题属于计费验收项,不阻碍研究候选套餐,但上线前需确认平台处理口径。

**R5 — 时区与重置体感(推断)**
见 3.3。需要确认服务器时区,以及对用户宣传"每日刷新"时的措辞。

**R6 — 读到的额度可能是过期值(已读源码 + 推断)**
见 3.4。

**R7 — 旧试用链路归属待核查(后续兼容项)**
`/api/subscription-trial` 不在 gateway 内。当前 `promotions=false` 已隐藏活动入口。未来若恢复入口或复用旧服务,再确认服务归属及其积分与 Gateway quota 的关系;保持禁用时无需阻塞本轮套餐研究,也不得仅因隐藏而删除兼容实现。

**R8 — 已售订阅仍依赖当前套餐(已读源码 + 静态推断,高关注)**
见第 2 节。运营应保留承载有效订阅的套餐,权益或重置规则升级优先新增套餐版本,旧套餐停止新售并保留已有引用。删除套餐、直接改重置规则的业务结果须由平台方确认;客户端缺少历史重置规则快照,只能如实展示当前返回的数据及更新时间。

**R9 — 月期限与自然月重置组合会扩大可用总额度(已读源码 + 静态推断,定价前必确认)**
月期限从购买时间按 `AddDate` 推进,monthly 则在自然月月初重置。比如 10 月 30 日购买一月期限套餐,可在 11 月 1 日很快恢复整份额度,即同一订阅有效期通常有购买后、重置后两段额度;若原日期在次月不存在而规范化越过再下一月月初,还可能有三段额度,例如非闰年 1 月 31 日购买、规范化至 3 月 3 日到期,经历 2 月与 3 月月初。Go 的日期规范化见[官方 AddDate 文档](https://pkg.go.dev/time#Time.AddDate)。`calcNextResetTime` 只排除严格晚于结束时间的重置(`:380`),与结束时间相等时仍会写入下次重置,但有效订阅查询要求 `end_time>now`,不应承诺到期时还能使用重置额度。
首批若销售“每次购买一份额度,一月内使用”,建议 `quota_reset_period=never`;若销售自然月刷新权益,须按实际可经历的重置次数重新测算成本,说明首次刷新时间及到期规则。以上是源码推导,未运行边界验证,不改变平台配置。

## 7. 与现有文档的一致与出入

**一致**
- 钱包与订阅是两个池,不可相加(对接方案、定价草案、本报告一致)。
- 不把客户端积分做成账本,只做展示换算(对接方案)。
- 人民币套餐先关余额购买(定价草案;本报告 R1 提供源码依据)。
- 套餐接口在合规未确认时返回空(三份一致)。

**已对齐的审核意见 / 仍需确认的业务口径**
1. **"任一禁止兜底即整体禁止"**:对接方案本轮已补全此语义。持有多份订阅的用户,钱包兜底取决于最严格的那一份。
2. **多订阅不拆分单次请求、先到期先扣**:对接方案本轮已补充,后续额度展示按订阅分别呈现。
3. **订阅仅部分字段快照**:套餐展示与订阅额度取自不同时点的数据,重置规则仍依赖当前套餐;两份方案本轮已补套餐版本与停售保留规则。
4. **`upgrade_group` 对用户的意义**:定价草案写"`upgrade_group` 暂留空,直到模型分组权益确定",方向正确;首版不启用此权益;日后启用时需给出公司权益文案与模型权限映射,不展示内部组名。
5. **定价草案的"专业月包 ¥99 / ¥110 等值 quota"**:`quota` 由 `等值人民币 × quota_per_unit ÷ usd_exchange_rate` 得出,按线上当前值(500000、7)约为 `110 × 500000 / 7 ≈ 7,857,142`。而 R1 指出余额购买的扣额是 `99 × 500000 = 49,500,000`。**两者约相差 6.3 倍,不是两个数量级。套餐附赠额度与购买成本本来也不是同一项权益;这里的币种风险应比较 ¥99 标价与按 99 美元扣额(汇率为 7 时等值约 ¥693)。币种口径未统一前不能用余额购买公式反推附赠额度。** 请定价负责人确认。
6. 对接方案把 `/api/log/self` 的 `other.billing_source` 作为扣费来源依据。**已核实该字段确实写入**:`service/log_info_generate.go:159`-`:162` 在 `BillingSource` 非空时写入 `other["billing_source"]`,取值为 `wallet` 或 `subscription`。但**未核实该函数是否覆盖所有消费路径**(例如任务类、违规扣费),仅确认了主路径存在。(已读源码,覆盖面未验证)

## 8. 本次未做 / 未能确认

- 未读真实后台与线上数据:不知道线上套餐实际配置的价格、币种、额度、分组、重置周期。
- 未运行 gateway,所有结论来自静态阅读,未用测试复现。按订阅文件名定位到两个测试文件:`model/subscription_reset_test.go`(5 个用例,**只看了用例名**:全部围绕管理员按套餐重置订阅)和 `model/subscription_auth_test.go`(2 个用例,**未阅读**)。此外还有通用额度/计费相关测试,文件名与用例名不足以证明全部间接覆盖情况;对重点函数的测试引用检索未发现直接覆盖。因此本次**未确认测试覆盖惰性重置、多订阅预扣选择、`allow_wallet_overflow` 回退、结算超额**这几条本报告重点描述的行为,所以本报告不声称这些行为已通过测试验收。
- 未读:支付回调的签名与幂等、`AdminInvalidateUserSubscription` 的细节、分组降级的完整分支。已补读 `ResetDueSubscriptions` 的当前套餐依赖及主节点每分钟定时间隔,未运行验证其部署状态。
- 未读 `/api/user/topup/info`、`/api/user/self` 与订阅的交互(例如分组升级后用户信息缓存刷新的时机,仅见 `refreshSubscriptionUserGroupCache` 被调用)。
- 未核对客户端 `maas:billing` 与订阅 `amount_*` 是否在同一时刻取数。
- 旧 `subscription-trial` 服务端不在仓库内,未追查。

## 9. 建议审阅方向

按优先级:
1. **R1、R4、R8**:定价前核对币种,上线前由平台方验证超额补扣账实一致性,并确定旧套餐保留和版本规则。R4 已追到常规文本/音频上层,剩余是运行验证及特殊路径覆盖。
2. **R9**(有效期与自然月重置):首批按每次购买一份额度配置 `quota_reset_period=never`;若改成自然月刷新,先重算成本和宣传。
3. 第 7 节第 1、2、3 条已同步补进对接方案,业务定档时保留这些约束。
4. 本报告重点描述的四条行为(惰性重置、多订阅预扣、兜底回退、结算超额)在 gateway 测试里似乎没有覆盖(见第 8 节),审阅者可考虑建议平台方补测试,验证由平台方在其获准测试环境完成;本工作区不构建、测试或修改 Gateway 及其副本。
5. R2、R3、R5、R6按接口与展示需求处理;R7仅在恢复旧活动或复用服务前核查。

## 10. 对客户端的影响(仅记录,本报告不开发)

- 若要展示额度,需先扩展 `maasSubscriptions.ts` 解析 `allow_wallet_overflow`(订阅级),**不需要新接口、不触碰 gateway**。
- 展示"套餐含 X"与"我的订阅剩余"应分别取自 `plans.total_amount` 与 `self.amount_*`,并标注数据时点。
- R6 的旧值不能用区间或百分比规避。后续若展示余额,标明"平台返回的当期余额"、同步时间及重置时间;到重置边界或完成消费后重新读取,刷新失败保留时效提示,不自行清零或推算新余额。首批维持当前精确订阅剩余额度隐藏,平台方完成超额结算与重置边界验收后再开放。
- R4 是服务端对账边界,客户端展示不能修复。研发前确认历史流水字段可解释范围,账实不一致时保留原始服务端数据并提示待核对,不承诺消费日志汇总必然等于余额差额。
- R8 采用新增套餐版本、旧套餐停售保留的运营建议;本报告只记录,任何平台配置或代码操作仍需由平台方另行授权执行。
