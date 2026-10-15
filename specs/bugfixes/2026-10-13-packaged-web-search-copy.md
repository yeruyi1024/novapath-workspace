# 首次安装联网搜索技能的时间戳误判

状态：修复完成，完整测试与生产副本冷启动/重启验证通过。

## 复现与原因

macOS arm64 生产包在独立 profile 冷启动能加载 renderer，但后台 web-search 服务报告 `Web-search runtime is still unhealthy after attempted repair`。随包脚本、dist/server/index.js、iconv-lite 均存在且脚本标记符合要求。

生产包源文件比编译产物旧，原始资源健康；首次同步使用 cpRecursiveSync 按目录顺序复制，dist 在 server 前，而 copyFileSync 重置文件修改时间。用户目录中 server/*.ts 因复制顺序变新，isWebSearchDistOutdated 因此误判。安装包按现有规则不携带 tsconfig，启动时 npm run build 不能修复此错误的过期判断。

隔离测试副本自身也必须保留资源时间戳；已核对原始产物与 profile 时间关系，修复测试引导的复制方式，避免将测试副本误差当成产品问题。

## 修复边界

给安全复制助手增加可选 preserveTimestamps，仅在 web-search 的首次随包同步/修复时启用。其他技能、插件/技能/MCP 的加载与执行、版本/健康检查、凭据、模型和对话保持现有行为。无需网络安装或降低健康检查；不修改 gateway，不扩大清退，也不修改活动 runtime。

验收：中文路径嵌套复制保留源/产物时间顺序，默认不覆盖已存在的文件；目标用例、相关技能测试、改动 lint 和生产构建通过；重打包后用保留时间戳的独立生产副本冷启动，确认没有误修复且 bridge 服务可运行。首次/重启、原始 DMG 与测试引导的差异分别记录。

## 实现与验证

- cpRecursiveSync 新增可选 preserveTimestamps，默认行为不变；web-search 的随包初次复制与修复启用它。原子升级复制同样支持该选项，并仅在 web-search 升级时启用。用户自定义文件、备份/回退与其他技能的处理保持现有实现。
- 新增嵌套中文路径的源/编译时间顺序、保留既有文件、原子升级时间顺序与配置保留回归用例。修复中曾在可选原子复制选项传 undefined 时出现 3 个旧用例失败；已将缺省值明确为 false，未删除/放宽断言。
- 最终完整 Vitest：5,915 通过、148 跳过，554 文件通过、16 文件跳过。针对 fsCompat/skillServices/skillManager watcher/bundledSkillReplacement 的 18 用例通过。6 个修复 TS 文件严格 lint、diff 检查通过。
- 隔离生产构建、Electron 编译、macOS arm64 DMG 生成及镜像校验通过。生产副本采用独立 appData、抑制协议与开机启动注册、临时本机签名；为避开活动开发客户端 8923 端口，仅测试副本将 web-search 端口改为 18923。原始 DMG 和发行 app 不含这些引导/端口修改。
- 初次与重启均正常打开生产 renderer 的登录页，无 did-fail-load/render-process-gone，用户目录编译时间晚于源码；没有重新编译或误修复，独立 bridge 健康检查 HTTP 200。测试副本已正常退出，活动开发客户端未重启。

此修复不等于正式签名、公证或 Windows/Linux 真机验收；完整平台登录/模型/额度与凭据升级验收不由空 profile 启动检查替代。
