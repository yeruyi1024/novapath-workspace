# 星途 StarPath

A desktop workspace for an aggregated model platform: tasks, files, models, tools, automations, and artifact previews.

See [中文开发与产品配置说明](README_zh.md).

## Projects and files

The sidebar supports projects, independent chats, project editing, and conversation grouping. Folder paths are validated before saving and starting a project conversation. Removing a project preserves its chats and local files. Regrouping an existing chat does not change its working directory.

Click a file reference or artifact card in a conversation to preview it on the right, including PPTX, PDF, DOCX, spreadsheets and images. Relative paths resolve against that conversation's working directory. PPTX previews include slide navigation and zoom; legacy .ppt files use the system application. PowerPoint animation fidelity is not guaranteed.

## Development

Requires Node.js `>=24.15.0 <25` and npm `>=11.17.0 <12`.

```bash
npm ci
npm run electron:dev
```

Task execution requires the OpenClaw runtime (`npm run openclaw:runtime:host`). Use `npm test`, `npm run build`, and `npm run compile:electron` for validation.

## Distribution settings

`src/shared/product/product.json` is the public brand and service configuration. Upstream account, marketing, update, marketplace, and telemetry destinations are disabled by default. Connect a New API / OpenAI-compatible gateway using custom model settings.

The desktop account API is distinct from the model inference API. Account login, billing, hosted publishing, and marketplace services require a backend adapter before their feature flags can be enabled. Never store credentials in the product configuration.

## Attribution

Based on LobsterAI, with OpenClaw as the agent runtime. The upstream MIT license is retained in `LICENSE` and included in packaged distributions. Third-party licenses remain applicable. Historical protocol, storage, provider, and migration identifiers are retained for compatibility.
