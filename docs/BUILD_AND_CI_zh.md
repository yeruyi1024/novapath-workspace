# 本地运行、安装包构建与 GitHub CI

基线为 LobsterAI 已发布版本 `2026.9.23`，来源、commit 与核验日期见 [`UPSTREAM.md`](../UPSTREAM.md)。项目是 Electron + React 桌面应用，默认主 Agent 运行在本机 OpenClaw 网关中。源码具有本地构建和接入本地模型的路径；实际已通过项目及待验证项目见本文末尾，不能把编译通过等同于全部功能或所有平台均已运行通过。

## 本地工具链与依赖

本次方案固定使用以下版本，与 CI 一致：

| 工具 | 固定版本 / 用途 |
| --- | --- |
| Node.js | `24.20.0`（`.nvmrc` 与 CI 固定；上游最低 engine 仍为 `>=24.15.0 <25`） |
| npm | 全局 / 顶层 CLI `11.17.0`，支持上游按包控制安装脚本；嵌入依赖版见下文 |
| pnpm | `12.1.0`，用于锁定版本 OpenClaw 的依赖与构建 |
| Git | 克隆主仓库、OpenClaw 和 Git 来源插件；Windows 还需要 Git Bash |
| Electron | 根 `package.json` 锁定的 `43.5.0` |
| Python | CI 使用 `3.12`；Windows 安装包另准备便携 Python runtime |

上游 Node/npm 的 `engines` 允许版本范围，但本次 CI 使用上表精确版本。`.npmrc` 启用 `engine-strict`，并设置 `https://registry.npmjs.org/`。根目录和带 `package.json` 的技能都提交 npm 锁文件；正常构建使用 `npm ci`，不先执行 `npm install` 改写依赖解析。

上表 npm 指全局及顶层构建入口的 `11.17.0`，应用依赖中的 npm 则由根锁文件固定为 `11.21.0`，本次保留上游依赖。npm scripts 会把 `node_modules/.bin` 放到 PATH 前部，所以 runtime 脚本中的嵌套 npm 命令、以及显式解析应用依赖 npm CLI 的插件打包路径会使用该嵌入版。`ci-build-step.cjs` 严格寻找全局 `11.17.0` 启动顶层 runtime，不会将应用依赖版当作入口 fallback；构建 metadata 的 `toolchain.npm` 记录全局 / 顶层 CLI，不能据此声称所有 npm 子进程均使用 `11.17.0`。插件缓存键包含根锁文件，因此覆盖嵌入版 npm 的变动。

锁定范围不覆盖全部最终 runtime：OpenClaw 源码用 `pnpm install --frozen-lockfile`，但上游 `scripts/build-openclaw-runtime.sh` 在生产 runtime 阶段删除 npm 锁文件后执行 `npm install`，插件传递依赖也没有完全锁定。当前实现提供源码、工具链、应用/技能锁文件和最终产物哈希的追溯，不能承诺全包逐字节复现；若要更强复现能力，需另补生产 runtime / 插件锁定和下载资产哈希。

`better-sqlite3@13.0.3` 带 N-API 预编译文件，根 `allowScripts` 配置跳过该版本多余的编译步骤。仍需下载 Electron、OpenClaw、插件和其他依赖；Windows 需要准备便携 Git/Python，Linux 桌面运行需要对应 Electron 系统库。锁文件约束版本，不保证第三方 registry、GitHub 或 CDN 永久可达。

以下 shell 命令以 macOS/Linux Bash 为例；Windows 可使用 Git Bash，设置环境变量时也可采用 PowerShell 的 `$env:变量名 = '值'`。

```bash
npm install --global npm@11.17.0 pnpm@12.1.0 --no-audit --no-fund
node --version
npm --version
pnpm --version
npm ci --no-audit --no-fund

# npm 安装后确认 Electron 二进制存在；CI 显式执行此下载步骤。
node node_modules/electron/install.js
```

## 开发与本地打包

首次开发启动需要先构建 OpenClaw runtime：

```bash
npm run electron:dev:openclaw
```

runtime 已存在且版本/补丁未改变时，日常命令为：

