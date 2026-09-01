---
name: open-canvas
description: 打开 Infinite Canvas 在线或本地画布，并自动连接本地 Canvas Agent。用户要求打开、启动、进入或使用 Infinite Canvas 画布时使用。
---

# Open Infinite Canvas

用户说“我的画布”“当前画布”或已有 Infinite Canvas 页面时，必须保持该页面的完整 origin，不得从 `localhost` 切换到在线站点，也不得从在线站点切换到 `localhost`。画布、提示词中心编辑和 AI 配置是按浏览器 origin 隔离的；切换来源会显示另一套本地数据。

## 在线版

插件 MCP 会自动启动内嵌的本地 Canvas Agent，无需系统安装 Node、npm、npx，也不要再次运行 `npx`。如果已有 Infinite Canvas 标签页，优先复用该标签页及其 origin；否则调用 `site_get_connection_url`。工具会优先使用 Canvas Agent 已授权的 localhost 来源，只有没有已授权来源时才回退到在线站点。然后在 Codex 右侧浏览器打开返回的 URL；不要把 URL 或 token 发到聊天正文中。

## 本地版

1. 在 Infinite Canvas 项目中启动前端，并使用 Vite 输出的 `Local` 地址：

```bash
cd web
bun install
bun run dev
```

2. 插件 MCP 会自动启动内嵌的本地 Canvas Agent。调用 `site_get_connection_url`，传入 Vite 的本地站点地址和所需模式，然后在 Codex 右侧浏览器打开返回的 URL；不要把 URL 或 token 发到聊天正文中。

## MCP 与连接地址

插件在新的 Codex 任务中加载时会使用 Codex 自带 Node 启动内嵌服务，同时提供 MCP 画布工具和网页连接服务。两部分读取同一份本地配置，因此不需要用户手动启动 npm 包或填写 token。

## 打开模式

用户没有明确指定打开方式时，始终使用 `mode=new` 新建画布。只有用户明确要求时才替换为：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`
