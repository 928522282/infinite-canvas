# Infinite Canvas Codex Plugin

让 Codex 可以打开并操作 Infinite Canvas。

## 安装

直接从 GitHub 安装发布版：

```bash
codex plugin marketplace add 928522282/infinite-canvas --ref v0.18.1
codex plugin add infinite-canvas@infinite-canvas-local
```

如需检出源码：

```bash
git clone --branch v0.18.1 https://github.com/928522282/infinite-canvas.git
cd infinite-canvas
codex plugin marketplace add .
codex plugin add infinite-canvas@infinite-canvas-local
```

仓库和插件不包含 API Key。画布中配置的服务密钥只保存在用户自己的浏览器本地，不随插件发布或同步。

Windows 版插件使用 Codex 自带 Node 启动内嵌 Canvas Agent，不要求任务环境另外安装或配置 Node、npm、npx。

安装后新建一个 Codex 任务，然后输入：

```text
帮我打开并连接到 Infinite Canvas
```