```bash
npm run electron:dev             # Vite http://localhost:5175 + Electron
npm run build                    # Renderer 和 thumbnail 生产构建
npm run compile:electron         # Main / preload TypeScript 构建
npm test                         # 上游 Vitest 入口
```

手动准备或重建 runtime：

```bash
npm run openclaw:runtime:host
OPENCLAW_SRC=/path/to/openclaw npm run electron:dev:openclaw
OPENCLAW_FORCE_BUILD=1 npm run openclaw:runtime:host
```

`OPENCLAW_SRC` 默认指向仓库的同级 `../openclaw`；CI 则使用工作目录内的 `.ci-openclaw`。一般保留 `vendor/` 缓存即可，runtime 按上游版本和补丁哈希判定是否重建。只有明确开发 OpenClaw 本地修改时才设置 `OPENCLAW_SKIP_ENSURE=1`。

本地安装包应在目标操作系统及目标架构上构建，产物输出到 `release/`：

```bash
# 先安装锁定依赖，再清理可能残留的编译输出。
npm ci --no-audit --no-fund
npx rimraf dist dist-electron

# 在相应原生宿主执行一个目标。
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:win
npm run dist:linux
```

macOS 分别使用明确的 `dist:mac:arm64` / `dist:mac:x64`，避免把 `dist:mac` 的前置 runtime 行为当作自动检测所有架构。Windows 首次准备可以执行 `node scripts/setup-mingit.js --required` 与 `node scripts/setup-python-runtime.js --required`；打包还必须通过 `npm run verify:installer-patches`。CI 不构建 universal macOS、Windows arm64 或 Linux arm64，这些目标不在本次已配置矩阵中。

主要链路为：Renderer/Main 编译 → 内置技能依赖与产物 → 锁定 OpenClaw 源码、补丁、网关 bundle、插件、本地扩展与裁剪 → runtime smoke → electron-builder。CI 将步骤拆开执行以保留独立失败点，最后调用 `scripts/ci-package.cjs` 一次，使用上游 `scripts/electron-builder-config.cjs` 和资源 hook，并指定 `--publish never`。Windows 的 OpenClaw、SKILLs、便携 Python 与 Git 经 hook 合并为 `win-resources.tar`，安装后解压；本次补齐上游遗漏的 `mingit`，归档前与安装提交前要求关键 Git/Bash 文件及 MSYS 空目录完整；默认 NSIS 包是完整安装器，未启用需要 CDN 的在线 stub。

## GitHub Actions 方案

所有 jobs 使用 GitHub 托管 runner，无需本机长期在线或配置自托管机器。平台定义集中于 [`scripts/ci-common.cjs`](../scripts/ci-common.cjs)：

| 目标 | 原生 GitHub runner | 架构 | 必须输出 |
| --- | --- | --- | --- |
| `mac-arm64` | `macos-15` | arm64 | `.dmg` |
| `mac-x64` | `macos-15-intel` | x64 | `.dmg` |
| `win-x64` | `windows-2025` | x64 | NSIS `.exe` |
| `linux-x64` | `ubuntu-24.04` | x64 | `.AppImage`、`.deb` |

Linux 打包仍标注为实验性，尤其没有配置上游 dsh runtime 下载；基础网关 smoke 通过也不能替代目标发行版中的安装、桌面 UI 和技能验收。

[`ci.yml`](../.github/workflows/ci.yml) 在 `main` / `develop` push、PR、手动触发及被其他工作流调用时运行；仅修改 `docs/**` 或 Markdown 的 push/PR 会按 `paths-ignore` 跳过。它安装锁定依赖和 Electron，准备 Linux 系统库，对改动 TypeScript 文件执行 lint，编译 Renderer/Main，准备锁定技能，执行 `npm test -- --maxWorkers=2` 与 `node --test scripts/ci-tests/*.test.cjs`，再校验必要的编译输出。全仓库历史 lint debt 不被误设为新增改动的门槛。

[`electron-verify.yml`](../.github/workflows/electron-verify.yml) 只提供手动重跑，复用上述质量检查，避免每次 push/PR 重复安装测试。

[`build-platforms.yml`](../.github/workflows/build-platforms.yml) 的入口与选项：

