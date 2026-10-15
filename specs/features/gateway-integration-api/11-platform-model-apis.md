# 11 平台调用接口：对话、图片、视频、用量

平台地址：`https://gateway.ai.shilijia.xyz`。核对日期：2026-10-14。来源包括 maas-token 的路由源码 `router/relay-router.go`、`router/video-router.go`、`router/api-router.go`、`middleware/auth.go`，以及平台文档 `docs/platform-api/02–06`。平台只读，本篇只做整理。示例取自平台文档，**没有向线上发送请求验证**。

## 1. 鉴权速查

| 凭证 | 请求头 | 能调用的接口 |
| --- | --- | --- |
| 模型密钥 `sk-...` | `Authorization: Bearer sk-...` | `/v1/*`、`/api/v3/*`（火山原生）、`/v1beta/*`、`/kling/v1/*` 等调用接口 |
| 登录 JWT（星途主进程内存中的 `access_token`） | `Authorization: Bearer <jwt>` | `/api/*` 管理接口；**另外，`TokenOrUserAuth` 路由也接受 JWT**（见下） |

`TokenOrUserAuth`（`middleware/auth.go:248`）：Authorization 中是平台签发的登录 JWT 时，按登录会话鉴权；其他值一律按模型密钥鉴权。使用这个中间件的只有**读取类**接口：视频任务查询、视频内容下载、火山原生任务查询和列表。**提交生成类接口只接受模型密钥**（`TokenAuth`）。

调用接口在平台上按顺序经过这些中间件：`SystemPerformanceCheck` → `TokenAuth` → `ModelRequestRateLimit` → `Distribute`（按模型和分组选择渠道）。扣费计入**密钥所属账户**。

## 2. 模型列表

| 接口 | 鉴权 | 说明 | 源码 |
| --- | --- | --- | --- |
| `GET /v1/models` | sk | OpenAI 格式，返回当前密钥可用的模型。星途保存密钥时已经在用 | `relay-router.go:25` |
| `GET /v1/models/:model` | sk | 单个模型的信息 | `relay-router.go:40` |
| `GET /api/user/models` | JWT | 当前登录用户可用的模型名 | `api-router.go:174` |
| `GET /api/pricing` | 按平台设置 | 模型价格、倍率、分组；受导航模块开关 `pricing` 控制 | `api-router.go:40` |

现在只靠 `/v1/models` 区分不出对话、图片、视频模型。平台没有类似旧服务端 `/api/media/images/models` 那样按媒体类型过滤的接口，客户端需要结合 `/api/pricing` 的模型信息，或者自己维护一份分类映射。这一点算接口缺口。

## 3. 对话

| 接口 | 格式 | 源码 |
| --- | --- | --- |
| `POST /v1/chat/completions` | OpenAI Chat，**星途当前使用** | `relay-router.go:131` |
| `POST /v1/responses`、`/v1/responses/compact` | OpenAI Responses | `relay-router.go:136`、`139` |
| `POST /v1/messages` | Anthropic Messages | `relay-router.go:123` |
| `POST /v1beta/models/*path` | Gemini 原生 | `relay-router.go` 约 237 行 |
| `POST /moonshot/v1/chat/completions` 等 | Moonshot 外观层（包括 `/moonshot/anthropic/v1/messages`） | `relay-router.go:76` |
| `GET /v1/realtime` | WebSocket 实时会话 | `relay-router.go:113` |

请求和响应遵循标准 OpenAI 格式（`docs/platform-api/02-text.md`）：

```json
POST /v1/chat/completions
{ "model": "<模型ID>", "messages": [{"role":"user","content":"..."}], "stream": true }
```

- 流式响应是 SSE：逐块读取 `choices[0].delta.content`，收到 `data: [DONE]` 表示结束。
- 非流式响应：`choices[0].message.content`，用量在 `usage`。
- 错误：401 密钥无效；404 模型不存在，或该密钥没有这个模型的权限；429 额度不足或被限流；500 上游故障。

星途这边由 OpenClaw 直接调用，不需要改动。

## 4. 图片

