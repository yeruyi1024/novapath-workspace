# 记忆设置只保留条目管理

用户要求删除记忆设置中的 Embedding 语义搜索入口。记忆页直接显示条目工具栏、搜索和列表，去掉标签切换状态和对应渲染；新增、编辑、删除、展开和原文编辑复用原有实现。已有记忆数据、保存路径和底层检索配置保留。

状态：已完成。Node 24.21.0 下 Settings.tsx ESLint 通过，npm run build 通过，settingsEscape、openclawMemoryPolicy、openclawMemoryFile 共 61 项测试通过。macOS arm64 / Electron 43.5.0 隔离生产客户端确认无标签栏、空状态正常、新增记忆可保存并显示，编辑弹窗可打开并取消；深色截图见 docs/pr-screenshots/2026-10-12/memory-only-dark.png。测试登录状态使用隔离验证桩，记忆操作走真实 IPC 和临时数据目录。隔离客户端已请求正常退出。浅色、窄窗口、最终删除、Windows/Linux 及 GitHub CI 未在本轮复验。用户客户端没有重启，未提交或推送。