| 入口 / 输入 | 行为 |
| --- | --- |
| `workflow_dispatch` | 在 Actions → Build Platforms → Run workflow 手动构建所选分支 |
| `platform=all` | 四个目标全部构建，默认值 |
| `platform=macos` | macOS arm64 与 x64 两个目标；界面使用 `macos`，不是 `mac` |
| `platform=mac-arm64` / `mac-x64` | 只构建所选 macOS 架构 |
| `platform=windows` | 只构建 Windows x64 |
| `platform=linux` | 只构建 Linux x64 |
| `publish_draft=false` | 默认仅上传 Actions artifacts |
| `publish_draft=true` | 所选目标全部成功后，将产物上传 GitHub Release draft |
| `release_tag` | 可选 draft tag；留空时为 `v<应用版本>-ci.<run_id>` |
| push `v*` tag | 构建全部目标，成功后自动创建/更新 draft；不会自动发布为正式 Release |

命令行示例：

```bash
gh workflow run build-platforms.yml --ref main \
  -f platform=all -f publish_draft=false

# 只构建两个 macOS 架构并创建 draft。
gh workflow run build-platforms.yml --ref main \
  -f platform=macos -f publish_draft=true

gh run list --workflow build-platforms.yml --limit 5
gh run watch <run-id> --exit-status
gh run download <run-id> --dir artifacts
```

构建首先复用质量工作流，验证成功后各平台并行打包，矩阵不因一个平台失败而提前取消其他平台。每个平台在原生宿主校验工具链及目标架构，准备 Electron/技能/Windows Git 与 Python，拉取锁定 OpenClaw 源码并检查其 pnpm pin。npm/pnpm 下载缓存继续保留，pnpm cache key 包含操作系统、架构、版本及上游锁文件哈希。

为减少重复插件安装，另缓存 `vendor/openclaw-plugins`，仅接受完全匹配的键：操作系统、目标及架构、Node/npm/pnpm/Electron 固定版本、OpenClaw 源 commit，以及 `package.json`、根 npm 锁文件、OpenClaw pnpm 锁文件、全部 `scripts/**` 和本地 `openclaw-extensions/**` 的哈希。没有 fallback / `restore-keys`，不跨目标复用，也不缓存完整 runtime 或已生成的安装包。恢复插件缓存后仍构建 runtime，并执行必需插件与布局校验、原生 SQLite / gateway smoke 及官方打包资源 hooks；缓存命中不表示这些门槛已通过。实际云端缓存命中率和节省时间须以后续运行记录为准。

CI 中显式可选且配置自定义 registry 的 `npm pack` 路径采用 30 秒外层时限、25 秒 fetch 时限和零次 fetch 重试；当前对应可选 POPO 插件，避免不可达 registry 让每个平台长时间等待。其余 `npm pack` 路径仍保留 180 秒时限。下载失败仍按可选插件边界警告后继续，不会把必需插件改为可选，也不改变必需插件的安装和打包校验。

runtime 与 installer 使用 `ci-build-step.cjs` 的两个固定入口；脚本先校验目标与原生宿主，再异步运行既有构建命令并实时转发输出。每 30 秒报告阶段、目标、elapsed、距最后子进程输出的秒数和 PID，结束时记录退出码、信号及耗时。心跳仅表示所监控进程的存活状态，不能换算为构建进度；静默时间本身不会触发失败，也没有增加构建总时限或自动重试。子进程失败仍使阶段失败，取消时清理 POSIX 进程组或 Windows 进程树并保留取消状态。Windows 的强制进程树清理不能保证 Bash 的 EXIT trap 执行，本机尚未实际验证 Windows 取消路径。

CI 设置 `DEBUG_DMG=true`，使 macOS DMG 的 hdiutil 生成与压缩输出可见，便于区分安装包压缩等待和 runtime 构建等待；不改变 DMG 格式或验收门槛。

Mac Intel 的大插件安全解包预算为 15 分钟，外层插件 CLI 为 20 分钟；Windows 保留同样预算，Mac ARM 和 Linux 保留上游两分钟解包、五分钟 CLI 预算。真实 Intel CI 曾在 Discord 解包两分钟时限后发生 `ENOTEMPTY`：上游安全解包的超时先返回，而逐文件合并仍在写入，随后临时目录清理覆盖了原始超时错误。本次调整 Intel 预算，并通过实际补丁应用及六种平台/架构测试校验内外时限；必需插件仍须实际安装及校验成功。