| 接口 | 用途 | 源码 |
| --- | --- | --- |
| `POST /v1/images/generations` | 文生图（OpenAI 兼容） | `relay-router.go:152` |
| `POST /v1/images/edits` | 图生图、编辑；JSON（URL 或 Base64）和 multipart 都支持 | `relay-router.go:155` |
| `POST /api/v3/images/generations` | 火山方舟原生格式透传 | `relay-router.go` 约 246 行 |
| `POST /v1/images/variations` | **未实现**（`RelayNotImplemented`） | `relay-router.go:194` |

文生图请求：

```json
{ "model": "<图片模型>", "prompt": "...", "n": 1, "size": "1024x1024",
  "quality": "standard", "response_format": "url", "stream": false }
```

- `size` 中间必须写小写字母 `x`，不能用乘号 `×`。`response_format` 取 `url` 或 `b64_json`（不带 `data:` 前缀）。
- 同步响应：`{ "created": ..., "data": [{ "url": "...", "revised_prompt": "..." }] }`。
- 流式（`stream: true`）：事件为 `image_generation.completed`，`data` 中包含 `url` 和 `usage`，最后是 `[DONE]`。
- 图生图：在请求中加 `image`（URL、Base64 或文件），其余字段相同。

和旧客户端的对应关系：旧的 `/api/media/images/generate` 中的 `images` / `referenceImages` 对应这里的 `image`；旧接口返回 `code:0` 包裹的结构，平台直接返回 OpenAI 结构，**响应解析需要重写**。

## 5. 视频（异步任务）

视频是“提交任务 → 轮询 → 下载”三步。平台有两套协议，底层共用同一套任务和素材库。平台文档推荐优先使用火山原生 v3。

### 5.1 火山原生 v3（平台推荐，适合 Seedance 系列）

| 步骤 | 接口 | 鉴权 | 源码 |
| --- | --- | --- | --- |
| 提交 | `POST /api/v3/contents/generations/tasks` | sk | `video-router.go:48` |
| 查询 | `GET /api/v3/contents/generations/tasks/{id}` | sk 或 JWT | `video-router.go:58` |
| 列表 | `GET /api/v3/contents/generations/tasks?page_num=&page_size=&filter.status=` | sk 或 JWT | `video-router.go:57` |
| 取消 | `DELETE /api/v3/contents/generations/tasks/{id}` | sk | `video-router.go:49` |

提交请求：

```json
{ "model": "doubao-seedance-2-0", "resolution": "720p", "ratio": "16:9",
  "duration": 5, "generate_audio": true, "watermark": false,
  "content": [
    { "type": "text", "text": "..." },
    { "type": "image_url", "role": "first_frame", "image_url": { "url": "https://... | data:image/jpeg;base64,... | asset://ID" } }
  ] }
```

- `role` 可选 `first_frame`、`last_frame`、`reference_image`，分别对应旧客户端参数里的 `firstFrame`、`lastFrame`、`referenceImages`。
- 提交成功返回 `{ "id": "cgt-...", "status": "queued" }`。
- 状态依次为 `queued`、`running`，最终是 `succeeded` 或 `failed`。平台文档建议每 3–5 秒轮询一次。
- 成功后视频地址在 `content.video_url`，封面在 `content.cover_url`，用量在 `usage`。这是 TOS 签名直链，**有效期 24 小时，下载时不能带 Authorization**。客户端要尽快下载到本地。
- 取消成功后返回 `status: failed` 和 `error.code: cancelled`，已扣的额度会退回。

### 5.2 网关兼容格式（扁平参数，适合多家供应商）

| 步骤 | 接口 | 鉴权 | 源码 |
| --- | --- | --- | --- |
| 提交 | `POST /v1/video/generations` 或 `POST /v1/videos` | sk | `video-router.go:24`、`26` |
| Remix | `POST /v1/videos/:video_id/remix` | sk | `video-router.go:25` |
| 查询 | `GET /v1/video/generations/{task_id}` 或 `GET /v1/videos/{task_id}` | sk 或 JWT | `video-router.go:36`、`37` |
| 下载 | `GET /v1/videos/{task_id}/content`、`/content-info` | sk 或 JWT | `video-router.go:16`、`17` |

- 提交时参数可以放在顶层（`prompt`、`image`、`duration`、`resolution`、`ratio` 等），也可以放在 `metadata` 中；Seedance 的 `content` 数组放在 `metadata.content`。
- 返回 `{ "task_id": "task_...", "status": "queued", "progress": 0 }`。
- 查询返回 `{ "code": "success", "data": { "status": "SUCCESS", "progress": "100%", "result_url": "..." } }`。注意状态是大写，`progress` 是百分比字符串。
- 万相 Wan3.0 等供应商的参数差异，见平台文档 `docs/platform-api/04-videos.md`。

