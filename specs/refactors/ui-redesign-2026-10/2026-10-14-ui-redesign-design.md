# 星途 UI 重设计

## 背景
老板对界面不满意:侧边账号菜单、设置弹窗、登录界面、推荐文件类型按钮和示例面板都偏丑、间距混乱。

## 范围(仅样式层 + 抽出布局组件)
不改:答案渲染、Markdown、插件/技能/MCP、业务逻辑、聊天主区宽度(760px)。

## 改动
- 设置页:`settings.css` 重写,统一间距 token(4/8/12/16/24/32);新增 `settings/SettingsLayout.tsx`(`SettingsSection`、`SettingsListRow`);`SettingsGroup`/`SettingsRow` 改为其薄封装;"常规"和"智能体引擎"页已迁移。
- 账号菜单:`CardOverflowMenu` 增加可选 `menuClassName`;`PlatformAccountButton` 菜单重排。
- 文件类型图标与快捷按钮:`icons/fileTypes` 改为带徽标的彩色图标;`QuickActionBar` 按类型着色。
- 示例面板:`OfficeQuickActions` 去掉外框和底部提示;`PromptPanel` 去掉标题行和"推荐示例"标签,改紧凑双列卡片。
- 登录:`WelcomeDialog`、`PlatformLoginDialog`、`PlatformLoginForm`、`ChatLoginExperienceModal` 改为居中单卡;标题"星途"、副标题"享受你的 AI 工作空间"、卡片下方宣传语;去掉密码保存说明;新增短信提示和倒计时文案。
- 默认主题改为 `light`(仅新安装生效)。
- i18n:新增 `maasSMSHint`、`loginIntroductionTagline`、`maasLoginCardTitle`、`maasLoginCardSubtitle`、`maasLoginTagline`,中英文齐全。

## 设置页迁移(第二轮)
- 外观、快捷键、关于、浏览器(含凭据管理)、插件页迁移到 `settings-section` / `settings-list` / `settings-list-row`;模型/平台、记忆页通过样式去掉外层大卡片;IM 页只调整外层渠道网格和内容区,内部表单未动。
- `.settings-preference-row` 补 `flex-direction: row`;浏览器页下拉控件宽 256px,≤620px 才换行。
- 删除无引用的 `LoginShowcase.tsx`、其专用 CSS,以及 i18n 键 `maasWelcomeBadge`、`maasWelcomeHint`、`coworkQuickActionExamples`、`officeQuickActionsDraftHint`。

## 个人资料与套餐(第三轮)
- 个人资料:去掉"登录与安全"块和账号/ID 两张卡片;一行身份(头像、名字、状态、`@用户名 · #ID`)加一张余额卡;刷新按钮移入余额卡底部;弹窗宽 420px。
- 套餐弹窗:圆角、标题、卡片与设置页统一;价格带币种与周期;当前套餐用主色边框;订阅按钮保持禁用(测试要求),样式改轻。
- 宣传位:新增 `login/platformPlanPromotion.ts`(`PLAN_PROMOTIONS`,按套餐 ID 配置"推荐"标记和中英文卖点,默认为空,不渲染任何额外内容);新增 i18n 键 `maasPlanRecommended`;价格、标题、副标题仍取自平台,客户端不写死。已订阅套餐优先显示"当前套餐"而非"推荐"。

## 验证
- `tsc --noEmit`、`npm test`(5937 通过)、隔离目录 `vite build`、相关文件 ESLint 均通过。
- 后续核验已清理全目录导入/导出顺序错误及两处未使用变量警告；`npx eslint src/`、`npx tsc --noEmit` 通过，IM、定时任务、安全扫描与回答区定向测试 354 通过、1 跳过。
- 在隔离预览(esbuild + Tailwind + 无头 Chrome)里看过设置、登录、示例面板的浅色/深色截图;未在真实客户端窗口验证。

## 剩余工作
- 补真实套餐 ID、推荐标记与卖点文案(`platformPlanPromotion.ts`);购买功能接通后把禁用的订阅按钮换成真实按钮。
- 插件页、IM 页新样式未渲染验证(IM 右侧内容区新增的边框可能与内部子卡片叠加)。
- 窄窗口(≤800px)、套餐/个人资料弹窗窄屏、Windows/Linux、真实客户端窗口(含示例面板淡入动画)均未验证。
- 侧栏"升级套餐"入口未改。
- 当前 `shilijia-agent` 是 Git 仓库；删除的 `LoginShowcase.tsx` 可从 HEAD 恢复。
