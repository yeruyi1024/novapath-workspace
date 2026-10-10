# 上游来源与本仓库变动

本仓库以 [NetEase Youdao / LobsterAI](https://github.com/netease-youdao/LobsterAI) 的已发布版本为基线，目标是保留桌面应用及其 OpenClaw 集成，并补齐可在 GitHub 托管机器上执行的安装包构建流程。

| 项目 | 已核验值 |
| --- | --- |
| 上游仓库 | `https://github.com/netease-youdao/LobsterAI.git` |
| 发布版本 / tag | [`2026.9.23`](https://github.com/netease-youdao/LobsterAI/releases/tag/2026.9.23) |
| 基线 commit | [`791a352dee3b3d8c6f64edcaf229ce474a68f6c5`](https://github.com/netease-youdao/LobsterAI/commit/791a352dee3b3d8c6f64edcaf229ce474a68f6c5) |
| 发布时间 | `2026-09-23T14:29:57Z`，北京时间 2026-09-23 22:29:57 |
| 核验日期 | 2026-10-10，Asia/Shanghai（北京时间） |
| 本仓库目标远端 | `https://github.com/yeruyi1024/novapath-workspace.git` |
| 应用版本 | `package.json` 中的 `2026.9.23` |
| OpenClaw 基线 | `package.json` 中的 `v2026.8.1`，含本仓库版本对应补丁 |
| dsh 基线 | `package.json` 中的 `0.1.5-rc.3`，可选实验功能 |

“最新发布版本”是上述核验时点的发布快照，不代表自动跟随上游默认分支或未来新发布。后续升级应重新核验 release、tag 与 commit，并一起复核依赖锁文件、OpenClaw 补丁、插件、运行验证和安装包结果。

## 本次变动范围

- 提交根目录及带 npm 依赖的内置技能 `package-lock.json`，根目录使用公开 npm registry；技能构建按锁文件安装。
- 将 `.github/workflows/ci.yml` 改为改动文件 lint、Renderer/Main 编译、技能准备、Vitest 和编译产物检查；保留手动 `electron-verify.yml` 作为同一质量工作流的显式重跑入口。
- 将 `.github/workflows/build-platforms.yml` 改为四个原生宿主上的安装包流水线：macOS arm64、macOS x64、Windows x64、Linux x64。固定 Node.js、npm、pnpm，构建完整 OpenClaw runtime，执行基础 runtime smoke，输出安装包、SHA-256 清单及构建元数据。
- `.nvmrc` 与 CI 固定 Node `24.20.0`，包含上游确认的 Windows libuv 退出竞态修复；npm `11.17.0`、pnpm `12.1.0` 保持固定，上游最低 Node engine 不变。旧 Windows CI 的 npm 子进程曾退出 `0xC0000409`；采用含修复的版本，最终仍以实际安装和 runtime smoke 结果为准。
- 新增 `scripts/ci-*.cjs` 支持矩阵选择、工具链检查、技能准备、输出校验、runtime smoke、打包、产物收集及可选 GitHub Release draft。
- 增加 `vendor/openclaw-plugins` 的精确输入缓存：键覆盖原生 OS / 目标架构、Node/npm/pnpm/Electron、OpenClaw source commit、应用与上游锁文件、全部构建脚本及本地扩展。无 fallback key，不缓存完整 runtime；恢复后仍执行必需插件、原生 smoke 和官方资源 hook 门槛，未声称云端加速已验证。
- runtime / installer 增加 30 秒阶段心跳，报告 elapsed、距最后输出的时间与 PID，保留真实退出码和取消状态。心跳仅反映进程存活，不代表完成比例；不增加总构建超时、重试或跳过检查。POSIX 进程组取消已用真实子进程验证，Windows 进程树取消尚未在本机实际验证。
- CI 设置 `DEBUG_DMG=true`，显示 macOS hdiutil 的 DMG 生成与压缩输出，便于定位打包等待；不改变产物格式及校验门槛。
- 为 CI 中可选且使用自定义 registry 的插件 pack 限定 30 秒外层时限、25 秒 fetch 时限和零 fetch 重试；当前对应 POPO，其余 pack 路径保持 180 秒。可选下载失败不保证对应功能，必需插件门槛保持不变。
- readiness HTTP 探测增加 1.5 秒绝对时限和 64 KiB（65,536 字节）响应上限，覆盖响应中止、滴流、超时与异常关闭；保留 `/startupz` 的成功 JSON 合同及仅 404 回退。子进程 / HTTP 的 13 项新增 Node CI 合同已本机通过，质量工作流显式执行这些测试。
- 修正打包阶段对可选 OpenClaw 插件的处理：只有显式标记 `optional: true` 的缺失插件可以警告后继续；必需插件缺失仍会失败，已安装的可选插件仍接受完整校验，并增加对应测试。
- 修正 Windows 安装资源：便携 Git、Bash、Python 和必要空目录随合并归档分发；归档、解包完成标记及中断安装恢复均检查资源完整性，并增加实际归档/解包测试。
- 延长 Mac Intel 的大插件解包预算为 15 分钟、外层 CLI 为 20 分钟，处理真实 CI 中 Discord 解包在原两分钟上限触发的超时/并发清理失败；Windows 保留已有长预算，Mac ARM 与 Linux 保留原预算。必需插件安装或校验失败仍阻止打包。
- 加强 draft release 校验：SHA-256 清单精确覆盖 manifest 中的产物和构建元数据，实际产物大小和摘要必须与元数据一致；校验失败时不写入 GitHub Release。复用已有 draft 时还要求其 `targetCommitish` 与本次源码 commit 完全一致，避免未发布且尚未生成 tag 的 draft 被跨源码更新；已正式发布的 Release 不覆盖。
- 修正四个测试 fixture 的跨平台行为，不改变业务代码：`openclawCompatibilityRepairCore.test.ts`、`nspClawguardCompatibility.test.ts`、`nspClawguardInstallRepair.test.ts` 使用临时目录的真实路径，避免 macOS `/var` 符号链接被安全检查识别为别名；`reviewSource.test.ts` 为测试 Git 仓库设置本地 `core.autocrlf=false`，保持预期 blob 字节。
- 将上游 workflow 与 Dependabot 配置快照保存到 [`docs/upstream-workflows/`](docs/upstream-workflows/)。该目录不是 GitHub Actions 或 Dependabot 执行目录；上游欢迎、标签、stale、OpenClaw 检查、安全 workflow 和 Dependabot 定时更新不自动启用。当前构建流水线没有定时触发，也不依赖 GitHub Advanced Security。
- 新增 [`docs/BUILD_AND_CI_zh.md`](docs/BUILD_AND_CI_zh.md)，记录运行边界、命令、打包流程、验证状态及分发限制。

应用品牌、应用 ID、默认数据目录、官方服务入口和上游自动更新渠道仍保留上游行为。本次构建方案没有将有道账号、套餐、商城、云发布或 IM 平台服务转换为本地服务，也没有为 GitHub Releases 配置应用内自动更新。

锁定范围为应用和技能的 `npm ci`，以及 OpenClaw 源码构建的 `pnpm install --frozen-lockfile`。上游 `scripts/build-openclaw-runtime.sh` 仍在生产 runtime 组装时删除旧 npm 锁文件，再执行 `npm install`；插件的传递依赖也没有全部纳入本仓库锁文件。因此本次保证所记录源码、工具链与应用/技能锁文件可追溯，不宣称所有依赖或最终安装包可逐字节复现。后续可继续扩展生产 runtime 与插件的完整依赖锁定及资产哈希验证。

固定 npm `11.17.0` 指全局及顶层 CLI，应用依赖仍由根锁文件固定 npm `11.21.0`。npm scripts 将 `node_modules/.bin` 前置，因此 runtime 内嵌套 npm 命令以及解析应用依赖 CLI 的插件 pack 会使用嵌入版；心跳 wrapper 严格选择全局 `11.17.0` 作为顶层 runtime 入口，不将 `11.21.0` 当作 fallback。metadata 的 `toolchain.npm` 记录全局 / 顶层版本，不表示所有子进程都用同一 npm；插件缓存键中的根锁文件覆盖嵌入版变动。本次没有修改该上游 npm 依赖。

## 许可证与第三方组件

上游项目采用 [MIT License](LICENSE)，保留 NetEase Youdao 版权与许可证。OpenClaw、Electron、内置技能及随包依赖各有其许可证；发行方应保留适用的第三方许可与声明。自编译安装包不等同于上游官方签名包。

## 验证与发行记录

本地和首次 GitHub Actions 的实际结果以 [`docs/BUILD_AND_CI_zh.md` 的验证记录](docs/BUILD_AND_CI_zh.md#验证记录) 为准。构建元数据包含源 commit、目标平台、应用与 runtime 版本、工具链、依赖锁文件哈希和安装包哈希；发行时应保存对应运行链接，不将未完成的验证记录表述为已通过。