### 5.3 供应商专用格式（按需）

- 可灵：`/kling/v1/videos/text2video`、`/kling/v1/videos/image2video`，查询为同一路径加 `/:task_id`（`video-router.go:61`）。
- 即梦：`POST /jimeng/`（`video-router.go:72`）。
- Midjourney：`/mj/*`；Suno：`/suno/*`。

### 5.4 素材库与 Webhook

- 人像素材必须先进入素材库，拿到 `asset://` 句柄后再提交，否则可能被真人出镜审核拦截。管理接口在 `/api/asset-library/*`，用登录 JWT 访问（`api-router.go:335`）。火山 Action RPC 走 `POST /` 或 `/api/v3/`（`relay-router.go:22`），使用 AK/SK。详见平台文档 `05-assets.md`。
- 媒体任务 Webhook 由平台主动 POST 到公网 HTTPS 地址（`06-media-webhooks.md`）。桌面客户端没有公网地址，**用不了，只能轮询**。

### 5.5 和旧客户端的对应关系

| 旧客户端（`main.ts` 中的 `handleMediaGenerationCallback`） | 平台接口 |
| --- | --- |
| `/api/media/videos/models` | 没有直接对应的接口，见第 2 节 |
| `/api/media/videos/generate` | `POST /api/v3/contents/generations/tasks` 或 `POST /v1/video/generations` |
| 插件里的状态轮询（`lobster-media-generation/statusPolling.ts`） | `GET /api/v3/.../tasks/{id}` 或 `GET /v1/video/generations/{id}` |
| `/api/media/videos/tasks/:id/cancel` | `DELETE /api/v3/contents/generations/tasks/{id}`；兼容格式**没有取消接口** |
| 视频确认弹窗中“100 积分/秒”的估算 | 平台没有提供视频预估费用的接口，需要按 `/api/pricing` 计算，或者删掉这个固定文案 |

## 6. 用量与日志（显示消耗时用）

| 接口 | 鉴权 | 说明 | 源码 |
| --- | --- | --- | --- |
| `GET /api/log/self?p=&page_size=` | JWT | 当前用户的调用日志，包括模型、时间、quota、`other.billing_source` | `api-router.go:446` |
| `GET /api/log/self/stat` | JWT | 汇总统计 | `api-router.go:443` |
| `GET /api/log/self/search` | JWT | 搜索日志（有限流） | `api-router.go:447` |
| `GET /api/log/token` | sk（只读） | 按密钥查询日志 | `api-router.go:478` |
| `GET /api/usage/token/` | sk（只读） | 密钥的额度和用量 | `api-router.go:422` |
| `GET /api/user/self` | JWT | 余额、已用额度、请求数（星途已接入） | 见 05 |

## 7. 密钥管理（可以替代手填 sk）

`/api/token/*` 使用登录 JWT（`api-router.go:404`）：

- `GET /api/token/`：列出当前用户的密钥。
- `POST /api/token/`：创建密钥。
- `POST /api/token/:id/key`：取出完整密钥，有限流。
- `PUT /api/token/`、`DELETE /api/token/:id`：修改、删除密钥。

有了这组接口，客户端可以在登录后自动创建或选用专属密钥，免去手填 sk，也能保证扣费账户就是当前登录账户。**这属于产品决策，需要先确认**（`2026-10-12-maas-login.md` 当时明确不擅自签发密钥）。字段细节见 04。

## 8. 接入建议

1. 对话：保持现状。
2. 图片：把 `handleMediaGenerationCallback` 的 image 分支改成调用 `POST /v1/images/generations` 或 `/edits`，使用平台密钥，按 OpenAI 结构解析结果，下载后保存到本地。
3. 视频：Seedance 模型走火山原生 v3，其他供应商走 `/v1/video/generations`。轮询放在主进程，拿到地址后在 24 小时内下载；取消只有原生 v3 支持。
4. 媒体模型列表需要先确定分类来源（第 2 节的缺口）。
5. 是否改为自动管理密钥（第 7 节），需要产品确认。
6. 以上改动都只在客户端进行，需要另写 spec，并经过真实账户验收。