固定 Node `24.20.0` 包含 [Node 官方 Windows libuv 退出竞态修复](https://nodejs.org/en/blog/release/v24.20.0)。此前 Windows 构建已完成 Discord 安装，但最后邮件插件的 npm 子进程退出 `3221226505` / `0xC0000409` 且没有 stderr；仅凭该日志不能确定崩溃原因与官方 bug 相同。工具链升级采用含已知修复的版本，插件安装失败仍会阻止打包。

基础 runtime smoke 使用 Electron 的 Node ABI 执行 `better-sqlite3` 内存查询，并在临时独立状态目录中启动目标 OpenClaw bundle，要求 `/startupz` 返回成功且 JSON `ok: true/status: "started"`，只有 404 才回退 `/ready` 的 `ready: true`。网关插件关闭，因此该检查验证基础网关启动，不代替完整应用、启用插件、模型对话、IM 或安装后的 UI 验收。完整应用启动仍应检查 readiness 及实际会话；单纯端口可达不足以验证对话就绪。

每次 HTTP readiness 探测设置 1.5 秒绝对时限和 64 KiB（65,536 字节）响应体上限；响应中止、错误、未完整结束、超过时限的持续滴流或超量响应都返回未就绪，避免一次 `await` 绕过外层等待截止。成功 JSON 条件及仅 404 时回退的规则不变。新增的子进程与实际 HTTP 探测合同共 13 项已在本机 Node `24.20.0` 下通过（6,810 ms），覆盖心跳、真实失败、spawn error、POSIX 取消、严格 npm 解析及中止 / 滴流 / 超时等探测边界；采用新探测器的实际 Electron SQLite / gateway smoke 也已本机通过。该结果不证明 Windows 取消或云端构建速度已验证。

## 产物、校验和权限

每个平台上传 `lobsterai-<目标>` artifact，保留 **7 天**，目录包含安装包、对应 `.blockmap`（如有）、`SHA256SUMS-<目标>.txt` 和 `build-metadata-<目标>.json`。缺失或空的必需安装包会让 job 失败；元数据记录源 commit、run URL、应用/runtime/工具链版本、依赖锁文件 SHA-256、插件配置声明版本与安装状态、dsh 是否配置下载及签名状态。插件版本字段取自根 `package.json`，并非逐个读取最终插件 manifest；例如 NIM Git 来源锁定 ref `1.1.1`，该 ref 中的包 manifest 仍声明 `1.0.3`，本机实际文件和 CI 安装日志均如此。该字段不应被解读为所有最终插件 manifest 的版本实测值。

解压 artifact 后在其目录验证，例如：

```bash
# macOS
shasum -a 256 -c SHA256SUMS-mac-arm64.txt

# Linux
sha256sum -c SHA256SUMS-linux-x64.txt
```

Windows 可以用 `Get-FileHash <安装包路径> -Algorithm SHA256` 与清单比较。SHA-256 能检查下载内容是否与构建记录相符，不提供代码签名或发行者身份认证。

Release job 仅在所有**所选**目标成功后运行，会再次核对目标格式、源 commit、版本、实际大小和 SHA-256。checksum 清单必须准确覆盖全部 manifest 产物和 metadata，缺项、重复或多余项都会拒绝发布。自定义 tag 若已指向其他 commit，会拒绝挂接；已经正式发布的 Release 不会被覆盖；同 commit 的已有 draft 可更新资产。手动只选一个平台创建的新 draft 只包含该平台，不表示四个平台均已验收；复用同源已有 draft 时只替换本次同名资产，会保留其他目标的旧资产。每份资产的源 commit、run URL 和时间以各自 metadata 为准。

draft 资产不受 Actions artifact 的 7 天保留期限制，但尚未公开发布，需要以拥有仓库 push 权限的账号登录访问，参见 [GitHub Release API 文档](https://docs.github.com/en/rest/releases/releases#list-releases)。

默认 `GITHUB_TOKEN` 权限为 `contents: read`，checkout 不持久化凭据；只有 draft release job 使用 `contents: write`。安装包构建不需要 PAT、上游内部签名凭据或 Apple 凭据。第一次 push 仍需操作者拥有目标仓库写权限和 workflow 写入权限；Actions 还受仓库/组织策略及账户可用额度约束。

上游 workflow 与 Dependabot 配置快照位于 [`docs/upstream-workflows/`](upstream-workflows/)，不在可执行目录。现行三份 workflow 没有 `schedule`，不会自动发送欢迎/标签/stale 消息，不运行依赖 GitHub Advanced Security 权限的 CodeQL job，也不会自动修改上游 OpenClaw 版本。`.github/dependabot.yml` 同样已归档，本次不启用其自动依赖 PR。

GitHub 标准托管 runner 在公开仓库免费；私有仓库使用仓库所有者套餐的 Actions 分钟与 artifact 存储额度，超额依账户计费和预算策略处理，失败与重跑同样消耗时间。Windows/macOS runner 单位成本高于基础 Linux；7 天 artifact 保留降低存储积累，但不保证落在免费额度内。方案没有使用收费 larger runner；以 [GitHub Actions 计费文档](https://docs.github.com/en/billing/concepts/product-billing/github-actions) 和账户 Billing 实际显示为准，不预估用户尚未确认的套餐额度。

## 本地化与分发边界

可以跳过首次登录介绍。聊天在未登录且未配置可用用户模型时提示登录；配置 Ollama 或 LM Studio 等本地模型后有不登录使用的代码路径。Ollama 默认 `http://localhost:11434/v1`，LM Studio 默认 `http://localhost:1234/v1`，均不要求真实 API Key；OpenClaw 网关会获得应用补入的占位 Key。vLLM 可作为自定义 OpenAI 兼容 provider 接入，自定义 provider 当前要求非空 Key，无鉴权服务可填写占位值。模型权重和推理服务不随桌面包分发，工具调用、图像能力、流式输出与上下文上限必须按实际模型验证。

| 边界 | 原样自编译行为 |
| --- | --- |
| 默认 Agent | 本机 OpenClaw bundle 随安装包分发，gateway 默认 loopback，采用本机 token 鉴权 |
| 官方账号、套餐模型、商城、云分享/站点发布 | 仍依赖有道业务 API、账号或额度；没有配套服务端私有部署方案 |
| 使用统计 | `usageAnalyticsEnabled` 默认开启，可在设置关闭；统计 endpoint 为 `rlogs.youdao.com` |
| 更新 | 仍自动查询有道上游更新；本仓库的 GitHub Release 不会自动成为应用更新源 |
| dsh | 默认主 Agent 之外的可选实验工作台，首次启用需要下载 CDN archive 并验证摘要；本次 Linux 目标没有上游 dsh 下载描述 |
| 网络搜索 | 内置 web-search 本地桥接使用系统已有 Chrome/Edge/Chromium，并访问 Bing/Google；缺少浏览器时需用户安装 |
| IM / 外部 MCP / 媒体及语音服务 | 依具体平台及 provider 依赖外部网络、配置、凭据或额度 |
| 离线构建 | Git、npm/pnpm、Electron、OpenClaw、插件与运行时下载需要网络或预备镜像；可用不等于全部外部资产已随源码保存 |

`package.json` 中 POPO、NIM 插件显式 `optional: true`，相关 registry/Git 下载失败可警告后继续，本次打包修复使该行为贯穿安装包检查。缺失可选插件的构建不保证对应 IM 功能；必需插件、关键扩展或 bundle 缺失仍会失败，不能为了得到 artifact 跳过必需校验。

自编译分发仍保留 `LobsterAI`、`com.lobsterai.app` 与 `appData/LobsterAI` 用户数据目录。官方安装版与源码运行可能共享 SQLite、会话、配置和 OpenClaw 状态，也可能互相触发单实例限制；验收应使用隔离测试环境，并在操作既有数据前备份。新的 GitHub 仓库名、artifact 名或 tag 不会隔离应用身份。

上游首次桌面启动默认注册开机登录项，独立应用数据目录不会隔离系统登录项。本次源码启动检查结束后，已移除工作目录内测试 Electron 的登录项；未调整正式安装应用的登录项。

Windows NSIS 沿用上游安装行为：安装期间尝试添加安装目录的 Defender 排除，完成后改为部分 runtime 目录和大文件路径，卸载时清理；传入 `/NoDefenderExclusion` 可跳过新增排除。相关实现见 [`scripts/nsis-installer.nsh`](../scripts/nsis-installer.nsh)。本次只生成安装器，未在本机或 CI 执行该安装器。

CI 关闭 macOS 签名身份自动发现，不传 Apple 或 Windows 内部签名凭据。Windows 签名 hook 缺 `YD_SIGN_*` 会跳过；macOS 缺 Apple 凭据跳过公证。产物因此标记为**未签名、未 Apple 公证**，操作系统可能提示来源或安全检查，不能将其称为官方签名包。正式发行的代码签名、公证、证书保管及应用内独立更新源需要后续单独接入。保留上游更新渠道时，后续官方更新可能替换自编译版本及本次改动。

## 验证记录

记录日期：2026-10-10，Asia/Shanghai。本机最终代码编译及测试在 macOS arm64 上使用 Node `24.20.0`、npm `11.17.0`、pnpm `12.1.0` 完成；初次依赖安装、完整 runtime 和本机 DMG 使用 Node `24.15.0`，各产物以自身元数据为准。下表区分本次真实完成结果与尚未完成的验证；GitHub 矩阵状态是本次记录时的快照，后续由实际执行者补齐最终结果。

| 验证项 | 当前状态 | 证据 / 后续记录 |
| --- | --- | --- |
| 上游最新发布 tag 与 commit | 已核验 | `2026.9.23` / `791a352dee3b3d8c6f64edcaf229ce474a68f6c5`，见 `UPSTREAM.md` |
| Git 对象完整性 | 已通过 | `git fsck --full --no-dangling` exit 0；发布 tag 指向已核验的上游 commit |
| 本机 `npm ci` | 已通过 | 固定 Node `24.15.0` / npm `11.17.0` / pnpm `12.1.0`，已生成并使用提交的 npm 锁文件 |
| 本机 `npm run build` | 已通过 | Node `24.20.0` 下 Renderer、thumbnail 生产构建完成 |
| 本机 `npm run compile:electron` | 已通过 | Node `24.20.0` 下 Main 与 preload 编译完成 |
| OpenClaw 打包插件定向测试 | 已通过 | 9 项测试通过，其中本次新增 2 项，必需/可选边界覆盖 |
| 本机完整 `npm test` | 最终重跑通过 | 523 suites passed、16 skipped；5,611 tests passed、148 skipped，共 5,759 tests；63.15 秒（Node `24.20.0`）。初次受沙箱 `EPERM` / `EMFILE`、Electron 未下载、OpenClaw 未 patch 等影响失败，修复环境与 fixture 后重跑完成；skipped 项未验证 |
| 锁式技能构建与编译输出 gate | 已通过 | `ci-prepare-skills.cjs` 与 `ci-verify-output.cjs` |
| CI workflow / 脚本静态检查 | 已通过 | `actionlint 1.7.12` 检查三份现行 workflow 通过；Node 脚本语法检查通过 |
| 改动 TypeScript lint | 首次 GitHub CI 质量门槛通过 | 质量 job 包含 `ci-lint-changed.cjs`，按改动文件检查；未宣称全仓库历史 lint 已清零 |
| 本机完整 OpenClaw runtime 构建 | 已通过 | `mac-arm64` / OpenClaw `v2026.8.1` 完整构建成功；17 个插件已安装且通过打包结构校验，未验证真实 IM 功能。可选 `moltbot-popo` 因第三方 registry timeout 跳过，本次产物不保证 POPO 功能 |
| 本机基础 runtime smoke | 已通过 | Electron Node ABI 下 SQLite 查询成功；`plugins.enabled=false` 的独立 gateway startup/readiness smoke 通过；不代替插件或模型功能验收 |
| 本机桌面启动与完整应用网关 | 已通过启动验证 | 真实 Electron 窗口成功加载本地 `dist/index.html`（`file://`）；跳过登录后欢迎会话 UI 可见。应用 gateway 为 `running`，loopback `18789`，启动用时 3,527 ms；实际 `/startupz` HTTP 200 返回 `ok: true`、`status: "started"` |
| 本地模型聊天与工具调用 | 未执行 | 按用户要求不验证模型；没有实际模型聊天及工具调用结果，尚不能宣称完整离线 Agent 已验证 |
| Windows installer patches | 本机契约测试已通过 | 修复后 52 项通过；实际归档/解包与恢复相关 3 suites 共 110 项通过；Windows CI 在打包前仍须重新执行 `npm run verify:installer-patches` |
| 本机 macOS arm64 DMG 打包及收集 | 已通过 | 样本源码 `f983e6fb0acc88d664173c4c981ac65f5d373f88`、Node `24.15.0`，与最终云端源码 `55b616ff` / Node `24.20.0` 区分；打包与 `ci-collect-artifacts.cjs` 均 exit 0，已收集 DMG、SHA-256 清单与构建元数据；`shasum -c` 全部通过，`hdiutil verify` 报告有效；未签名、未公证 |
| 安装包安装后 UI / 安装卸载验收 | 本次未执行 | 本机源码桌面启动与 DMG 生成不等同于安装包安装后的验收；该记录不宣称各平台已完成安装、卸载及安装后 UI 验收 |
| 旧尝试 GitHub Actions 质量 job | 已通过，打包随后主动取消 | [Build Platforms run 38030285389](https://github.com/yeruyi1024/novapath-workspace/actions/runs/38030285389) 的质量检查为 `success`；522 suites passed、16 skipped；5,571 tests passed、163 skipped（共 5,734），113.63 秒。不同宿主跳过的平台测试数量不同 |
| 中间尝试 GitHub Actions 质量 job | 已通过 | [run 38031661849](https://github.com/yeruyi1024/novapath-workspace/actions/runs/38031661849)：522 suites passed、16 skipped；5,581 tests passed、163 skipped（共 5,744），115.63 秒；quality job 墙钟 5 分 43 秒 |
| 最终修正 GitHub Actions 质量 job | 已通过 | [run 38035150205](https://github.com/yeruyi1024/novapath-workspace/actions/runs/38035150205)：523 suites passed、16 skipped；5,587 tests passed、163 skipped（共 5,750），119.37 秒；quality job 墙钟 5 分 42 秒 |
| 首次 GitHub 四目标打包 | 新同源构建进行中 | Intel 时限与 Node 工具链修复源 commit `55b616fff1085e9675d32348bf7bdb6fe82f42ce`；[完整构建 run 38035150205](https://github.com/yeruyi1024/novapath-workspace/actions/runs/38035150205) 已通过质量门槛，四原生平台均已启动。此前 `38031661849` 的 Mac ARM/Linux 成功但 Intel/Windows runtime 失败、draft 被阻止；`38030285389` 因审计发现 Windows 资源遗漏主动取消，均不作为四目标成功证据 |
| Intel 插件解包时限与补丁合同 | 已通过 | 实际 patch apply/check/reverse、六种平台/架构及显式 timeout 覆盖；新增 suite 与既有插件安装 suite 共 24 tests passed，既有升级补丁合同也已同步并在完整回归通过 |
| draft release 严格校验 fixture | 已通过 | 成功案例及 10 个拒绝案例通过；manifest 产物及 metadata 缺 checksum、错误 hash/size、重复或多余 checksum 项会在任何 gh 调用前失败 |
| 首次 draft release / checksum 复核 | 待补 | 若启用 `publish_draft`，记录 draft URL、tag、对应源 commit 和校验结果 |

完整应用启动的 readiness 合同为 `/startupz` 返回 HTTP 成功、JSON `ok: true` 且 `status: "started"`；只有该路径返回 404 时才兼容 `/ready` 的 `ready: true`。默认端口为 18789，冲突时扫描备用端口，应记录实际使用端口。主日志的启动参数可能含 gateway token，保存截图或日志证据前应脱敏，不把账号 Key、token 或带凭据的 URL 提交到仓库。
